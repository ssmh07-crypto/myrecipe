import { decode } from 'base64-arraybuffer'
import * as FileSystem from 'expo-file-system/legacy'

import { supabase } from './supabaseClient'
import type { Recipe } from '../types/recipe'

const bucketName = 'recipe-images'
const maxImageBytes = 10 * 1024 * 1024
const allowedMimeTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif'],
])

export const getLegacyPublicImageUrl = (path: string) =>
  supabase.storage.from(bucketName).getPublicUrl(path).data.publicUrl

export interface LocalImageAsset {
  uri: string
  fileName?: string | null
  mimeType?: string | null
}

const getImageType = (asset: LocalImageAsset) => {
  const mimeType = (asset.mimeType || 'image/jpeg').toLowerCase()
  const extension = allowedMimeTypes.get(mimeType)
  if (!extension) throw new Error('JPEG, PNG, WebP, HEIC 이미지만 업로드할 수 있습니다.')
  return { mimeType, extension }
}

const uploadImage = async (userId: string, recipeId: string, asset: LocalImageAsset, folder = 'cover') => {
  const info = await FileSystem.getInfoAsync(asset.uri)
  if (!info.exists) throw new Error('선택한 이미지 파일을 찾을 수 없습니다.')
  if (typeof info.size === 'number' && info.size > maxImageBytes) throw new Error('이미지는 10MB 이하만 업로드할 수 있습니다.')
  const { mimeType, extension } = getImageType(asset)
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 })
  const randomPart = `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const path = `${userId}/${recipeId}/${folder}/${randomPart}.${extension}`
  const { error } = await supabase.storage
    .from(bucketName)
    .upload(path, decode(base64), {
      cacheControl: '3600',
      contentType: mimeType,
      upsert: false,
    })

  if (error) throw new Error(`이미지 업로드 실패: ${error.message}`)

  const { data, error: signError } = await supabase.storage.from(bucketName).createSignedUrl(path, 86_400)
  if (signError) throw new Error(`이미지 URL 생성 실패: ${signError.message}`)
  return { path, url: data.signedUrl }
}

export const uploadRecipeImage = (userId: string, recipeId: string, asset: LocalImageAsset) =>
  uploadImage(userId, recipeId, asset, 'cover')

export const uploadRecipeStepImage = (userId: string, recipeId: string, asset: LocalImageAsset, stepIndex: number) =>
  uploadImage(userId, recipeId, asset, `steps/${stepIndex + 1}`)

export const hydrateRecipeImages = async (recipe: Recipe): Promise<Recipe> => {
  const paths = [recipe.image_path, ...recipe.step_image_paths].filter(Boolean)
  if (!paths.length) return recipe

  const { data, error } = await supabase.storage.from(bucketName).createSignedUrls(paths, 86_400)
  if (error) return recipe
  const signedUrls = new Map((data || []).filter((item) => item.signedUrl).map((item) => [item.path, item.signedUrl]))
  return {
    ...recipe,
    image_url: recipe.image_path ? signedUrls.get(recipe.image_path) || '' : recipe.image_url,
    step_images: Array.from({ length: Math.max(recipe.step_images.length, recipe.step_image_paths.length) }, (_, index) => {
      const url = recipe.step_images[index] || ''
      const path = recipe.step_image_paths[index]
      return path ? signedUrls.get(path) || '' : url
    }),
  }
}

export const deleteImagePaths = async (paths: Array<string | null | undefined>) => {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))]
  if (!uniquePaths.length) return
  const { error } = await supabase.storage.from(bucketName).remove(uniquePaths)
  if (error) throw new Error(`이미지 정리 실패: ${error.message}`)
}
