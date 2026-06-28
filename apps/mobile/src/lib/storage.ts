import { decode } from 'base64-arraybuffer'
import * as FileSystem from 'expo-file-system/legacy'

import { apiBaseUrl } from './apiClient'
import { supabase } from './supabaseClient'
import type { Recipe, RecipeFolder } from '../types/recipe'

const bucketName = 'recipe-images'
const r2Prefix = 'r2:'
const maxImageBytes = 10 * 1024 * 1024
const requestTimeoutMs = 30_000
const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])

export const getLegacyPublicImageUrl = (path: string) =>
  path.startsWith(r2Prefix) ? '' : supabase.storage.from(bucketName).getPublicUrl(path).data.publicUrl

export interface LocalImageAsset {
  uri: string
  fileName?: string | null
  mimeType?: string | null
}

type ImageApiError = { error?: { message?: string } }

const withTimeout = async (input: string, init: RequestInit) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('이미지 서버 응답 시간이 초과되었습니다.')
    throw new Error('이미지 서버에 연결하지 못했습니다.')
  } finally {
    clearTimeout(timeout)
  }
}

const getAccessToken = async () => {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session?.access_token) throw new Error(error?.message || '로그인이 필요합니다.')
  return data.session.access_token
}

const readApiJson = async <T>(response: Response): Promise<T> => {
  const body = await response.json().catch(() => ({})) as T & ImageApiError
  if (!response.ok) throw new Error(body.error?.message || '이미지 요청을 처리하지 못했습니다.')
  return body
}

const toR2Locator = (path: string) => `${r2Prefix}${path}`
const fromR2Locator = (path: string) => path.slice(r2Prefix.length)
const isR2Locator = (path: string) => path.startsWith(r2Prefix)

const uploadImage = async (userId: string, resourceId: string, asset: LocalImageAsset, folder = 'cover') => {
  const info = await FileSystem.getInfoAsync(asset.uri)
  if (!info.exists) throw new Error('선택한 이미지 파일을 찾을 수 없습니다.')
  if (typeof info.size === 'number' && info.size > maxImageBytes) throw new Error('이미지는 10MB 이하만 업로드할 수 있습니다.')
  const mimeType = (asset.mimeType || 'image/jpeg').toLowerCase()
  if (!allowedMimeTypes.has(mimeType)) throw new Error('JPEG, PNG, WebP, HEIC 이미지만 업로드할 수 있습니다.')

  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 })
  const bytes = decode(base64)
  if (bytes.byteLength > maxImageBytes) throw new Error('이미지는 10MB 이하만 업로드할 수 있습니다.')
  const response = await withTimeout(`${apiBaseUrl}/api/images`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getAccessToken()}`,
      'Content-Type': mimeType,
      'X-Resource-Id': resourceId,
      'X-Image-Folder': folder,
    },
    body: bytes,
  })
  const result = await readApiJson<{ path: string; url: string }>(response)
  return { path: toR2Locator(result.path), url: result.url }
}

export const uploadRecipeImage = (userId: string, recipeId: string, asset: LocalImageAsset) =>
  uploadImage(userId, recipeId, asset, 'cover')

export const uploadRecipeStepImage = (userId: string, recipeId: string, asset: LocalImageAsset, stepIndex: number) =>
  uploadImage(userId, recipeId, asset, `steps/${stepIndex + 1}`)

export const uploadCategoryImage = (userId: string, asset: LocalImageAsset) =>
  uploadImage(userId, `categories-${Date.now()}`, asset, 'cover')

const getR2SignedUrls = async (locators: string[], accessToken: string) => {
  if (!locators.length) return new Map<string, string>()
  const results = await Promise.all(locators.map(async (locator) => {
    const path = fromR2Locator(locator)
    const response = await withTimeout(`${apiBaseUrl}/api/images?path=${encodeURIComponent(path)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const result = await readApiJson<{ url: string }>(response)
    return [locator, result.url] as const
  }))
  return new Map(results)
}

const resolveImageUrls = async (paths: string[]) => {
  const uniquePaths = [...new Set(paths.filter(Boolean))]
  const r2Paths = uniquePaths.filter(isR2Locator)
  const supabasePaths = uniquePaths.filter((path) => !isR2Locator(path))
  const accessToken = r2Paths.length ? await getAccessToken().catch(() => '') : ''
  const [r2Urls, supabaseResult] = await Promise.all([
    accessToken
      ? getR2SignedUrls(r2Paths, accessToken)
      : new Map<string, string>(),
    supabasePaths.length
      ? supabase.storage.from(bucketName).createSignedUrls(supabasePaths, 86_400)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (supabaseResult.error) throw new Error(`이미지 주소 발급 실패: ${supabaseResult.error.message}`)
  for (const item of supabaseResult.data || []) if (item.path && item.signedUrl) r2Urls.set(item.path, item.signedUrl)
  return r2Urls
}

export const hydrateRecipeImagesBatch = async (recipes: Recipe[]): Promise<Recipe[]> => {
  const urls = await resolveImageUrls(recipes.flatMap((recipe) => [recipe.image_path, ...recipe.step_image_paths]))
  return recipes.map((recipe) => ({
    ...recipe,
    image_url: recipe.image_path ? urls.get(recipe.image_path) || '' : recipe.image_url,
    step_images: Array.from({ length: Math.max(recipe.step_images.length, recipe.step_image_paths.length) }, (_, index) => {
      const path = recipe.step_image_paths[index]
      return path ? urls.get(path) || '' : recipe.step_images[index] || ''
    }),
  }))
}

export const hydrateRecipeImages = async (recipe: Recipe): Promise<Recipe> => {
  return (await hydrateRecipeImagesBatch([recipe]))[0]
}

export const hydrateFolderImages = async (folders: RecipeFolder[]): Promise<RecipeFolder[]> => {
  const locators = [...new Set(folders.map((folder) => folder.image_url || '').filter(isR2Locator))]
  if (!locators.length) return folders
  const urls = await resolveImageUrls(locators)
  return folders.map((folder) => {
    const locator = folder.image_url || ''
    return isR2Locator(locator) ? { ...folder, image_path: locator, image_url: urls.get(locator) || '' } : folder
  })
}

export const deleteImagePaths = async (paths: Array<string | null | undefined>) => {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))]
  const r2Paths = uniquePaths.filter(isR2Locator).map(fromR2Locator)
  const supabasePaths = uniquePaths.filter((path) => !isR2Locator(path))
  const results = await Promise.all([
    r2Paths.length
      ? withTimeout(`${apiBaseUrl}/api/images`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: r2Paths }),
        }).then(readApiJson)
      : Promise.resolve(),
    supabasePaths.length ? supabase.storage.from(bucketName).remove(supabasePaths) : Promise.resolve({ error: null }),
  ])
  const supabaseResult = results[1] as { error: { message: string } | null }
  if (supabaseResult.error) throw new Error(`이미지 정리 실패: ${supabaseResult.error.message}`)
}
