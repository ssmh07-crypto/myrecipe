import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Session } from '@supabase/supabase-js'
import { useFonts } from 'expo-font'
import { makeRedirectUri } from 'expo-auth-session'
import { StatusBar } from 'expo-status-bar'
import * as ImagePicker from 'expo-image-picker'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import * as WebBrowser from 'expo-web-browser'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  FlatList,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  TextInput as NativeTextInput,
  View,
} from 'react-native'

import { deleteAccount, importRecipeFromUrl } from './src/lib/apiClient'
import { categoryImagePresets, getFolderImage, getRandomCategoryImage } from './src/lib/folderImages'
import { formatIngredientItems, parseIngredientText } from './src/lib/ingredients'
import { getPremiumAccess } from './src/lib/premium'
import { ensureRecipeFolders } from './src/lib/recipeFolders'
import { legacyRecipeSelectColumns, normalizeRecipe, normalizeRecipeInput, recipeSelectColumns, toRecipeRow } from './src/lib/recipes'
import { deleteImagePaths, getLegacyPublicImageUrl, hydrateFolderImages, hydrateRecipeImages, hydrateRecipeImagesBatch, type LocalImageAsset, uploadCategoryImage, uploadRecipeImage, uploadRecipeStepImage } from './src/lib/storage'
import { hasSupabaseEnv, supabase } from './src/lib/supabaseClient'
import { emptyRecipeInput, type IngredientItem, type Recipe, type RecipeFolder, type RecipeInput } from './src/types/recipe'

WebBrowser.maybeCompleteAuthSession()

type MainTab = 'recipes' | 'book' | 'calendar' | 'create' | 'premium' | 'settings'
type Screen = 'main' | 'detail' | 'form' | 'import' | 'categoryManager' | 'categoryForm'
type AuthMode = 'login' | 'signup'
type FormMode = 'new' | 'edit' | 'import'

type MealEntry = {
  id: string
  date: string
  type: 'recipe' | 'manual'
  recipeId?: string
  title: string
  note?: string
}

type FolderItem = { folder_id: string; recipe_id: string }

const difficultyOptions = ['Easy', 'Medium', 'Hard']
const labels: Record<string, string> = { Easy: '쉬움', Medium: '보통', Hard: '어려움' }
const tabs: Array<{ key: MainTab; label: string }> = [
  { key: 'recipes', label: '홈' },
  { key: 'book', label: '레시피북' },
  { key: 'create', label: '레시피 추가' },
  { key: 'calendar', label: '식사 기록' },
  { key: 'premium', label: '프리미엄' },
]

const tabIcons: Record<MainTab, string> = {
  recipes: '⌂',
  book: '▤',
  calendar: '▦',
  create: '＋',
  premium: '◇',
  settings: '⚙',
}

const toDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const mealStorageKey = (userId: string) => `myrecipe:meal-calendar:${userId}`
const folderOrderStorageKey = (userId: string) => `myrecipe:folder-order:${userId}`
const processedAuthCodes = new Set<string>()

const getAuthRedirectUrl = () => makeRedirectUri({ scheme: 'myrecipenote', path: 'auth/callback' })

const exchangeAuthCodeFromUrl = async (callback: string) => {
  const redirectTo = getAuthRedirectUrl()
  const callbackUrl = new URL(callback)
  const expectedCallbackUrl = new URL(redirectTo)
  if (
    callbackUrl.protocol !== expectedCallbackUrl.protocol
    || callbackUrl.host !== expectedCallbackUrl.host
    || callbackUrl.pathname !== expectedCallbackUrl.pathname
  ) {
    throw new Error('인증 콜백 주소가 올바르지 않습니다.')
  }

  const errorDescription = callbackUrl.searchParams.get('error_description')
  if (errorDescription) throw new Error(errorDescription)
  const code = callbackUrl.searchParams.get('code')
  if (!code) throw new Error('인증 응답에 인증 코드가 없습니다.')
  if (processedAuthCodes.has(code)) return

  processedAuthCodes.add(code)
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    processedAuthCodes.delete(code)
    throw error
  }
}

const sortFoldersByStoredOrder = (folders: RecipeFolder[], rawOrder: string | null) => {
  if (!rawOrder) return folders
  try {
    const order = JSON.parse(rawOrder) as unknown
    if (!Array.isArray(order)) return folders
    const positions = new Map(order.filter((id): id is string => typeof id === 'string').map((id, index) => [id, index]))
    return [...folders].sort((a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER))
  } catch {
    return folders
  }
}

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`

const parseStoredMeals = (raw: string | null): MealEntry[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry): entry is MealEntry =>
      Boolean(
        entry &&
        typeof entry === 'object' &&
        typeof (entry as MealEntry).id === 'string' &&
        typeof (entry as MealEntry).date === 'string' &&
        typeof (entry as MealEntry).title === 'string',
      ),
    )
  } catch {
    return []
  }
}

const isMissingMealTableError = (error: { code?: string } | null | undefined) => error?.code === 'PGRST205'
const isMissingPrivateImageColumnsError = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === 'PGRST204' && /image_path|step_image_paths/i.test(error.message || '')

const toLegacyRecipeRow = (recipe: RecipeInput) => {
  const { image_path, step_image_paths: _stepImagePaths, ...row } = toRecipeRow(recipe)
  return {
    ...row,
    image_url: image_path ? getLegacyPublicImageUrl(image_path) : recipe.image_url || null,
    step_images: recipe.step_images.map((url, index) => {
      const path = recipe.step_image_paths[index]
      return path ? getLegacyPublicImageUrl(path) : url
    }),
  }
}

const escapeHtml = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const pretendardFamily = (fontWeight: string | number | undefined) => {
  const weight = Number(fontWeight || 400)
  if (weight >= 700) return 'Pretendard-Bold'
  if (weight >= 600) return 'Pretendard-SemiBold'
  if (weight >= 500) return 'Pretendard-Medium'
  return 'Pretendard-Regular'
}

function Text({ style, ...props }: ComponentProps<typeof NativeText>) {
  const flattenedStyle = StyleSheet.flatten(style)
  const fontFamily = flattenedStyle?.fontFamily || pretendardFamily(flattenedStyle?.fontWeight)
  return <NativeText {...props} style={[{ fontFamily }, style]} />
}

function TextInput({ style, ...props }: ComponentProps<typeof NativeTextInput>) {
  const flattenedStyle = StyleSheet.flatten(style)
  const fontFamily = flattenedStyle?.fontFamily || pretendardFamily(flattenedStyle?.fontWeight)
  return <NativeTextInput {...props} style={[{ fontFamily }, style]} />
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    'Pretendard-Regular': require('./assets/fonts/Pretendard/public/static/Pretendard-Regular.otf'),
    'Pretendard-Medium': require('./assets/fonts/Pretendard/public/static/Pretendard-Medium.otf'),
    'Pretendard-SemiBold': require('./assets/fonts/Pretendard/public/static/Pretendard-SemiBold.otf'),
    'Pretendard-Bold': require('./assets/fonts/Pretendard/public/static/Pretendard-Bold.otf'),
  })
  const [session, setSession] = useState<Session | null>(null)
  const [fontLoadTimedOut, setFontLoadTimedOut] = useState(false)
  const [authLoading, setAuthLoading] = useState(hasSupabaseEnv)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [folders, setFolders] = useState<RecipeFolder[]>([])
  const [folderItems, setFolderItems] = useState<FolderItem[]>([])
  const [meals, setMeals] = useState<MealEntry[]>([])
  const [hasPremium, setHasPremium] = useState(false)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [tab, setTab] = useState<MainTab>('recipes')
  const [screen, setScreen] = useState<Screen>('main')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<FormMode>('new')
  const [formInitialValue, setFormInitialValue] = useState<RecipeInput | null>(null)
  const [formInitialFolderId, setFormInitialFolderId] = useState<string | null>(null)
  const [editingFolder, setEditingFolder] = useState<RecipeFolder | null>(null)
  const [notice, setNotice] = useState('')

  const user = session?.user ?? null

  useEffect(() => {
    const handleAuthUrl = (url: string) => {
      if (!url.startsWith('myrecipenote://auth/callback')) return
      void exchangeAuthCodeFromUrl(url).catch((error) => {
        setNotice(error instanceof Error ? error.message : '인증 링크를 처리하지 못했습니다.')
      })
    }
    void Linking.getInitialURL().then((url) => {
      if (url) handleAuthUrl(url)
    })
    const subscription = Linking.addEventListener('url', ({ url }) => handleAuthUrl(url))
    return () => subscription.remove()
  }, [])
  const selectedRecipe = useMemo(() => recipes.find((recipe) => recipe.id === selectedId) || null, [recipes, selectedId])

  useEffect(() => {
    if (fontsLoaded || fontError) return
    const timeout = setTimeout(() => setFontLoadTimedOut(true), 8_000)
    return () => clearTimeout(timeout)
  }, [fontError, fontsLoaded])

  useEffect(() => {
    if (!hasSupabaseEnv) return

    let active = true
    const authTimeout = setTimeout(() => {
      if (!active) return
      setAuthLoading(false)
      setNotice('세션 확인이 지연되어 로그인 화면으로 전환했습니다.')
    }, 8_000)

    void supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return
        clearTimeout(authTimeout)
        if (error) setNotice(error.message)
        setSession(data.session)
        setAuthLoading(false)
      })
      .catch(() => {
        if (!active) return
        clearTimeout(authTimeout)
        setAuthLoading(false)
        setNotice('세션을 확인하지 못했습니다. 네트워크 연결을 확인해주세요.')
      })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      clearTimeout(authTimeout)
      setSession(nextSession)
      setAuthLoading(false)
      if (!nextSession) {
        setRecipes([])
        setFolders([])
        setFolderItems([])
        setMeals([])
        setScreen('main')
        setTab('recipes')
        setSelectedId(null)
      }
    })

    return () => {
      active = false
      clearTimeout(authTimeout)
      data.subscription.unsubscribe()
    }
  }, [])

  const loadAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      let [recipeResult, itemResult, nextFolders, premium, rawMeals, rawFolderOrder] = await Promise.all([
        supabase.from('recipes').select(recipeSelectColumns).order('created_at', { ascending: false }),
        supabase.from('recipe_folder_items').select('folder_id, recipe_id'),
        ensureRecipeFolders(user.id),
        getPremiumAccess(user.id).catch(() => false),
        AsyncStorage.getItem(mealStorageKey(user.id)),
        AsyncStorage.getItem(folderOrderStorageKey(user.id)),
      ])

      if (isMissingPrivateImageColumnsError(recipeResult.error)) {
        const legacyRecipeResult = await supabase.from('recipes').select(legacyRecipeSelectColumns).order('created_at', { ascending: false })
        recipeResult = legacyRecipeResult as unknown as typeof recipeResult
      }

      const localMeals = parseStoredMeals(rawMeals)
      let useLocalMeals = false
      if (localMeals.length) {
        const { error: migrationError } = await supabase.from('meal_entries').upsert(
          localMeals.map((entry) => ({
            user_id: user.id,
            client_id: entry.id,
            meal_date: entry.date,
            entry_type: entry.type,
            recipe_id: entry.recipeId || null,
            title: entry.title,
            note: entry.note || null,
          })),
          { onConflict: 'user_id,client_id' },
        )
        if (isMissingMealTableError(migrationError)) useLocalMeals = true
        else if (migrationError) throw new Error(migrationError.message)
        else await AsyncStorage.removeItem(mealStorageKey(user.id))
      }

      const mealResult = await supabase
        .from('meal_entries')
        .select('client_id, meal_date, entry_type, recipe_id, title, note')
        .order('meal_date', { ascending: true })
        .order('created_at', { ascending: true })

      if (recipeResult.error || itemResult.error) {
        throw new Error(recipeResult.error?.message || itemResult.error?.message || '데이터를 불러오지 못했습니다.')
      }
      if (mealResult.error && !isMissingMealTableError(mealResult.error)) throw new Error(mealResult.error.message)
      if (isMissingMealTableError(mealResult.error)) useLocalMeals = true

      const nextRecipes = await hydrateRecipeImagesBatch((recipeResult.data || []).map(normalizeRecipe))
      setRecipes(nextRecipes)
      setFolderItems((itemResult.data || []) as FolderItem[])
      setFolders(sortFoldersByStoredOrder(await hydrateFolderImages(nextFolders), rawFolderOrder))
      setHasPremium(premium)
      setMeals(useLocalMeals ? localMeals : (mealResult.data || []).map((entry) => ({
        id: entry.client_id,
        date: entry.meal_date,
        type: entry.entry_type as MealEntry['type'],
        recipeId: entry.recipe_id || undefined,
        title: entry.title,
        note: entry.note || undefined,
      })))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user])

  useEffect(() => {
    if (user) void loadAll()
  }, [loadAll, user])

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!session) return false
      if (screen === 'main') {
        if (tab !== 'recipes') {
          setTab('recipes')
          return true
        }
        return true
      }
      if (screen === 'detail') {
        setScreen('main')
        setSelectedId(null)
      } else if (screen === 'form' && formMode === 'edit') {
        setScreen('detail')
      } else if (screen === 'categoryForm') {
        setScreen('categoryManager')
      } else {
        setScreen('main')
      }
      return true
    })
    return () => subscription.remove()
  }, [formMode, screen, session, tab])

  const saveMeals = async (nextMeals: MealEntry[]) => {
    if (!user) return
    const previousMeals = meals
    setMeals(nextMeals)
    try {
      const nextIds = new Set(nextMeals.map((entry) => entry.id))
      const removedIds = previousMeals.filter((entry) => !nextIds.has(entry.id)).map((entry) => entry.id)
      const results = await Promise.all([
        nextMeals.length
          ? supabase.from('meal_entries').upsert(
              nextMeals.map((entry) => ({
                user_id: user.id,
                client_id: entry.id,
                meal_date: entry.date,
                entry_type: entry.type,
                recipe_id: entry.recipeId || null,
                title: entry.title,
                note: entry.note || null,
              })),
              { onConflict: 'user_id,client_id' },
            )
          : Promise.resolve({ error: null }),
        removedIds.length
          ? supabase.from('meal_entries').delete().eq('user_id', user.id).in('client_id', removedIds)
          : Promise.resolve({ error: null }),
      ])
      const saveError = results.find((result) => result.error)?.error
      if (isMissingMealTableError(saveError)) {
        await AsyncStorage.setItem(mealStorageKey(user.id), JSON.stringify(nextMeals))
        setNotice('캘린더는 임시로 기기에 저장했습니다. Supabase 스키마 적용 후 자동 동기화됩니다.')
        return
      }
      if (saveError) throw new Error(saveError.message)
      await AsyncStorage.removeItem(mealStorageKey(user.id))
    } catch (error) {
      setMeals(previousMeals)
      setNotice(error instanceof Error ? error.message : '캘린더 저장에 실패했습니다.')
    }
  }

  const refresh = () => {
    setRefreshing(true)
    void loadAll()
  }

  const openRecipe = (recipe: Recipe) => {
    setSelectedId(recipe.id)
    setScreen('detail')
  }

  const openNewRecipe = (folderId: string | null = null) => {
    setFormMode('new')
    setSelectedId(null)
    setFormInitialFolderId(folderId)
    setFormInitialValue(emptyRecipeInput())
    setScreen('form')
  }

  const openCategoryManager = () => setScreen('categoryManager')

  const openEditRecipe = (recipe: Recipe) => {
    setFormMode('edit')
    setSelectedId(recipe.id)
    setFormInitialFolderId(folderItems.find((item) => item.recipe_id === recipe.id)?.folder_id || null)
    setFormInitialValue(normalizeRecipeInput(recipe))
    setScreen('form')
  }

  const moveFolder = (folderId: string, targetIndex: number) => {
    const index = folders.findIndex((folder) => folder.id === folderId)
    const nextIndex = Math.max(0, Math.min(targetIndex, folders.length - 1))
    if (index < 0 || index === nextIndex) return

    const reordered = [...folders]
    const [moved] = reordered.splice(index, 1)
    reordered.splice(nextIndex, 0, moved)
    const next = reordered.map((folder, position) => ({ ...folder, sort_order: position }))
    setFolders(next)
    if (!user) return

    const folderIds = next.map((folder) => folder.id)
    void AsyncStorage.setItem(folderOrderStorageKey(user.id), JSON.stringify(folderIds))
    void (async () => {
      const rpcResult = await supabase.rpc('reorder_recipe_folders', { p_folder_ids: folderIds })
      if (!rpcResult.error) return

      const rpcMissing = rpcResult.error.code === 'PGRST202'
        || /reorder_recipe_folders|schema cache|function/i.test(rpcResult.error.message)
      if (!rpcMissing) {
        setNotice(`폴더 순서를 서버에 저장하지 못했습니다: ${rpcResult.error.message}`)
        return
      }

      const fallbackResults = await Promise.all(next.map((folder, position) =>
        supabase
          .from('recipe_folders')
          .update({ sort_order: position })
          .eq('id', folder.id)
          .eq('user_id', user.id),
      ))
      const fallbackError = fallbackResults.find((result) => result.error)?.error
      if (!fallbackError) return

      if (fallbackError.code === 'PGRST204' || /sort_order|schema cache|column/i.test(fallbackError.message)) {
        setNotice('서버 DB에 카테고리 순서 저장 기능이 아직 적용되지 않았습니다. Supabase 마이그레이션을 적용해주세요.')
      } else {
        setNotice(`폴더 순서를 서버에 저장하지 못했습니다: ${fallbackError.message}`)
      }
    })()
  }

  const saveRecipe = async (recipe: RecipeInput, imageAsset: LocalImageAsset | null, folderId: string | null, stepImageAssets: Array<LocalImageAsset | null>) => {
    if (!user) return
    const payload = normalizeRecipeInput(recipe)
    if (!payload.title.trim()) {
      setNotice('레시피 제목을 입력해주세요.')
      return
    }

    const writeRecipe = async (nextRecipe: RecipeInput, recipeId?: string) => {
      const privateRow = toRecipeRow(nextRecipe)
      let result = recipeId
        ? await supabase.from('recipes').update(privateRow).eq('id', recipeId).eq('user_id', user.id).select(recipeSelectColumns).single()
        : await supabase.from('recipes').insert({ ...privateRow, user_id: user.id }).select(recipeSelectColumns).single()

      if (isMissingPrivateImageColumnsError(result.error)) {
        const legacyRow = toLegacyRecipeRow(nextRecipe)
        result = recipeId
          ? await supabase.from('recipes').update(legacyRow).eq('id', recipeId).eq('user_id', user.id).select(legacyRecipeSelectColumns).single()
          : await supabase.from('recipes').insert({ ...legacyRow, user_id: user.id }).select(legacyRecipeSelectColumns).single()
      }
      return result
    }

    setLoading(true)
    const uploadedPaths: string[] = []
    let createdRecipeId = ''
    try {
      let savedRecipeId = ''
      let saveWarning = ''
      if (formMode === 'edit' && selectedRecipe) {
        let nextPayload = payload
        if (imageAsset) {
          const image = await uploadRecipeImage(user.id, selectedRecipe.id, imageAsset)
          uploadedPaths.push(image.path)
          nextPayload = { ...payload, image_url: image.url, image_path: image.path }
        }
        if (stepImageAssets.some(Boolean)) {
          const stepImages = await Promise.all(stepImageAssets.map((asset, index) =>
            asset
              ? uploadRecipeStepImage(user.id, selectedRecipe.id, asset, index).then((image) => {
                  uploadedPaths.push(image.path)
                  return image
                })
              : Promise.resolve(null),
          ))
          nextPayload = {
            ...nextPayload,
            step_images: stepImages.map((image, index) => image?.url || payload.step_images[index] || ''),
            step_image_paths: stepImages.map((image, index) => image?.path || payload.step_image_paths[index] || ''),
          }
        }
        const { data, error } = await writeRecipe(nextPayload, selectedRecipe.id)
        if (error) throw new Error(error.message)
        const updated = await hydrateRecipeImages(normalizeRecipe(data))
        const retainedPaths = new Set([nextPayload.image_path, ...nextPayload.step_image_paths].filter(Boolean))
        const stalePaths = [selectedRecipe.image_path, ...selectedRecipe.step_image_paths].filter((path) => path && !retainedPaths.has(path))
        await deleteImagePaths(stalePaths).catch(() => undefined)
        savedRecipeId = updated.id
        setRecipes((current) => current.map((item) => (item.id === updated.id ? updated : item)))
        setSelectedId(updated.id)
      } else {
        const { data, error } = await writeRecipe(payload)
        if (error) throw new Error(error.message)
        let created = normalizeRecipe(data)
        createdRecipeId = created.id
        if (imageAsset || stepImageAssets.some(Boolean)) {
          const [image, stepImages] = await Promise.all([
            imageAsset
              ? uploadRecipeImage(user.id, created.id, imageAsset).then((uploaded) => {
                  uploadedPaths.push(uploaded.path)
                  return uploaded
                })
              : Promise.resolve(payload.image_url),
            Promise.all(stepImageAssets.map((asset, index) =>
              asset
                ? uploadRecipeStepImage(user.id, created.id, asset, index).then((uploaded) => {
                    uploadedPaths.push(uploaded.path)
                    return uploaded
                  })
                : Promise.resolve(null),
            )),
          ])
          const nextPayload = normalizeRecipeInput({
            ...payload,
            image_url: typeof image === 'string' ? image : image.url,
            image_path: typeof image === 'string' ? payload.image_path : image.path,
            step_images: stepImages.map((item, index) => item?.url || payload.step_images[index] || ''),
            step_image_paths: stepImages.map((item, index) => item?.path || payload.step_image_paths[index] || ''),
          })
          const { data: updated, error: updateError } = await writeRecipe(nextPayload, created.id)
          if (updateError) throw new Error(updateError.message)
          created = await hydrateRecipeImages(normalizeRecipe(updated))
        }
        setRecipes((current) => [created, ...current])
        setSelectedId(created.id)
        savedRecipeId = created.id
      }

      if (savedRecipeId) {
        const { error: deleteFolderError } = await supabase.from('recipe_folder_items').delete().eq('recipe_id', savedRecipeId).eq('user_id', user.id)
        if (!deleteFolderError) {
          if (folderId) {
            const { error: folderError } = await supabase.from('recipe_folder_items').insert({ user_id: user.id, folder_id: folderId, recipe_id: savedRecipeId })
            if (!folderError) {
              setFolderItems((current) => [...current.filter((item) => item.recipe_id !== savedRecipeId), { folder_id: folderId, recipe_id: savedRecipeId }])
            } else {
              saveWarning = `레시피는 저장했지만 카테고리를 연결하지 못했습니다: ${folderError.message}`
            }
          } else {
            setFolderItems((current) => current.filter((item) => item.recipe_id !== savedRecipeId))
          }
        } else {
          saveWarning = `레시피는 저장했지만 카테고리를 변경하지 못했습니다: ${deleteFolderError.message}`
        }
      }
      setScreen('detail')
      setNotice(saveWarning || '레시피를 저장했습니다.')
    } catch (error) {
      if (createdRecipeId) {
        await supabase.from('recipes').delete().eq('id', createdRecipeId).eq('user_id', user.id)
      }
      await deleteImagePaths(uploadedPaths).catch(() => undefined)
      setNotice(error instanceof Error ? error.message : '레시피 저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const toggleFavorite = async (recipe: Recipe) => {
    if (!user) return
    const nextValue = !recipe.is_favorite
    setRecipes((current) => current.map((item) => (item.id === recipe.id ? { ...item, is_favorite: nextValue } : item)))
    const { error } = await supabase.from('recipes').update({ is_favorite: nextValue }).eq('id', recipe.id).eq('user_id', user.id)
    if (error) {
      setRecipes((current) => current.map((item) => (item.id === recipe.id ? { ...item, is_favorite: recipe.is_favorite } : item)))
      setNotice(error.message)
    }
  }

  const deleteRecipe = (recipe: Recipe) => {
    Alert.alert('레시피 삭제', '이 레시피를 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          if (!user) return
          const { error } = await supabase.from('recipes').delete().eq('id', recipe.id).eq('user_id', user.id)
          if (error) {
            setNotice(error.message)
            return
          }
          setRecipes((current) => current.filter((item) => item.id !== recipe.id))
          setFolderItems((current) => current.filter((item) => item.recipe_id !== recipe.id))
          setScreen('main')
          setSelectedId(null)
          await deleteImagePaths([recipe.image_path, ...recipe.step_image_paths]).catch(() => {
            setNotice('레시피는 삭제했지만 일부 이미지 정리가 지연되었습니다.')
          })
        },
      },
    ])
  }

  const changeRecipeFolder = async (folderId: string, recipeId: string) => {
    if (!user) return
    const { error: deleteError } = await supabase.from('recipe_folder_items').delete().eq('recipe_id', recipeId).eq('user_id', user.id)
    if (deleteError) {
      setNotice(deleteError.message)
      return
    }
    const { error } = await supabase.from('recipe_folder_items').insert({ folder_id: folderId, recipe_id: recipeId, user_id: user.id })
    if (error) {
      setNotice(error.message)
      return
    }
    setFolderItems((current) => [...current.filter((item) => item.recipe_id !== recipeId), { folder_id: folderId, recipe_id: recipeId }])
    setNotice('카테고리를 변경했습니다.')
  }

  const activatePremium = (plan: 'monthly' | 'yearly') => {
    setNotice(`${plan === 'yearly' ? 'Yearly' : 'Monthly'} 결제 서버 연동이 아직 필요합니다.`)
  }

  const requestAccountDeletion = () => {
    Alert.alert('계정 영구 삭제', '모든 레시피, 이미지, 카테고리와 식단 기록이 삭제되며 복구할 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '영구 삭제',
        style: 'destructive',
        onPress: async () => {
          setLoading(true)
          try {
            await deleteAccount(session?.access_token || '')
            await supabase.auth.signOut({ scope: 'local' })
          } catch (error) {
            setNotice(error instanceof Error ? error.message : '계정을 삭제하지 못했습니다.')
          } finally {
            setLoading(false)
          }
        },
      },
    ])
  }

  if (!fontsLoaded && !fontError && !fontLoadTimedOut) {
    return <SafeAreaView style={styles.safeArea}><View style={styles.center}><ActivityIndicator size="large" color="#775a19" /></View></SafeAreaView>
  }

  if (!hasSupabaseEnv) {
    return (
      <Shell>
        <EmptyState title="Supabase 환경변수가 필요합니다" message="apps/mobile/.env에 EXPO_PUBLIC_SUPABASE_URL과 EXPO_PUBLIC_SUPABASE_ANON_KEY를 설정해주세요." />
      </Shell>
    )
  }

  if (authLoading) {
    return (
      <Shell>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#ec6f59" />
          <Text style={styles.mutedText}>세션을 확인하는 중입니다.</Text>
        </View>
      </Shell>
    )
  }

  if (!session) {
    return (
      <Shell dark>
        <AuthScreen onNotice={setNotice} />
        <Notice message={notice} onClear={() => setNotice('')} />
      </Shell>
    )
  }

  return (
    <Shell>
      {screen === 'main' && (
        <>
          {tab === 'recipes' && (
            <RecipeListScreen
              recipes={recipes}
              folders={folders}
              folderItems={folderItems}
              loading={refreshing}
              onRefresh={refresh}
              onOpenRecipe={openRecipe}
              onImport={() => setScreen('import')}
              onOpenSettings={() => setTab('settings')}
            />
          )}
          {tab === 'book' && (
            <RecipeBookScreen
              recipes={recipes}
              folders={folders}
              folderItems={folderItems}
              onOpenRecipe={openRecipe}
              onManageCategories={openCategoryManager}
              onReload={loadAll}
              onOpenSettings={() => setTab('settings')}
            />
          )}
          {tab === 'calendar' && (
            <CalendarScreen
              recipes={recipes}
              meals={meals}
              onSaveMeals={saveMeals}
              onOpenRecipe={openRecipe}
              onOpenSettings={() => setTab('settings')}
            />
          )}
          {tab === 'create' && (
            <AddRecipeChoiceScreen
              onClose={() => setTab('recipes')}
              onManual={() => openNewRecipe()}
              onImport={() => setScreen('import')}
            />
          )}
          {tab === 'premium' && (
            <PremiumScreen
              hasPremium={hasPremium}
              loading={loading}
              onActivate={activatePremium}
              onImport={() => setScreen('import')}
              onClose={() => setTab('recipes')}
            />
          )}
          {tab === 'settings' && (
            <SettingsScreen
              email={user?.email || ''}
              totalRecipes={recipes.length}
              totalFolders={folders.length}
              onLogout={() => supabase.auth.signOut()}
              deleting={loading}
              onDeleteAccount={requestAccountDeletion}
            />
          )}
          <TabBar active={tab} onChange={setTab} />
        </>
      )}

      {screen === 'detail' && selectedRecipe && (
        <RecipeDetailScreen
          recipe={selectedRecipe}
          folders={folders}
          folderItems={folderItems}
          onBack={() => setScreen('main')}
          onEdit={() => openEditRecipe(selectedRecipe)}
          onDelete={() => deleteRecipe(selectedRecipe)}
          onChangeFolder={(folderId) => changeRecipeFolder(folderId, selectedRecipe.id)}
        />
      )}

      {screen === 'form' && formInitialValue && (
        <RecipeFormScreen
          initialValue={formInitialValue}
          folders={folders}
          initialFolderId={formInitialFolderId}
          submitLabel={formMode === 'edit' ? '수정 저장' : '저장'}
          loading={loading}
          onBack={() => (formMode === 'edit' ? setScreen('detail') : setScreen('main'))}
          onSave={saveRecipe}
        />
      )}

      {screen === 'import' && (
        <ImportScreen
          hasPremium={hasPremium}
          accessToken={session.access_token}
          loading={loading}
          onBack={() => setScreen('main')}
          onOpenPremium={() => {
            setTab('premium')
            setScreen('main')
          }}
          onImported={(recipe) => {
            setFormMode('import')
            setFormInitialValue(recipe)
            setScreen('form')
          }}
          onNotice={setNotice}
        />
      )}

      {screen === 'categoryManager' && (
        <CategoryManagementScreen
          folders={folders}
          folderItems={folderItems}
          onBack={() => setScreen('main')}
          onAdd={() => {
            setEditingFolder(null)
            setScreen('categoryForm')
          }}
          onEdit={(folder) => {
            setEditingFolder(folder)
            setScreen('categoryForm')
          }}
          onMove={moveFolder}
          onReload={loadAll}
          onNotice={setNotice}
        />
      )}

      {screen === 'categoryForm' && (
        <CategoryFormScreen
          editingFolder={editingFolder}
          onBack={() => setScreen('categoryManager')}
          onSaved={() => {
            setEditingFolder(null)
            setScreen('categoryManager')
            void loadAll()
          }}
          onNotice={setNotice}
        />
      )}

      <Notice message={notice} onClear={() => setNotice('')} />
    </Shell>
  )
}

function Shell({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <SafeAreaView style={[styles.safeArea, dark && styles.safeAreaDark]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {children}
    </SafeAreaView>
  )
}

function AuthScreen({ onNotice }: { onNotice: (message: string) => void }) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      onNotice('이메일과 비밀번호를 입력해주세요.')
      return
    }
    if (mode === 'signup' && (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))) {
      onNotice('비밀번호는 10자 이상이며 영문 대문자, 소문자, 숫자를 포함해야 합니다.')
      return
    }
    setLoading(true)
    try {
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: getAuthRedirectUrl() },
          })
      if (result.error) onNotice(result.error.message)
      else if (mode === 'signup') onNotice('가입을 완료했습니다. 이메일 확인 설정이 켜져 있다면 메일을 확인해주세요.')
    } catch {
      onNotice('인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  const openEmailForm = (nextMode: AuthMode) => {
    setMode(nextMode)
    setShowEmailForm(true)
  }

  const signInWithGoogle = async () => {
    if (loading) return
    setLoading(true)
    try {
      const redirectTo = getAuthRedirectUrl()
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      })
      if (error) throw error
      if (!data.url) throw new Error('Google 로그인 주소를 생성하지 못했습니다.')

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)
      if (result.type !== 'success') return

      await exchangeAuthCodeFromUrl(result.url)
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'Google 로그인에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.authScreen}>
      <ScrollView
        bounces={false}
        contentContainerStyle={styles.authScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ImageBackground
          source={require('./assets/icon.png')}
          resizeMode="cover"
          style={styles.authHero}
        >
          <View style={styles.authHeroOverlay} />
          <View style={styles.authBrand}>
            <Text style={styles.authBrandTitle}>ReciPick</Text>
            <Text style={styles.authBrandSubtitle}>당신만의 맛있는 기록, 레시픽</Text>
          </View>
        </ImageBackground>

        <View style={styles.authSheet}>
          <View style={styles.authActions}>
            <Pressable
              accessibilityRole="button"
              disabled={loading}
              style={({ pressed }) => [styles.googleButton, pressed && styles.authButtonPressed, loading && styles.disabledButton]}
              onPress={signInWithGoogle}
            >
              <Text style={styles.googleMark}>G</Text>
              <Text style={styles.googleButtonLabel}>{loading ? '연결 중...' : 'Google로 로그인'}</Text>
            </Pressable>

            <View style={styles.authDivider}>
              <View style={styles.authDividerLine} />
              <Text style={styles.authDividerLabel}>OR</Text>
              <View style={styles.authDividerLine} />
            </View>

            {showEmailForm ? (
              <View style={styles.emailForm}>
                <View style={styles.segment}>
                  <SegmentButton label="로그인" active={mode === 'login'} onPress={() => setMode('login')} />
                  <SegmentButton label="회원가입" active={mode === 'signup'} onPress={() => setMode('signup')} />
                </View>
                <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="이메일" placeholderTextColor="#898783" style={styles.authInput} />
                <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="비밀번호" placeholderTextColor="#898783" style={styles.authInput} />
                <Pressable
                  accessibilityRole="button"
                  disabled={loading}
                  style={({ pressed }) => [styles.signupButton, loading && styles.disabledButton, pressed && styles.authButtonPressed]}
                  onPress={submit}
                >
                  <Text style={styles.signupButtonLabel}>{loading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}</Text>
                </Pressable>
              </View>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.emailButton, pressed && styles.authButtonPressed]}
                  onPress={() => openEmailForm('login')}
                >
                  <Text style={styles.emailIcon}>✉</Text>
                  <Text style={styles.emailButtonLabel}>이메일로 로그인</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.signupButton, pressed && styles.authButtonPressed]}
                  onPress={() => openEmailForm('signup')}
                >
                  <Text style={styles.signupButtonLabel}>회원가입</Text>
                </Pressable>
              </>
            )}
          </View>

          <View style={styles.authFooter}>
            <Text style={styles.authLegal}>로그인함으로써 귀하는 서비스 이용약관 및{`\n`}개인정보 처리방침에 동의하게 됩니다.</Text>
            <View style={styles.authFooterLinks}>
              <Text style={styles.authFooterLink}>TERMS</Text>
              <View style={styles.authFooterDot} />
              <Text style={styles.authFooterLink}>PRIVACY</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function RecipeListScreen({
  recipes,
  folders,
  folderItems,
  loading,
  onRefresh,
  onOpenRecipe,
  onImport,
  onOpenSettings,
}: {
  recipes: Recipe[]
  folders: RecipeFolder[]
  folderItems: FolderItem[]
  loading: boolean
  onRefresh: () => void
  onOpenRecipe: (recipe: Recipe) => void
  onImport: () => void
  onOpenSettings: () => void
}) {
  const [query, setQuery] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const visibleRecipes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return recipes.filter((recipe) => {
      const matchesFolder = !selectedFolderId || folderItems.some((item) => item.folder_id === selectedFolderId && item.recipe_id === recipe.id)
      if (!normalizedQuery) return matchesFolder
      const text = [recipe.title, recipe.memo, recipe.steps_text, formatIngredientItems(recipe.ingredients)].join(' ').toLowerCase()
      return matchesFolder && text.includes(normalizedQuery)
    })
  }, [folderItems, query, recipes, selectedFolderId])

  const recentRecipes = recipes.slice(0, 6)

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.homeContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#775a19" />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.homeTopBar}>
          <Pressable accessibilityLabel="URL 레시피 가져오기" style={styles.homeTopIcon} onPress={onImport}>
            <Text style={styles.homeTopIconText}>☰</Text>
          </Pressable>
          <Text style={styles.homeLogo}>ReciPick</Text>
          <Pressable accessibilityLabel="설정" style={styles.homeTopIcon} onPress={onOpenSettings}><Text style={styles.homeSettingsIcon}>⚙</Text></Pressable>
        </View>

        <View style={styles.homeSearchWrap}>
          <Text style={styles.homeSearchIcon}>⌕</Text>
          <TextInput
            value={query}
            onChangeText={(value) => {
              setQuery(value)
              if (value) setSelectedFolderId(null)
            }}
            placeholder="레시피를 검색해보세요"
            placeholderTextColor="#777a78"
            style={styles.homeSearchInput}
          />
        </View>

        {(query || selectedFolderId) ? (
          <View style={styles.homeSection}>
            <View style={styles.homeSectionHeader}>
              <Text style={styles.homeSectionTitle}>{query ? '검색 결과' : folders.find((folder) => folder.id === selectedFolderId)?.name}</Text>
              <Pressable onPress={() => { setQuery(''); setSelectedFolderId(null) }}><Text style={styles.homeMoreLabel}>전체 보기</Text></Pressable>
            </View>
            {visibleRecipes.length ? visibleRecipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} onPress={() => onOpenRecipe(recipe)} />) : <EmptyState title="레시피가 없습니다" message="다른 검색어나 카테고리를 선택해보세요." />}
          </View>
        ) : (
          <>
            <View style={styles.homeSection}>
              <View style={styles.homeSectionHeader}>
                <Text style={styles.homeSectionTitle}>최근 저장한 레시피</Text>
                <Text style={styles.homeMoreLabel}>{recipes.length}개</Text>
              </View>
              {recentRecipes.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recentRecipeRow}>
                  {recentRecipes.map((recipe) => (
                    <Pressable key={recipe.id} style={({ pressed }) => [styles.recentRecipeCard, pressed && styles.authButtonPressed]} onPress={() => onOpenRecipe(recipe)}>
                      {recipe.image_url ? <Image source={{ uri: recipe.image_url }} style={styles.recentRecipeImage} /> : <ImageFallback title={recipe.title} style={styles.recentRecipeFallback} />}
                      <View style={styles.recentRecipeBody}>
                        <Text style={styles.recentRecipeEyebrow}>{recipe.source_type === 'imported' ? 'IMPORTED' : 'MY RECIPE'}</Text>
                        <Text numberOfLines={1} style={styles.recentRecipeTitle}>{recipe.title || '제목 없음'}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : <EmptyState title="첫 레시피를 기록해보세요" message="작성 버튼을 눌러 나만의 레시피를 저장할 수 있습니다." />}
            </View>

            <View style={styles.homeSection}>
              <Text style={styles.homeSectionTitle}>카테고리별 레시피</Text>
              <View style={styles.homeCategoryList}>
                {folders.map((folder) => {
                  const recipeCount = folderItems.filter((item) => item.folder_id === folder.id).length
                  const folderVisual = getFolderImage(folder)
                  return (
                    <Pressable key={folder.id} style={({ pressed }) => [styles.homeCategoryCard, pressed && styles.authButtonPressed]} onPress={() => setSelectedFolderId(folder.id)}>
                      <ImageBackground source={{ uri: folderVisual.image }} style={styles.homeCategoryImage} imageStyle={styles.homeCategoryImageRadius}>
                        <View style={styles.homeCategoryOverlay} />
                        <View style={styles.homeCategoryCopy}>
                          <Text style={styles.homeCategoryTitle}>{folder.name}</Text>
                          <Text style={styles.homeCategoryCount}>{recipeCount} RECIPES</Text>
                        </View>
                      </ImageBackground>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          </>
        )}
        <View style={styles.homeBottomSpacer} />
      </ScrollView>

    </View>
  )
}

function RecipeFlatList({
  recipes,
  loading,
  onRefresh,
  onOpenRecipe,
}: {
  recipes: Recipe[]
  loading: boolean
  onRefresh?: () => void
  onOpenRecipe: (recipe: Recipe) => void
}) {
  return (
    <FlatList
      data={recipes}
      keyExtractor={(item) => item.id}
      initialNumToRender={8}
      maxToRenderPerBatch={8}
      removeClippedSubviews={Platform.OS === 'android'}
      windowSize={7}
      contentContainerStyle={recipes.length ? styles.listContent : styles.emptyListContent}
      refreshControl={onRefresh ? <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor="#ec6f59" /> : undefined}
      ListEmptyComponent={loading ? <ActivityIndicator size="large" color="#ec6f59" /> : <EmptyState title="레시피가 없습니다" message="새 레시피를 저장해보세요." />}
      renderItem={({ item }) => <RecipeCard recipe={item} onPress={() => onOpenRecipe(item)} />}
    />
  )
}

function RecipeCard({ recipe, onPress }: { recipe: Recipe; onPress: () => void }) {
  return (
    <Pressable style={styles.recipeCard} onPress={onPress}>
      {recipe.image_url ? <Image source={{ uri: recipe.image_url }} style={styles.recipeImage} /> : <ImageFallback title={recipe.title} style={styles.recipeImageFallback} />}
      <View style={styles.recipeCardBody}>
        <View style={styles.cardTitleRow}>
          <Text numberOfLines={1} style={styles.cardTitle}>{recipe.title || '제목 없음'}</Text>
          <Text style={styles.favoriteMark}>{recipe.is_favorite ? '★' : '☆'}</Text>
        </View>
        <Text numberOfLines={2} style={styles.cardMeta}>{formatIngredientItems(recipe.ingredients) || recipe.memo || recipe.steps_text || '재료와 메모를 추가해보세요.'}</Text>
        <Text style={styles.cardFooter}>{labels[recipe.difficulty] || recipe.difficulty} · {recipe.servings || 1}인분</Text>
      </View>
    </Pressable>
  )
}

function RecipeDetailScreen({
  recipe,
  folders,
  folderItems,
  onBack,
  onEdit,
  onDelete,
  onChangeFolder,
}: {
  recipe: Recipe
  folders: RecipeFolder[]
  folderItems: FolderItem[]
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onChangeFolder: (folderId: string) => void
}) {
  const [categoryOpen, setCategoryOpen] = useState(false)
  const activeFolders = folders.filter((folder) => folderItems.some((item) => item.folder_id === folder.id && item.recipe_id === recipe.id))
  const cookingSteps = recipe.steps_text
    .split(/\n+/)
    .map((step) => step.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean)

  useEffect(() => {
    if (!categoryOpen) return
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setCategoryOpen(false)
      return true
    })
    return () => subscription.remove()
  }, [categoryOpen])

  const openMoreMenu = () => Alert.alert(recipe.title, '원하는 작업을 선택하세요.', [
    { text: '수정', onPress: onEdit },
    { text: '삭제', style: 'destructive', onPress: onDelete },
    { text: '취소', style: 'cancel' },
  ])

  const shareRecipe = async () => {
    try {
      const ingredients = formatIngredientItems(recipe.ingredients)
      await Share.share({
        title: recipe.title,
        message: [recipe.title, ingredients && `재료: ${ingredients}`, recipe.steps_text && `조리 순서\n${recipe.steps_text}`].filter(Boolean).join('\n\n'),
      })
    } catch (error) {
      Alert.alert('공유 실패', error instanceof Error ? error.message : '레시피를 공유하지 못했습니다.')
    }
  }

  const openSource = async () => {
    try {
      const supported = await Linking.canOpenURL(recipe.source_url)
      if (!supported) throw new Error('열 수 없는 URL입니다.')
      await Linking.openURL(recipe.source_url)
    } catch (error) {
      Alert.alert('출처 열기 실패', error instanceof Error ? error.message : '출처를 열지 못했습니다.')
    }
  }

  const exportPdf = async () => {
    try {
      const ingredientRows = recipe.ingredients.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(`${item.amount}${item.unit}`)}</td></tr>`).join('')
      const seasoningRows = recipe.seasonings.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(`${item.amount}${item.unit}`)}</td></tr>`).join('')
      const stepRows = cookingSteps.map((step, index) => `<div class="step"><b>${index + 1}</b><p>${escapeHtml(step)}</p></div>`).join('')
      const { uri } = await Print.printToFileAsync({ html: `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>body{font-family:sans-serif;color:#1a1c1a;padding:32px}h1{font-size:30px;margin-bottom:8px}.meta{color:#775a19;margin-bottom:28px}h2{font-size:20px;border-bottom:1px solid #ccc;padding-bottom:8px;margin-top:28px}table{width:100%;border-collapse:collapse}td{padding:8px 4px;border-bottom:1px solid #eee}td:last-child{text-align:right;color:#666}.step{display:flex;gap:14px;margin:18px 0}.step b{background:#181919;color:white;width:28px;height:28px;border-radius:14px;text-align:center;line-height:28px}.step p{margin:2px 0;flex:1;line-height:1.6}.memo{background:#f4f3f1;padding:16px;border-left:4px solid #775a19}</style></head><body><h1>${escapeHtml(recipe.title)}</h1><div class="meta">${escapeHtml(activeFolders[0]?.name || '카테고리 없음')} · ${escapeHtml(labels[recipe.difficulty] || recipe.difficulty)} · ${recipe.servings || 1}인분</div>${recipe.memo ? `<div class="memo">${escapeHtml(recipe.memo)}</div>` : ''}<h2>재료</h2><table>${ingredientRows}</table><h2>양념</h2><table>${seasoningRows}</table><h2>조리 순서</h2>${stepRows}</body></html>` })
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${recipe.title} PDF` })
      else Alert.alert('PDF 생성 완료', uri)
    } catch (error) {
      Alert.alert('PDF 생성 실패', error instanceof Error ? error.message : 'PDF를 만들지 못했습니다.')
    }
  }

  return (
    <View style={styles.recipeDetailScreen}>
      <View style={styles.recipeDetailTopBar}>
        <Pressable style={styles.recipeDetailTopButton} onPress={onBack}><Text style={styles.recipeDetailTopButtonText}>‹</Text></Pressable>
        <Text style={styles.recipeDetailLogo}>ReciPick</Text>
        <Pressable style={styles.recipeDetailTopButton} onPress={openMoreMenu}><Text style={styles.recipeDetailMoreText}>•••</Text></Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.recipeDetailContent} showsVerticalScrollIndicator={false}>
        <View style={styles.recipeDetailHero}>
          {recipe.image_url ? <Image source={{ uri: recipe.image_url }} style={styles.recipeDetailHeroImage} /> : <ImageFallback title={recipe.title} style={styles.recipeDetailHeroFallback} />}
          <View style={styles.recipeDetailHeroShade} />
        </View>

        <View style={styles.recipeDetailHeaderCard}>
          <View style={styles.recipeDetailCardTopRow}>
            <Pressable style={styles.recipeDetailCategoryBadge} onPress={() => setCategoryOpen((open) => !open)}><Text style={styles.recipeDetailCategoryBadgeText}>{activeFolders[0]?.name || '카테고리 선택'}⌄</Text></Pressable>
            {categoryOpen && <View style={styles.recipeDetailCategoryDropdown}>{folders.map((folder) => <Pressable key={folder.id} style={styles.recipeDetailCategoryOption} onPress={() => { onChangeFolder(folder.id); setCategoryOpen(false) }}><Text style={[styles.recipeDetailCategoryOptionText, activeFolders[0]?.id === folder.id && styles.recipeDetailCategoryOptionTextActive]}>{folder.name}</Text>{activeFolders[0]?.id === folder.id && <Text style={styles.recipeDetailCategoryCheck}>✓</Text>}</Pressable>)}</View>}
          </View>
          <View style={styles.recipeDetailTitleRow}>
            <Text style={styles.recipeDetailTitle}>{recipe.title || '제목 없음'}</Text>
            <View style={styles.recipeDetailHeaderActions}>
              <Pressable accessibilityLabel="편집" style={styles.recipeDetailCircleButton} onPress={onEdit}><Text style={styles.recipeDetailActionIcon}>✎</Text></Pressable>
              <Pressable accessibilityLabel="공유" style={styles.recipeDetailCircleButton} onPress={shareRecipe}><Text style={styles.recipeDetailActionIcon}>↗</Text></Pressable>
              <Pressable accessibilityLabel="PDF 출력" style={styles.recipeDetailCircleButton} onPress={exportPdf}><Text style={styles.recipeDetailPdfIcon}>PDF</Text></Pressable>
            </View>
          </View>
          <View style={styles.recipeDetailInfoGrid}>
            <View style={styles.recipeDetailInfoCell}>
              <Text style={styles.recipeDetailInfoIcon}>≡</Text>
              <Text style={styles.recipeDetailInfoLabel}>재료</Text>
              <Text style={styles.recipeDetailInfoValue}>{recipe.ingredients.length}개</Text>
            </View>
            <View style={[styles.recipeDetailInfoCell, styles.recipeDetailInfoCellBorder]}>
              <Text style={styles.recipeDetailInfoIcon}>▥</Text>
              <Text style={styles.recipeDetailInfoLabel}>난이도</Text>
              <Text style={styles.recipeDetailInfoValue}>{labels[recipe.difficulty] || recipe.difficulty}</Text>
            </View>
            <View style={styles.recipeDetailInfoCell}>
              <Text style={styles.recipeDetailInfoIcon}>♙</Text>
              <Text style={styles.recipeDetailInfoLabel}>인분</Text>
              <Text style={styles.recipeDetailInfoValue}>{recipe.servings || 1}인분</Text>
            </View>
          </View>
        </View>

        <View style={styles.recipeDetailBody}>
          {!!recipe.memo && <View style={styles.recipeDetailMemo}><Text style={styles.recipeDetailMemoLabel}>메모 · NOTES</Text><Text style={styles.recipeDetailMemoText}>{recipe.memo}</Text></View>}

          <View style={styles.recipeDetailIngredientGrid}>
            <RecipeItemList title="재료" icon="◉" items={recipe.ingredients} emptyMessage="등록된 재료가 없습니다." />
            <RecipeItemList title="양념" icon="♢" items={recipe.seasonings} emptyMessage="등록된 양념이 없습니다." />
          </View>

          <View style={styles.recipeDetailStepsSection}>
            <View style={styles.recipeDetailSectionHeading}><Text style={styles.recipeDetailSectionIcon}>♨</Text><Text style={styles.recipeDetailSectionTitle}>조리 순서</Text></View>
            {cookingSteps.length ? cookingSteps.map((step, index) => (
              <View key={index} style={styles.recipeDetailStep}>
                <View style={styles.recipeDetailStepNumber}><Text style={styles.recipeDetailStepNumberText}>{index + 1}</Text></View>
                <View style={styles.recipeDetailStepBody}>
                  <Text style={styles.recipeDetailStepText}>{step}</Text>
                  {!!recipe.step_images[index] && <Image source={{ uri: recipe.step_images[index] }} style={styles.recipeDetailStepImage} />}
                </View>
              </View>
            )) : <Text style={styles.recipeDetailEmptyText}>등록된 조리 순서가 없습니다.</Text>}
          </View>

          {!!recipe.source_url && <Pressable accessibilityRole="link" accessibilityLabel="출처 열기" style={({ pressed }) => [styles.recipeDetailSource, pressed && styles.authButtonPressed]} onPress={openSource}><Text style={styles.recipeDetailSourceLabel}>출처 열기 ↗</Text><Text style={styles.recipeDetailSourceUrl}>{recipe.source_url}</Text></Pressable>}
        </View>
      </ScrollView>
    </View>
  )
}

function RecipeItemList({ title, icon, items, emptyMessage }: { title: string; icon: string; items: IngredientItem[]; emptyMessage: string }) {
  return (
    <View style={styles.recipeDetailListCard}>
      <View style={styles.recipeDetailListHeader}><Text style={styles.recipeDetailListIcon}>{icon}</Text><Text style={styles.recipeDetailListTitle}>{title}</Text></View>
      {items.length ? items.map((item, index) => (
        <View key={`${item.name}-${index}`} style={styles.recipeDetailListRow}>
          <Text style={styles.recipeDetailItemName}>{item.name}</Text>
          <Text style={styles.recipeDetailItemAmount}>{item.amount}{item.unit}</Text>
        </View>
      )) : <Text style={styles.recipeDetailEmptyText}>{emptyMessage}</Text>}
    </View>
  )
}

function RecipeFormScreen({
  initialValue,
  folders,
  initialFolderId,
  submitLabel,
  loading,
  onBack,
  onSave,
}: {
  initialValue: RecipeInput
  folders: RecipeFolder[]
  initialFolderId: string | null
  submitLabel: string
  loading: boolean
  onBack: () => void
  onSave: (recipe: RecipeInput, imageAsset: LocalImageAsset | null, folderId: string | null, stepImageAssets: Array<LocalImageAsset | null>) => void
}) {
  const [title, setTitle] = useState(initialValue.title)
  const [servings, setServings] = useState(initialValue.servings || 1)
  const [difficulty, setDifficulty] = useState(initialValue.difficulty || 'Easy')
  const [folderId, setFolderId] = useState<string | null>(initialFolderId)
  const [ingredients, setIngredients] = useState<IngredientItem[]>(initialValue.ingredients)
  const [seasonings, setSeasonings] = useState<IngredientItem[]>(initialValue.seasonings)
  const [steps, setSteps] = useState<string[]>(() => {
    const initialSteps = initialValue.steps_text.split(/\n+/).map((step) => step.replace(/^\s*\d+[.)]\s*/, '').trim()).filter(Boolean)
    return initialSteps.length ? initialSteps : ['', '']
  })
  const [memo, setMemo] = useState(initialValue.memo)
  const [sourceUrl, setSourceUrl] = useState(initialValue.source_url)
  const [imageUrl, setImageUrl] = useState(initialValue.image_url)
  const [imageAsset, setImageAsset] = useState<LocalImageAsset | null>(null)
  const [stepImageUrls, setStepImageUrls] = useState<string[]>(() => steps.map((_, index) => initialValue.step_images[index] || ''))
  const [stepImageAssets, setStepImageAssets] = useState<Array<LocalImageAsset | null>>(() => steps.map(() => null))

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) return
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82 })
    if (result.canceled) return
    const asset = result.assets[0]
    setImageAsset({ uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType })
    setImageUrl(asset.uri)
  }

  const pickStepImage = async (index: number) => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) return
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.82 })
    if (result.canceled) return
    const asset = result.assets[0]
    setStepImageAssets((current) => current.map((item, itemIndex) => itemIndex === index ? { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType } : item))
    setStepImageUrls((current) => current.map((url, urlIndex) => urlIndex === index ? asset.uri : url))
  }

  const removeStep = (index: number) => {
    setSteps((current) => current.filter((_, stepIndex) => stepIndex !== index))
    setStepImageUrls((current) => current.filter((_, imageIndex) => imageIndex !== index))
    setStepImageAssets((current) => current.filter((_, imageIndex) => imageIndex !== index))
  }

  const addStep = () => {
    setSteps((current) => [...current, ''])
    setStepImageUrls((current) => [...current, ''])
    setStepImageAssets((current) => [...current, null])
  }

  const submit = () => {
    const filledStepIndexes = steps.map((step, index) => step.trim() ? index : -1).filter((index) => index >= 0)
    onSave({
      title,
      image_url: imageAsset ? '' : imageUrl,
      image_path: imageAsset ? '' : initialValue.image_path,
      servings,
      difficulty,
      ingredients: ingredients.filter((item) => item.name.trim()),
      seasonings: seasonings.filter((item) => item.name.trim()),
      steps_text: filledStepIndexes.map((stepIndex, index) => `${index + 1}. ${steps[stepIndex].trim()}`).join('\n'),
      step_images: filledStepIndexes.map((stepIndex) => stepImageAssets[stepIndex] ? '' : stepImageUrls[stepIndex] || ''),
      step_image_paths: filledStepIndexes.map((stepIndex) => stepImageAssets[stepIndex] ? '' : initialValue.step_image_paths[stepIndex] || ''),
      memo,
      source_url: sourceUrl,
      source_type: initialValue.source_type,
      is_favorite: initialValue.is_favorite,
    }, imageAsset, folderId, filledStepIndexes.map((stepIndex) => stepImageAssets[stepIndex]))
  }

  const updateStep = (index: number, value: string) => setSteps((current) => current.map((step, stepIndex) => stepIndex === index ? value : step))

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.recipeFormContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.recipeFormTopBar}>
          <Pressable accessibilityLabel="뒤로 가기" style={styles.recipeFormTopIcon} onPress={onBack}><Text style={styles.recipeFormTopIconText}>‹</Text></Pressable>
          <Text style={styles.recipeFormLogo}>ReciPick</Text>
          <View style={styles.recipeFormTopIcon}><Text style={styles.recipeFormTopIconText}>◌</Text></View>
        </View>

        <Pressable style={styles.recipeCoverPicker} onPress={pickImage}>
          {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.recipeCoverImage} /> : <View style={styles.recipeCoverPlaceholder} />}
          <View style={styles.recipeCoverAction}>
            <Text style={styles.recipeCoverIcon}>＋</Text>
            <Text style={styles.recipeCoverLabel}>커버 이미지 업로드</Text>
          </View>
        </Pressable>

        <View style={styles.recipeTitleField}>
          <Text style={styles.recipeFieldCaps}>레시피 제목</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="레시피 제목을 입력하세요" placeholderTextColor="#aaa9a5" style={styles.recipeTitleInput} />
        </View>

        <View style={styles.recipeFormSectionCompact}>
          <Text style={styles.recipeFieldCaps}>카테고리</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipeCategoryRow}>
            {folders.map((folder) => (
              <Pressable key={folder.id} style={[styles.recipeCategoryChip, folderId === folder.id && styles.recipeCategoryChipActive]} onPress={() => setFolderId(folderId === folder.id ? null : folder.id)}>
                <Text style={[styles.recipeCategoryChipLabel, folderId === folder.id && styles.recipeCategoryChipLabelActive]}>{folder.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.recipeMetaRow}>
          <View style={styles.recipeMetaColumn}>
            <Text style={styles.recipeFieldCaps}>인분 설정</Text>
            <View style={styles.recipeStepper}>
              <Pressable style={styles.recipeStepperButton} onPress={() => setServings((value) => Math.max(1, value - 1))}><Text style={styles.recipeStepperSymbol}>−</Text></Pressable>
              <Text style={styles.recipeStepperValue}>{servings}</Text>
              <Pressable style={styles.recipeStepperButton} onPress={() => setServings((value) => Math.min(100, value + 1))}><Text style={styles.recipeStepperSymbol}>＋</Text></Pressable>
            </View>
          </View>
          <View style={styles.recipeMetaColumn}>
            <Text style={styles.recipeFieldCaps}>난이도</Text>
            <View style={styles.recipeDifficultyRow}>
              {difficultyOptions.map((option) => (
                <Pressable key={option} style={[styles.recipeDifficultyButton, difficulty === option && styles.recipeDifficultyButtonActive]} onPress={() => setDifficulty(option)}>
                  <Text style={[styles.recipeDifficultyLabel, difficulty === option && styles.recipeDifficultyLabelActive]}>{labels[option]}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <IngredientEditor title="재료" items={ingredients} onChange={setIngredients} example="양파 1개, 새우 5개, 감자 300g" />
        <IngredientEditor title="양념" items={seasonings} onChange={setSeasonings} example="간장 2큰술, 설탕 1작은술, 소금 약간" />

        <View style={styles.recipeEditorSection}>
          <Text style={styles.recipeEditorTitle}>조리 순서</Text>
          {steps.map((step, index) => (
            <View key={index} style={styles.recipeStepRow}>
              <Text style={styles.recipeStepNumber}>{String(index + 1).padStart(2, '0')}</Text>
              <View style={styles.recipeStepBody}>
                <Text style={styles.recipeSmallCaps}>조리 설명</Text>
                <TextInput value={step} onChangeText={(value) => updateStep(index, value)} multiline placeholder={`${index + 1}번째 조리 단계를 설명해주세요.`} placeholderTextColor="#949692" style={styles.recipeStepInput} />
                <Text style={styles.recipeStepPhotoLabel}>조리 사진</Text>
                <Pressable style={styles.recipeStepImagePicker} onPress={() => pickStepImage(index)}>
                  {stepImageUrls[index] ? <Image source={{ uri: stepImageUrls[index] }} style={styles.recipeStepImage} /> : <><Text style={styles.recipeStepImageIcon}>＋</Text><Text style={styles.recipeStepImageLabel}>이 단계의 사진 추가</Text></>}
                </Pressable>
                <View style={styles.recipeStepActions}>
                  {!!stepImageUrls[index] && <Pressable onPress={() => { setStepImageUrls((current) => current.map((url, imageIndex) => imageIndex === index ? '' : url)); setStepImageAssets((current) => current.map((asset, imageIndex) => imageIndex === index ? null : asset)) }}><Text style={styles.recipeRemoveLabel}>사진 삭제</Text></Pressable>}
                  {steps.length > 1 && <Pressable onPress={() => removeStep(index)}><Text style={styles.recipeRemoveLabel}>이 단계 삭제</Text></Pressable>}
                </View>
              </View>
            </View>
          ))}
          <Pressable style={styles.recipeAddButton} onPress={addStep}><Text style={styles.recipeAddButtonLabel}>＋ 순서 추가</Text></Pressable>
        </View>

        <View style={styles.recipeFormSectionCompact}>
          <Text style={styles.recipeFieldCaps}>메모</Text>
          <TextInput value={memo} onChangeText={setMemo} multiline placeholder="나만의 팁이나 주의할 점을 적어보세요." placeholderTextColor="#8c8e8b" style={styles.recipeMemoInput} />
        </View>

        {!!initialValue.source_url && <View style={styles.recipeFormSectionCompact}><Text style={styles.recipeFieldCaps}>출처 URL</Text><TextInput value={sourceUrl} onChangeText={setSourceUrl} autoCapitalize="none" style={styles.recipeSingleInput} /></View>}

        <View style={styles.recipeFormActions}>
          <Pressable style={styles.recipeCancelButton} onPress={onBack}><Text style={styles.recipeCancelLabel}>취소</Text></Pressable>
          <Pressable disabled={loading} style={[styles.recipeSaveButton, loading && styles.disabledButton]} onPress={submit}><Text style={styles.recipeSaveLabel}>{loading ? '저장 중...' : submitLabel}</Text></Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function IngredientEditor({ title, items, onChange, example }: { title: string; items: IngredientItem[]; onChange: (items: IngredientItem[]) => void; example: string }) {
  const [mode, setMode] = useState<'bulk' | 'direct'>('bulk')
  const [bulkText, setBulkText] = useState(formatIngredientItems(items))

  const switchMode = (nextMode: 'bulk' | 'direct') => {
    if (nextMode === 'direct') {
      const parsed = parseIngredientText(bulkText)
      onChange(parsed.length ? parsed : [{ name: '', amount: '', unit: '' }])
    }
    else setBulkText(formatIngredientItems(items))
    setMode(nextMode)
  }

  const updateItem = (index: number, key: keyof IngredientItem, value: string) => onChange(items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item))

  return (
    <View style={styles.recipeEditorSection}>
      <View style={styles.recipeEditorHeader}>
        <Text style={styles.recipeEditorTitle}>{title}</Text>
        <View style={styles.recipeInputModeTabs}>
          <Pressable style={[styles.recipeInputModeTab, mode === 'bulk' && styles.recipeInputModeTabActive]} onPress={() => switchMode('bulk')}><Text style={[styles.recipeInputModeLabel, mode === 'bulk' && styles.recipeInputModeLabelActive]}>한꺼번에 입력</Text></Pressable>
          <Pressable style={[styles.recipeInputModeTab, mode === 'direct' && styles.recipeInputModeTabActive]} onPress={() => switchMode('direct')}><Text style={[styles.recipeInputModeLabel, mode === 'direct' && styles.recipeInputModeLabelActive]}>하나씩 입력</Text></Pressable>
        </View>
      </View>

      {mode === 'bulk' ? (
        <>
          <TextInput
            value={bulkText}
            onChangeText={(value) => { setBulkText(value); onChange(parseIngredientText(value)) }}
            multiline
            placeholder={example}
            placeholderTextColor="#92938f"
            style={styles.recipeBulkInput}
          />
          <Text style={styles.recipeInputHelp}>쉼표 또는 줄바꿈으로 구분하세요. 숫자를 기준으로 이름·수량·단위를 자동으로 나눕니다.</Text>
          {!!items.length && <View style={styles.recipeParsedList}>{items.map((item, index) => <View key={`${item.name}-${index}`} style={styles.recipeParsedChip}><Text style={styles.recipeParsedName}>{item.name}</Text><Text style={styles.recipeParsedAmount}>{item.amount}{item.unit}</Text></View>)}</View>}
        </>
      ) : (
        <>
          {items.map((item, index) => (
            <View key={index} style={styles.recipeIngredientRow}>
              <TextInput value={item.name} onChangeText={(value) => updateItem(index, 'name', value)} placeholder={`${title}명`} placeholderTextColor="#92938f" style={[styles.recipeIngredientInput, styles.recipeIngredientNameInput]} />
              <TextInput value={item.amount} onChangeText={(value) => updateItem(index, 'amount', value)} placeholder="수량" placeholderTextColor="#92938f" keyboardType="decimal-pad" style={styles.recipeIngredientInput} />
              <TextInput value={item.unit} onChangeText={(value) => updateItem(index, 'unit', value)} placeholder="단위" placeholderTextColor="#92938f" style={styles.recipeIngredientInput} />
              <Pressable style={styles.recipeIngredientRemove} onPress={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}><Text style={styles.recipeIngredientRemoveText}>×</Text></Pressable>
            </View>
          ))}
          <Pressable style={styles.recipeAddButton} onPress={() => onChange([...items, { name: '', amount: '', unit: '' }])}><Text style={styles.recipeAddButtonLabel}>＋ {title} 추가</Text></Pressable>
        </>
      )}
    </View>
  )
}

function ImportScreen({
  hasPremium,
  accessToken,
  loading,
  onBack,
  onOpenPremium,
  onImported,
  onNotice,
}: {
  hasPremium: boolean
  accessToken: string
  loading: boolean
  onBack: () => void
  onOpenPremium: () => void
  onImported: (recipe: RecipeInput) => void
  onNotice: (message: string) => void
}) {
  const [url, setUrl] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')

  const submit = async () => {
    if (!url.trim()) return
    setImportError('')
    setImporting(true)
    try {
      const data = await importRecipeFromUrl(url.trim(), accessToken)
      if (data.import_notice) onNotice(data.import_notice)
      onImported(normalizeRecipeInput({ ...emptyRecipeInput(), ...data, source_url: data.source_url || url.trim(), source_type: 'imported' }))
    } catch (error) {
      const message = error instanceof Error ? error.message : '레시피 가져오기에 실패했습니다.'
      setImportError(message)
      onNotice(message)
    } finally {
      setImporting(false)
    }
  }

  if (!hasPremium) {
    return (
      <View style={styles.screenPadded}>
        <View style={styles.topBar}><Pressable style={styles.textButton} onPress={onBack}><Text style={styles.textButtonLabel}>닫기</Text></Pressable></View>
        <EmptyState title="Premium 기능입니다" message="URL로 레시피 가져오기는 Premium에서 사용할 수 있습니다." />
        <PrimaryButton label="Premium 보기" onPress={onOpenPremium} />
      </View>
    )
  }

  return (
    <View style={styles.screenPadded}>
      <View style={styles.topBar}><Pressable style={styles.textButton} onPress={onBack}><Text style={styles.textButtonLabel}>닫기</Text></Pressable></View>
      <Text style={styles.title}>URL로 가져오기</Text>
      <Text style={styles.heroText}>권한이 있는 웹 레시피 URL을 정리 가능한 초안으로 가져옵니다.</Text>
      <Field label="Recipe URL" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" placeholder="https://..." />
      {importing && <Text style={styles.importStatus}>페이지를 읽고 레시피를 정리하고 있습니다. 최대 1분 정도 걸릴 수 있습니다.</Text>}
      {!!importError && <Text style={styles.importError}>{importError}</Text>}
      <PrimaryButton label={importing || loading ? '가져오는 중...' : '레시피 가져오기'} disabled={importing || loading || !url.trim()} onPress={submit} />
    </View>
  )
}

function RecipeBookScreen({
  recipes,
  folders,
  folderItems,
  onOpenRecipe,
  onManageCategories,
  onReload,
  onOpenSettings,
}: {
  recipes: Recipe[]
  folders: RecipeFolder[]
  folderItems: FolderItem[]
  onOpenRecipe: (recipe: Recipe) => void
  onManageCategories: () => void
  onReload: () => void
  onOpenSettings: () => void
}) {
  const [activeFolderId, setActiveFolderId] = useState('')
  const [query, setQuery] = useState('')

  const activeFolderRecipeIds = useMemo(
    () => new Set(folderItems.filter((item) => item.folder_id === activeFolderId).map((item) => item.recipe_id)),
    [activeFolderId, folderItems],
  )

  const visibleRecipes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return recipes.filter((recipe) => {
      const inFolder = activeFolderId ? activeFolderRecipeIds.has(recipe.id) : true
      if (!normalizedQuery) return inFolder
      const matchesQuery = [recipe.title, recipe.memo, recipe.steps_text].join(' ').toLowerCase().includes(normalizedQuery)
      return inFolder && matchesQuery
    })
  }, [activeFolderId, activeFolderRecipeIds, query, recipes])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    folderItems.forEach((item) => map.set(item.folder_id, (map.get(item.folder_id) || 0) + 1))
    return map
  }, [folderItems])

  return (
    <View style={styles.flex}>
      <View style={styles.recipeBookTopBar}>
        <View style={styles.recipeBookTopButton} />
        <Text style={styles.recipeBookLogo}>ReciPick</Text>
        <Pressable accessibilityLabel="설정" style={styles.recipeBookTopButton} onPress={onOpenSettings}><Text style={styles.recipeBookSettingsIcon}>⚙</Text></Pressable>
      </View>

      <View style={styles.recipeBookSearchWrap}>
        <Text style={styles.recipeBookSearchIcon}>⌕</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="레시피 제목을 입력하세요..." placeholderTextColor="#969793" style={styles.recipeBookSearchInput} />
      </View>

      <ScrollView horizontal style={styles.recipeBookCategoryScroller} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipeBookCategories}>
        <Pressable style={[styles.recipeBookCategory, !activeFolderId && styles.recipeBookCategoryActive]} onPress={() => setActiveFolderId('')}><Text style={[styles.recipeBookCategoryLabel, !activeFolderId && styles.recipeBookCategoryLabelActive]}>전체</Text></Pressable>
        {folders.map((folder) => (
          <Pressable key={folder.id} style={[styles.recipeBookCategory, activeFolderId === folder.id && styles.recipeBookCategoryActive]} onPress={() => setActiveFolderId(folder.id)}>
            <Text style={[styles.recipeBookCategoryLabel, activeFolderId === folder.id && styles.recipeBookCategoryLabelActive]}>{folder.name} · {counts.get(folder.id) || 0}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.recipeBookListHeader}>
        <Text style={styles.recipeBookListTitle}>나의 레시피 목록</Text>
        <Text style={styles.recipeBookListCount}>총 {visibleRecipes.length}개</Text>
      </View>

      <FlatList
        data={visibleRecipes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={visibleRecipes.length ? styles.recipeBookListContent : styles.recipeBookEmptyContent}
        refreshControl={<RefreshControl refreshing={false} onRefresh={onReload} tintColor="#775a19" />}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<EmptyState title="레시피가 없습니다" message={query ? '다른 검색어를 입력해보세요.' : '이 카테고리에 저장된 레시피가 없습니다.'} />}
        renderItem={({ item }) => <RecipeBookRow recipe={item} onPress={() => onOpenRecipe(item)} />}
      />
      <Pressable accessibilityLabel="카테고리 관리" style={({ pressed }) => [styles.recipeBookFab, pressed && styles.authButtonPressed]} onPress={onManageCategories}>
        <Text style={styles.recipeBookFabIcon}>＋</Text>
      </Pressable>
    </View>
  )
}

function RecipeBookRow({ recipe, onPress }: { recipe: Recipe; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.recipeBookRow, pressed && styles.recipeBookRowPressed]} onPress={onPress}>
      {recipe.image_url ? <Image source={{ uri: recipe.image_url }} style={styles.recipeBookRowImage} /> : <ImageFallback title={recipe.title} style={styles.recipeBookRowFallback} />}
      <View style={styles.recipeBookRowBody}>
        <Text numberOfLines={2} style={styles.recipeBookRowTitle}>{recipe.title || '제목 없음'}</Text>
        <View style={styles.recipeBookRowMeta}>
          <Text style={styles.recipeBookRowMetaText}>♙ {recipe.servings || 1}인분</Text>
          <Text style={styles.recipeBookRowMetaText}>▥ {labels[recipe.difficulty] || recipe.difficulty}</Text>
        </View>
      </View>
      <Text style={styles.recipeBookChevron}>›</Text>
    </Pressable>
  )
}

function AddRecipeChoiceScreen({
  onClose,
  onManual,
  onImport,
}: {
  onClose: () => void
  onManual: () => void
  onImport: () => void
}) {
  return (
    <View style={styles.addChoiceScreen}>
      <View style={styles.addChoiceTopBar}>
        <Pressable accessibilityLabel="닫기" style={styles.addChoiceTopButton} onPress={onClose}><Text style={styles.addChoiceCloseIcon}>×</Text></Pressable>
        <Text style={styles.addChoiceLogo}>Add Recipe</Text>
        <View style={styles.addChoiceTopButton} />
      </View>

      <ScrollView contentContainerStyle={styles.addChoiceContent} showsVerticalScrollIndicator={false}>
        <View style={styles.addChoiceHeading}>
          <Text style={styles.addChoiceTitle}>새로운 레시피 추가</Text>
          <Text style={styles.addChoiceSubtitle}>기록하고 싶은 레시피의 형태를 선택해주세요.</Text>
        </View>

        <Pressable style={({ pressed }) => [styles.addChoiceCard, pressed && styles.addChoiceCardPressed]} onPress={onManual}>
          <View style={styles.addChoiceAccentTop} />
          <View style={styles.addChoiceManualIcon}><Text style={styles.addChoiceIconText}>✎</Text></View>
          <Text style={styles.addChoiceCardTitle}>직접 작성하기</Text>
          <Text style={styles.addChoiceCardBody}>나만의 특별한 레시피를 차근차근 기록해보세요.</Text>
          <View style={styles.addChoiceLinkRow}><Text style={styles.addChoiceLink}>WRITE MANUALLY</Text><Text style={styles.addChoiceArrow}>→</Text></View>
        </Pressable>

        <Pressable style={({ pressed }) => [styles.addChoiceCard, pressed && styles.addChoiceCardPressed]} onPress={onImport}>
          <View style={styles.addChoiceAccentBottom} />
          <View style={styles.addChoiceUrlIcon}><Text style={styles.addChoiceIconText}>↗</Text></View>
          <Text style={styles.addChoiceCardTitle}>URL로 가져오기</Text>
          <Text style={styles.addChoiceCardBody}>웹사이트 주소를 입력해 레시피를 간편하게 저장하세요.</Text>
          <View style={styles.addChoiceLinkRow}><Text style={styles.addChoiceLink}>IMPORT FROM URL</Text><Text style={styles.addChoiceArrow}>→</Text></View>
        </Pressable>
      </ScrollView>
    </View>
  )
}

function CategoryManagementScreen({
  folders,
  folderItems,
  onBack,
  onAdd,
  onEdit,
  onMove,
  onReload,
  onNotice,
}: {
  folders: RecipeFolder[]
  folderItems: FolderItem[]
  onBack: () => void
  onAdd: () => void
  onEdit: (folder: RecipeFolder) => void
  onMove: (folderId: string, targetIndex: number) => void
  onReload: () => void
  onNotice: (message: string) => void
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    folderItems.forEach((item) => map.set(item.folder_id, (map.get(item.folder_id) || 0) + 1))
    return map
  }, [folderItems])

  const deleteFolder = (folder: RecipeFolder) => {
    Alert.alert('카테고리 삭제', '카테고리에 담긴 레시피는 삭제되지 않습니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const { data: userResult } = await supabase.auth.getUser()
          if (!userResult.user) {
            onNotice('로그인이 필요합니다.')
            return
          }
          const { error } = await supabase.from('recipe_folders').delete().eq('id', folder.id).eq('user_id', userResult.user.id)
          if (error) onNotice(error.message)
          else {
            await deleteImagePaths([folder.image_path]).catch(() => undefined)
            void onReload()
          }
        },
      },
    ])
  }

  return (
    <View style={styles.categoryManagerScreen}>
      <View style={styles.categoryManagerTopBar}>
        <Pressable accessibilityLabel="뒤로 가기" style={styles.categoryManagerTopButton} onPress={onBack}><Text style={styles.categoryManagerBackIcon}>‹</Text></Pressable>
        <Text style={styles.categoryManagerTitle}>카테고리 관리</Text>
        <View style={styles.categoryManagerTopButton} />
      </View>
      <ScrollView scrollEnabled={!draggingId} contentContainerStyle={styles.categoryManagerContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.categoryManagerIntro}>레시피를 체계적으로 분류하기 위한 카테고리를 관리하세요. 순서를 변경하거나 상세 정보를 수정할 수 있습니다.</Text>
        <Pressable style={({ pressed }) => [styles.categoryManagerAddButton, pressed && styles.authButtonPressed]} onPress={onAdd}>
          <Text style={styles.categoryManagerAddIcon}>＋</Text>
          <Text style={styles.categoryManagerAddLabel}>카테고리 추가</Text>
        </Pressable>

        <View style={styles.categoryManagerList}>
          {folders.map((folder, index) => (
            <DraggableCategoryRow
              key={folder.id}
              folder={folder}
              index={index}
              folderCount={folders.length}
              recipeCount={counts.get(folder.id) || 0}
              dragging={draggingId === folder.id}
              onDragStart={() => setDraggingId(folder.id)}
              onDragEnd={(targetIndex) => {
                setDraggingId(null)
                onMove(folder.id, targetIndex)
              }}
              onEdit={() => onEdit(folder)}
              onDelete={() => deleteFolder(folder)}
            />
          ))}
          {!folders.length && <EmptyState title="카테고리가 없습니다" message="첫 카테고리를 추가해 레시피를 정리해보세요." />}
        </View>

        <View style={styles.categoryManagerQuote}>
          <Text style={styles.categoryManagerQuoteTitle}>Curated Organization</Text>
          <Text style={styles.categoryManagerQuoteText}>“요리는 예술이며, 정리는 그 예술을 완성하는 틀입니다.”</Text>
          <Text style={styles.categoryManagerQuoteBy}>— ReciPick Editorial Team</Text>
        </View>
      </ScrollView>
    </View>
  )
}

const categoryDragStep = 100

function DraggableCategoryRow({
  folder,
  index,
  folderCount,
  recipeCount,
  dragging,
  onDragStart,
  onDragEnd,
  onEdit,
  onDelete,
}: {
  folder: RecipeFolder
  index: number
  folderCount: number
  recipeCount: number
  dragging: boolean
  onDragStart: () => void
  onDragEnd: (targetIndex: number) => void
  onEdit: () => void
  onDelete: () => void
}) {
  const translateY = useRef(new Animated.Value(0)).current
  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => {
      translateY.setValue(0)
      onDragStart()
    },
    onPanResponderMove: (_event, gesture) => translateY.setValue(gesture.dy),
    onPanResponderRelease: (_event, gesture) => {
      const offset = Math.round(gesture.dy / categoryDragStep)
      const targetIndex = Math.max(0, Math.min(index + offset, folderCount - 1))
      translateY.setValue(0)
      onDragEnd(targetIndex)
    },
    onPanResponderTerminate: () => {
      translateY.setValue(0)
      onDragEnd(index)
    },
  }), [folderCount, index, onDragEnd, onDragStart, translateY])

  return (
    <Animated.View style={[styles.categoryManagerItem, dragging && styles.categoryManagerItemDragging, { transform: [{ translateY }, { scale: dragging ? 1.02 : 1 }] }]}>
      <View accessibilityLabel={`${folder.name} 순서 이동`} accessibilityHint="잡고 위아래로 끌어 순서를 변경합니다" style={styles.categoryManagerDragHandle} {...panResponder.panHandlers}>
        <Text style={styles.categoryManagerDragIcon}>☷</Text>
      </View>
      <Image source={{ uri: getFolderImage(folder).image }} style={styles.categoryManagerImage} />
      <View style={styles.categoryManagerItemBody}>
        <Text numberOfLines={1} style={styles.categoryManagerItemTitle}>{folder.name}</Text>
        <Text style={styles.categoryManagerItemCount}>{recipeCount} RECIPES</Text>
      </View>
      <Pressable accessibilityLabel={`${folder.name} 수정`} style={styles.categoryManagerAction} onPress={onEdit}><Text style={styles.categoryManagerEditIcon}>✎</Text></Pressable>
      <Pressable accessibilityLabel={`${folder.name} 삭제`} style={styles.categoryManagerAction} onPress={onDelete}><Text style={styles.categoryManagerDeleteIcon}>⌫</Text></Pressable>
    </Animated.View>
  )
}

function CategoryFormScreen({
  editingFolder,
  onBack,
  onSaved,
  onNotice,
}: {
  editingFolder: RecipeFolder | null
  onBack: () => void
  onSaved: () => void
  onNotice: (message: string) => void
}) {
  const [name, setName] = useState(editingFolder?.name || '')
  const [description, setDescription] = useState(editingFolder?.description || '')
  const [imageAsset, setImageAsset] = useState<LocalImageAsset | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(() => {
    const existingImage = editingFolder?.image_url || ''
    if (categoryImagePresets.includes(existingImage)) return existingImage
    return existingImage ? null : getRandomCategoryImage()
  })
  const [saving, setSaving] = useState(false)

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!permission.granted) {
      onNotice('카테고리 사진을 선택하려면 사진 접근 권한이 필요합니다.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.9,
    })
    if (result.canceled) return
    const asset = result.assets[0]
    setImageAsset({ uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType })
    setSelectedPreset(null)
  }

  const save = async () => {
    const normalizedName = name.trim()
    if (!normalizedName || saving) return
    setSaving(true)
    let uploadedPath = ''
    try {
      const { data: userResult } = await supabase.auth.getUser()
      if (!userResult.user) throw new Error('로그인이 필요합니다.')

      let imageUrl: string | null = selectedPreset || editingFolder?.image_path || editingFolder?.image_url || getRandomCategoryImage()
      if (imageAsset) {
        const uploaded = await uploadCategoryImage(userResult.user.id, imageAsset)
        uploadedPath = uploaded.path
        imageUrl = uploaded.path
      }

      const payload = {
        name: normalizedName.slice(0, 100),
        image_url: imageUrl,
        description: description.trim().slice(0, 500) || null,
      }
      let result = editingFolder
        ? await supabase.from('recipe_folders').update(payload).eq('id', editingFolder.id).eq('user_id', userResult.user.id)
        : await supabase.from('recipe_folders').insert({ ...payload, user_id: userResult.user.id })
      if (result.error && /description/i.test(result.error.message)) {
        const { description: _description, ...legacyPayload } = payload
        result = editingFolder
          ? await supabase.from('recipe_folders').update(legacyPayload).eq('id', editingFolder.id).eq('user_id', userResult.user.id)
          : await supabase.from('recipe_folders').insert({ ...legacyPayload, user_id: userResult.user.id })
      }
      if (result.error) throw new Error(result.error.message)
      if (editingFolder?.image_path && editingFolder.image_path !== imageUrl) {
        await deleteImagePaths([editingFolder.image_path]).catch(() => undefined)
      }
      onSaved()
    } catch (error) {
      if (uploadedPath) await deleteImagePaths([uploadedPath]).catch(() => undefined)
      onNotice(error instanceof Error ? error.message : '카테고리를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const previewImage = imageAsset?.uri || selectedPreset || editingFolder?.image_url || categoryImagePresets[0]

  return (
    <KeyboardAvoidingView style={styles.categoryFormScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.categoryFormTopBar}>
        <Pressable accessibilityLabel="뒤로 가기" style={styles.categoryFormTopButton} onPress={onBack}><Text style={styles.categoryFormBackIcon}>‹</Text></Pressable>
        <Text style={styles.categoryFormTitle}>{editingFolder ? '카테고리 편집' : '카테고리 추가'}</Text>
        <View style={styles.categoryFormTopButton} />
      </View>

      <ScrollView contentContainerStyle={styles.categoryFormContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Pressable style={styles.categoryImagePicker} onPress={pickImage}>
          <Image source={{ uri: previewImage }} style={styles.categoryImagePreview} />
          <View style={styles.categoryImageChangeBadge}>
            <Text style={styles.categoryImageChangeBadgeText}>내 사진으로 변경</Text>
          </View>
        </Pressable>

        <View style={styles.categoryPresetHeader}>
          <View>
            <Text style={styles.categoryPresetTitle}>기본 이미지 선택</Text>
            <Text style={styles.categoryPresetDescription}>새 카테고리에는 샘플 이미지가 자동으로 지정됩니다.</Text>
          </View>
          <Pressable
            style={styles.categoryPresetRandomButton}
            onPress={() => {
              setImageAsset(null)
              setSelectedPreset(getRandomCategoryImage(selectedPreset))
            }}
          >
            <Text style={styles.categoryPresetRandomLabel}>무작위</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryPresetList}>
          {categoryImagePresets.map((image, index) => (
            <Pressable
              key={image}
              accessibilityLabel={`기본 이미지 ${index + 1} 선택`}
              style={[styles.categoryPresetItem, selectedPreset === image && styles.categoryPresetItemSelected]}
              onPress={() => {
                setImageAsset(null)
                setSelectedPreset(image)
              }}
            >
              <Image source={{ uri: image.replace('w=900', 'w=240') }} style={styles.categoryPresetImage} />
              {selectedPreset === image && <View style={styles.categoryPresetCheck}><Text style={styles.categoryPresetCheckText}>✓</Text></View>}
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.categoryField}>
          <Text style={styles.categoryFieldLabel}>카테고리 이름</Text>
          <TextInput value={name} onChangeText={setName} maxLength={100} placeholder="예: 할머니의 일요일 만찬" placeholderTextColor="#b0b1ae" style={styles.categoryNameInput} />
        </View>

        <View style={styles.categoryField}>
          <Text style={styles.categoryFieldLabel}>설명 (선택사항)</Text>
          <TextInput value={description} onChangeText={setDescription} maxLength={500} multiline placeholder="이 카테고리에 대한 짧은 이야기를 들려주세요..." placeholderTextColor="#8e918e" style={styles.categoryDescriptionInput} />
        </View>

        <View style={styles.categoryDecoration}>
          <View style={styles.categoryDecorationLine} />
          <Text style={styles.categoryDecorationIcon}>♨</Text>
          <View style={styles.categoryDecorationLine} />
        </View>
      </ScrollView>

      <View style={styles.categoryFormFooter}>
        <Pressable style={styles.categoryCancelButton} onPress={onBack}><Text style={styles.categoryCancelLabel}>취소</Text></Pressable>
        <Pressable style={[styles.categorySaveButton, (!name.trim() || saving) && styles.disabledButton]} disabled={!name.trim() || saving} onPress={save}>
          <Text style={styles.categorySaveLabel}>{saving ? '저장 중...' : editingFolder ? '수정 저장하기' : '저장하기'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

function CalendarScreen({
  recipes,
  meals,
  onSaveMeals,
  onOpenRecipe,
  onOpenSettings,
}: {
  recipes: Recipe[]
  meals: MealEntry[]
  onSaveMeals: (meals: MealEntry[]) => void
  onOpenRecipe: (recipe: Recipe) => void
  onOpenSettings: () => void
}) {
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()))
  const [modalOpen, setModalOpen] = useState(false)
  const [manualTitle, setManualTitle] = useState('')
  const [manualNote, setManualNote] = useState('')
  const [query, setQuery] = useState('')

  const mealDateSet = useMemo(() => new Set(meals.map((entry) => entry.date)), [meals])
  const recipesById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes])

  const days = useMemo(() => {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const gridStart = new Date(year, month, 1 - firstDay.getDay())
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
      const key = toDateKey(date)
      return {
        date,
        key,
        label: String(date.getDate()),
        muted: date.getMonth() !== month,
        hasMeal: mealDateSet.has(key),
      }
    })
  }, [mealDateSet, monthDate])

  const selectedEntries = useMemo(() => meals.filter((entry) => entry.date === selectedDate), [meals, selectedDate])
  const selectedDateValue = useMemo(() => new Date(`${selectedDate}T12:00:00`), [selectedDate])
  const isToday = selectedDate === toDateKey(new Date())
  const filteredRecipes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return recipes
    return recipes.filter((recipe) => recipe.title.toLowerCase().includes(normalizedQuery))
  }, [query, recipes])

  const addRecipeEntry = (recipe: Recipe) => {
    onSaveMeals([...meals, { id: makeId(), date: selectedDate, type: 'recipe', recipeId: recipe.id, title: recipe.title }])
    setModalOpen(false)
  }
  const addManualEntry = () => {
    if (!manualTitle.trim()) return
    onSaveMeals([...meals, { id: makeId(), date: selectedDate, type: 'manual', title: manualTitle.trim(), note: manualNote.trim() }])
    setManualTitle('')
    setManualNote('')
    setModalOpen(false)
  }
  const removeEntry = (entryId: string) => onSaveMeals(meals.filter((entry) => entry.id !== entryId))
  const changeMonth = (offset: number) => {
    const currentSelected = new Date(`${selectedDate}T12:00:00`)
    const nextMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + offset, 1)
    const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate()
    const nextSelected = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), Math.min(currentSelected.getDate(), lastDay))
    setMonthDate(nextMonth)
    setSelectedDate(toDateKey(nextSelected))
  }
  const selectDay = (date: Date) => {
    setSelectedDate(toDateKey(date))
    if (date.getMonth() !== monthDate.getMonth() || date.getFullYear() !== monthDate.getFullYear()) {
      setMonthDate(new Date(date.getFullYear(), date.getMonth(), 1))
    }
  }

  return (
    <View style={styles.mealCalendarScreen}>
      <View style={styles.mealCalendarTopBar}>
        <View style={styles.homeTopIcon} />
        <View style={styles.mealCalendarBrandWrap}>
          <Text style={styles.mealCalendarBrand}>ReciPick</Text>
          <Text style={styles.mealCalendarBrandSub}>MEAL LOG</Text>
        </View>
        <Pressable accessibilityLabel="설정" style={styles.homeTopIcon} onPress={onOpenSettings}>
          <Text style={styles.homeSettingsIcon}>⚙</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.mealCalendarContent} showsVerticalScrollIndicator={false}>
        <View style={styles.mealCalendarMonthHeader}>
          <View>
            <Text style={styles.mealCalendarEyebrow}>나의 식사 기록</Text>
            <Text style={styles.mealCalendarMonth}>
              {monthDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
            </Text>
          </View>
          <View style={styles.mealCalendarMonthActions}>
            <Pressable accessibilityLabel="이전 달" style={styles.mealCalendarArrow} onPress={() => changeMonth(-1)}>
              <Text style={styles.mealCalendarArrowText}>‹</Text>
            </Pressable>
            <Pressable accessibilityLabel="다음 달" style={styles.mealCalendarArrow} onPress={() => changeMonth(1)}>
              <Text style={styles.mealCalendarArrowText}>›</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.mealCalendarCard}>
          <View style={styles.mealCalendarGrid}>
            {['일', '월', '화', '수', '목', '금', '토'].map((day) => (
              <Text key={day} style={styles.mealCalendarWeekDay}>{day}</Text>
            ))}
          {days.map((day) => (
              <Pressable
                key={day.key}
                accessibilityLabel={`${day.date.getMonth() + 1}월 ${day.label}일${day.hasMeal ? ', 식사 기록 있음' : ''}`}
                style={styles.mealCalendarDayCell}
                onPress={() => selectDay(day.date)}
              >
                <View style={[styles.mealCalendarDayCircle, selectedDate === day.key && styles.mealCalendarDayCircleActive]}>
                  <Text style={[
                    styles.mealCalendarDayLabel,
                    day.muted && styles.mealCalendarDayLabelMuted,
                    selectedDate === day.key && styles.mealCalendarDayLabelActive,
                  ]}>
                    {day.label}
                  </Text>
                </View>
                {day.hasMeal && <View style={[styles.mealCalendarDot, selectedDate === day.key && styles.mealCalendarDotActive]} />}
            </Pressable>
          ))}
          </View>
        </View>

        <View style={styles.mealLogSectionHeader}>
          <View>
            <Text style={styles.mealLogSectionTitle}>{isToday ? '오늘의 식사' : '이날의 식사'}</Text>
            <Text style={styles.mealLogDate}>
              {selectedDateValue.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
            </Text>
          </View>
          <Pressable accessibilityLabel="식사 추가" style={styles.mealLogAddCircle} onPress={() => setModalOpen(true)}>
            <Text style={styles.mealLogAddCircleText}>＋</Text>
          </Pressable>
        </View>

        <View style={styles.mealLogList}>
          {selectedEntries.map((entry) => {
            const recipe = entry.recipeId ? recipesById.get(entry.recipeId) : undefined
            return (
              <Pressable
                key={entry.id}
                style={styles.mealLogCard}
                onPress={() => recipe && onOpenRecipe(recipe)}
              >
                {recipe?.image_url ? (
                  <Image source={{ uri: recipe.image_url }} style={styles.mealLogImage} />
                ) : (
                  <View style={styles.mealLogImageFallback}>
                    <Text style={styles.mealLogImageFallbackText}>{entry.title.slice(0, 1) || '♨'}</Text>
                  </View>
                )}
                <View style={styles.mealLogCardBody}>
                  <Text style={styles.mealLogType}>{entry.type === 'recipe' ? '저장된 레시피' : '직접 기록'}</Text>
                  <Text style={styles.mealLogTitle} numberOfLines={2}>{entry.title}</Text>
                  {!!entry.note && <Text style={styles.mealLogNote} numberOfLines={2}>{entry.note}</Text>}
                  {recipe && <Text style={styles.mealLogOpenHint}>레시피 보기  →</Text>}
                </View>
                <Pressable
                  accessibilityLabel={`${entry.title} 기록 삭제`}
                  hitSlop={8}
                  style={styles.mealLogDelete}
                  onPress={() => removeEntry(entry.id)}
                >
                  <Text style={styles.mealLogDeleteText}>×</Text>
                </Pressable>
              </Pressable>
            )
          })}

          <Pressable style={styles.mealLogEmptyCard} onPress={() => setModalOpen(true)}>
            <View style={styles.mealLogEmptyIcon}><Text style={styles.mealLogEmptyIconText}>＋</Text></View>
            <Text style={styles.mealLogEmptyTitle}>{selectedEntries.length ? '식사 기록 더하기' : '먹은 음식 기록하기'}</Text>
            {!selectedEntries.length && <Text style={styles.mealLogEmptyText}>저장된 레시피를 고르거나 직접 입력할 수 있어요.</Text>}
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={modalOpen} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.mealLogModalPanel}>
            <View style={styles.mealLogModalHandle} />
            <View style={styles.mealLogModalHeader}>
              <View>
                <Text style={styles.mealLogModalEyebrow}>{selectedDateValue.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</Text>
                <Text style={styles.mealLogModalTitle}>무엇을 드셨나요?</Text>
              </View>
              <Pressable style={styles.mealLogModalClose} onPress={() => setModalOpen(false)}>
                <Text style={styles.mealLogModalCloseText}>×</Text>
              </Pressable>
            </View>

            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="저장된 레시피 검색"
              placeholderTextColor="#8b8f89"
              style={styles.mealLogSearchInput}
            />
            <ScrollView style={styles.mealLogRecipeList} keyboardShouldPersistTaps="handled">
              {filteredRecipes.length ? filteredRecipes.map((recipe) => (
                <Pressable key={recipe.id} style={styles.mealLogRecipeOption} onPress={() => addRecipeEntry(recipe)}>
                  {recipe.image_url ? (
                    <Image source={{ uri: recipe.image_url }} style={styles.mealLogRecipeOptionImage} />
                  ) : (
                    <ImageFallback title={recipe.title} style={styles.mealLogRecipeOptionFallback} />
                  )}
                  <Text style={styles.mealLogRecipeOptionTitle} numberOfLines={2}>{recipe.title}</Text>
                  <Text style={styles.mealLogRecipeOptionAdd}>＋</Text>
                </Pressable>
              )) : (
                <Text style={styles.mealLogNoRecipe}>일치하는 레시피가 없습니다.</Text>
              )}
            </ScrollView>

            <View style={styles.mealLogDivider}>
              <View style={styles.mealLogDividerLine} />
              <Text style={styles.mealLogDividerText}>또는 직접 입력</Text>
              <View style={styles.mealLogDividerLine} />
            </View>
            <TextInput
              value={manualTitle}
              onChangeText={setManualTitle}
              placeholder="예: 김치찌개와 밥"
              placeholderTextColor="#9a9c98"
              maxLength={200}
              style={styles.mealLogManualInput}
            />
            <TextInput
              value={manualNote}
              onChangeText={setManualNote}
              placeholder="메모 (선택사항)"
              placeholderTextColor="#9a9c98"
              maxLength={2000}
              multiline
              style={[styles.mealLogManualInput, styles.mealLogManualNote]}
            />
            <Pressable
              style={[styles.mealLogSubmitButton, !manualTitle.trim() && styles.disabledButton]}
              disabled={!manualTitle.trim()}
              onPress={addManualEntry}
            >
              <Text style={styles.mealLogSubmitLabel}>식사 기록 추가</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

function PremiumScreen({
  hasPremium,
  loading,
  onActivate,
  onImport,
  onClose,
}: {
  hasPremium: boolean
  loading: boolean
  onActivate: (plan: 'monthly' | 'yearly') => void
  onImport: () => void
  onClose: () => void
}) {
  const [selectedPlan, setSelectedPlan] = useState<'monthly' | 'yearly'>('yearly')
  const benefits = [
    { icon: '∞', title: '무제한 레시피 저장', description: '한계 없이 쌓아가는 나만의 요리 아카이브' },
    { icon: '▤', title: '무제한 레시피북 생성', description: '테마와 카테고리별로 정리하는 레시피 컬렉션' },
    { icon: '↗', title: 'URL 레시피 자동 가져오기', description: '웹사이트 주소만으로 재료와 조리 과정을 간편하게 정리' },
  ]
  const submit = () => {
    if (hasPremium) onImport()
    else onActivate(selectedPlan)
  }

  return (
    <View style={styles.premiumScreen}>
      <View style={styles.premiumTopBar}>
        <Pressable accessibilityLabel="프리미엄 화면 닫기" style={styles.premiumCloseButton} onPress={onClose}>
          <Text style={styles.premiumCloseText}>×</Text>
        </Pressable>
        <Text style={styles.premiumTopTitle}>Recipe Journal</Text>
        <View style={styles.premiumCloseButton} />
      </View>

      <ScrollView contentContainerStyle={styles.premiumContent} showsVerticalScrollIndicator={false}>
        <ImageBackground
          source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB4q-pf_OtjNk_T7pyd4EQ3pzVyB_KmDntRL9r4Eb-JEyqknNCHHH8SHnWpjwpk1w84dLd0-s0xAzbU_g04HPZSbPrQ7kKA7jQZMRVV-1pilIZneUsyzBC4Qyydk-7QcRO2aRWkiHgKKvFRoXL2U51-rwetKTH5OkxqpJaOmszPJYZ-fROfLUcdU1JZPAKSPM2EJkXGysjS3PU7td63Pmgi4Kia6hfp3Lcl3zm0y6KJGv18usSMRxawucTl0X8ijF6Y845K0XKaZH8' }}
          style={styles.premiumHero}
          imageStyle={styles.premiumHeroImage}
        >
          <View style={styles.premiumHeroOverlay} />
          <View style={styles.premiumHeroCopy}>
            <Text style={styles.premiumHeroEyebrow}>PREMIUM EXPERIENCE</Text>
            <Text style={styles.premiumHeroTitle}>프리미엄으로 완성하는{'\n'}나만의 레시피 저널</Text>
          </View>
        </ImageBackground>

        {hasPremium && (
          <View style={styles.premiumActiveBanner}>
            <Text style={styles.premiumActiveIcon}>✦</Text>
            <View style={styles.premiumFlex}>
              <Text style={styles.premiumActiveTitle}>Premium 이용 중</Text>
              <Text style={styles.premiumActiveText}>모든 프리미엄 기능을 사용할 수 있습니다.</Text>
            </View>
          </View>
        )}

        <View style={styles.premiumSection}>
          <Text style={styles.premiumSectionTitle}>프리미엄 혜택</Text>
          <View style={styles.premiumBenefits}>
            {benefits.map((benefit) => (
              <View key={benefit.title} style={styles.premiumBenefitCard}>
                <View style={styles.premiumBenefitIcon}>
                  <Text style={styles.premiumBenefitIconText}>{benefit.icon}</Text>
                </View>
                <View style={styles.premiumFlex}>
                  <Text style={styles.premiumBenefitTitle}>{benefit.title}</Text>
                  <Text style={styles.premiumBenefitText}>{benefit.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {!hasPremium && (
          <View style={styles.premiumSection}>
            <Text style={styles.premiumSectionTitle}>구독 요금제</Text>
            <View style={styles.premiumPlans}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedPlan === 'yearly' }}
                style={[styles.premiumPlanCard, selectedPlan === 'yearly' && styles.premiumPlanCardSelected]}
                onPress={() => setSelectedPlan('yearly')}
              >
                <View style={styles.premiumPopularBadge}><Text style={styles.premiumPopularBadgeText}>가장 인기</Text></View>
                <View style={styles.premiumPlanRow}>
                  <View style={styles.premiumFlex}>
                    <Text style={styles.premiumPlanTitle}>연간 구독</Text>
                    <Text style={styles.premiumPlanCaption}>연 ₩49,000</Text>
                  </View>
                  <View style={styles.premiumPlanPriceWrap}>
                    <Text style={styles.premiumPlanPriceGold}>₩4,083</Text>
                    <Text style={styles.premiumPlanUnit}>월 환산 금액</Text>
                  </View>
                </View>
                <View style={styles.premiumPlanDivider} />
                <View style={styles.premiumPlanFooter}>
                  <View style={[styles.premiumRadio, selectedPlan === 'yearly' && styles.premiumRadioSelected]}>
                    {selectedPlan === 'yearly' && <View style={styles.premiumRadioDot} />}
                  </View>
                  <Text style={styles.premiumDiscount}>월간 구독 대비 약 30% 할인</Text>
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedPlan === 'monthly' }}
                style={[styles.premiumPlanCard, styles.premiumPlanCardMonthly, selectedPlan === 'monthly' && styles.premiumPlanCardSelected]}
                onPress={() => setSelectedPlan('monthly')}
              >
                <View style={styles.premiumPlanRow}>
                  <View style={styles.premiumFlex}>
                    <Text style={styles.premiumPlanTitle}>월간 구독</Text>
                    <Text style={styles.premiumPlanCaption}>언제든지 해지 가능</Text>
                  </View>
                  <View style={styles.premiumPlanPriceWrap}>
                    <Text style={styles.premiumPlanPrice}>₩5,900</Text>
                    <Text style={styles.premiumPlanUnit}>매월 결제</Text>
                  </View>
                </View>
                <View style={styles.premiumPlanFooter}>
                  <View style={[styles.premiumRadio, selectedPlan === 'monthly' && styles.premiumRadioSelected]}>
                    {selectedPlan === 'monthly' && <View style={styles.premiumRadioDot} />}
                  </View>
                  <Text style={styles.premiumMonthlyHint}>부담 없이 시작해보세요</Text>
                </View>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.premiumLimitNote}>
          <Text style={styles.premiumLimitNoteIcon}>i</Text>
          <Text style={styles.premiumLimitNoteText}>URL 가져오기는 안정적인 서비스 운영을 위해 하루 10회, 30일 기준 100회까지 제공됩니다.</Text>
        </View>

        <Text style={styles.premiumLegal}>
          구독은 언제든지 설정에서 취소할 수 있습니다. 실제 결제 및 스토어 구독 연동은 출시 전에 적용됩니다.{'\n'}
          이용약관  ·  개인정보처리방침
        </Text>
      </ScrollView>

      <View style={styles.premiumCtaBar}>
        <Pressable style={[styles.premiumCta, loading && styles.disabledButton]} disabled={loading} onPress={submit}>
          <Text style={styles.premiumCtaLabel}>
            {hasPremium ? 'URL 레시피 가져오기' : loading ? '처리 중...' : `${selectedPlan === 'yearly' ? '연간' : '월간'} 구독 시작하기`}
          </Text>
          <Text style={styles.premiumCtaSparkle}>✦</Text>
        </Pressable>
      </View>
    </View>
  )
}

function SettingsScreen({
  email,
  totalRecipes,
  totalFolders,
  onLogout,
  deleting,
  onDeleteAccount,
}: {
  email: string
  totalRecipes: number
  totalFolders: number
  onLogout: () => void
  deleting: boolean
  onDeleteAccount: () => void
}) {
  return (
    <ScrollView contentContainerStyle={styles.screenPadded}>
      <Text style={styles.kicker}>Settings</Text>
      <Text style={styles.title}>설정</Text>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>{email}</Text>
        <Text style={styles.cardMeta}>저장된 레시피 {totalRecipes}개 · 카테고리 {totalFolders}개</Text>
      </View>
      <View style={styles.panel}>
        <Text style={styles.sectionTitle}>앱 정보</Text>
        <Text style={styles.sectionBody}>My Recipe Note Expo 앱입니다. Supabase 계정과 Cloudflare Functions API를 사용합니다.</Text>
      </View>
      <PrimaryButton label="로그아웃" onPress={onLogout} />
      <PrimaryButton label={deleting ? '계정 삭제 중...' : '계정 영구 삭제'} disabled={deleting} onPress={onDeleteAccount} />
    </ScrollView>
  )
}

function TabBar({ active, onChange }: { active: MainTab; onChange: (tab: MainTab) => void }) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((item) => {
        const isCreate = item.key === 'create'
        const isActive = active === item.key
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            style={[styles.tabButton, isActive && !isCreate && styles.tabButtonActive, isCreate && styles.tabCreateButton]}
            onPress={() => onChange(item.key)}
          >
            {isCreate ? (
              <>
                <View style={[styles.tabCreateIcon, isActive && styles.tabCreateIconActive]}>
                  <Text style={styles.tabCreateIconText}>＋</Text>
                </View>
                <Text style={[styles.tabCreateLabel, isActive && styles.tabLabelActive]}>레시피 추가</Text>
              </>
            ) : (
              <>
                <Text style={[styles.tabIcon, isActive && styles.tabLabelActive]}>{tabIcons[item.key]}</Text>
                <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{item.label}</Text>
              </>
            )}
          </Pressable>
        )
      })}
    </View>
  )
}

function DetailSection({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.detailSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
    </View>
  )
}

function Field({ label, minHeight, ...inputProps }: ComponentProps<typeof TextInput> & { label: string; minHeight?: number }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        placeholderTextColor="#9c8f89"
        style={[styles.input, inputProps.multiline && styles.multilineInput, minHeight ? { minHeight } : null]}
        textAlignVertical={inputProps.multiline ? 'top' : 'center'}
      />
    </View>
  )
}

function PrimaryButton({ label, disabled, compact, onPress }: { label: string; disabled?: boolean; compact?: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.primaryButton, compact && styles.compactButton, disabled && styles.disabledButton]} onPress={onPress} disabled={disabled}>
      <Text style={styles.primaryButtonLabel}>{label}</Text>
    </Pressable>
  )
}

function SegmentButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.segmentButton, active && styles.segmentButtonActive]} onPress={onPress}>
      <Text style={[styles.segmentButtonLabel, active && styles.segmentButtonLabelActive]}>{label}</Text>
    </Pressable>
  )
}

function ImageFallback({ title, style }: { title: string; style: object }) {
  return (
    <View style={style}>
      <Text style={styles.recipeImageText}>{title.slice(0, 1) || 'R'}</Text>
    </View>
  )
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  )
}

function Notice({ message, onClear }: { message: string; onClear: () => void }) {
  if (!message) return null
  return (
    <Pressable style={styles.notice} onPress={onClear}>
      <Text style={styles.noticeText}>{message}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#faf9f6' },
  safeAreaDark: { backgroundColor: '#161612' },
  flex: { flex: 1, backgroundColor: '#faf9f6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mutedText: { marginTop: 12, color: '#786a64', fontSize: 15 },
  kicker: { color: '#ec6f59', fontSize: 13, fontWeight: '800', letterSpacing: 0, textTransform: 'uppercase' },
  heroTitle: { marginTop: 8, color: '#2f211d', fontSize: 33, fontWeight: '900', lineHeight: 40 },
  heroText: { marginTop: 12, color: '#6f5f58', fontSize: 16, lineHeight: 24 },
  importStatus: { marginTop: 14, borderRadius: 8, backgroundColor: '#f4f3f1', padding: 12, color: '#444748', fontSize: 14, lineHeight: 21 },
  importError: { marginTop: 14, borderRadius: 8, backgroundColor: '#ffdad6', padding: 12, color: '#93000a', fontSize: 14, lineHeight: 21, fontWeight: '600' },
  authScreen: { flex: 1, backgroundColor: '#faf9f6' },
  authScrollContent: { flexGrow: 1, backgroundColor: '#faf9f6' },
  authHero: { height: 500, alignItems: 'center', justifyContent: 'center' },
  authHeroOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(12, 13, 10, 0.48)' },
  authBrand: { alignItems: 'center', paddingHorizontal: 20, paddingBottom: 20 },
  authBrandTitle: { color: '#fff', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 48, fontWeight: '700', letterSpacing: -1 },
  authBrandSubtitle: { marginTop: 8, color: '#f4f3f1', fontSize: 18, lineHeight: 28 },
  authSheet: { flex: 1, minHeight: 390, marginTop: -40, paddingHorizontal: 20, paddingTop: 48, paddingBottom: 26, borderTopLeftRadius: 40, borderTopRightRadius: 40, backgroundColor: '#faf9f6', shadowColor: '#000', shadowOffset: { width: 0, height: -12 }, shadowOpacity: 0.12, shadowRadius: 24, elevation: 16 },
  authActions: { width: '100%', maxWidth: 448, alignSelf: 'center', gap: 12 },
  googleButton: { height: 56, borderWidth: 1, borderColor: 'rgba(196,199,199,0.45)', borderRadius: 12, backgroundColor: '#e3e2e0', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  googleMark: { width: 22, color: '#4285f4', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  googleButtonLabel: { color: '#181919', fontSize: 18, fontWeight: '600' },
  authDivider: { height: 28, flexDirection: 'row', alignItems: 'center', gap: 16 },
  authDividerLine: { flex: 1, height: 1, backgroundColor: 'rgba(196,199,199,0.55)' },
  authDividerLabel: { color: '#8c8e8c', fontSize: 12, fontWeight: '700', letterSpacing: 1.6 },
  emailButton: { height: 56, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  emailIcon: { color: '#444748', fontSize: 19 },
  emailButtonLabel: { color: '#444748', fontSize: 18 },
  signupButton: { height: 56, borderRadius: 12, backgroundColor: '#181919', alignItems: 'center', justifyContent: 'center' },
  signupButtonLabel: { color: '#fff', fontSize: 19, fontWeight: '600' },
  authButtonPressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  emailForm: { gap: 10 },
  authInput: { height: 54, borderWidth: 1, borderColor: '#d5d5d1', borderRadius: 12, backgroundColor: '#fff', paddingHorizontal: 16, color: '#1a1c1a', fontSize: 16 },
  authFooter: { marginTop: 'auto', paddingTop: 30, alignItems: 'center' },
  authLegal: { color: '#858683', fontSize: 12, fontWeight: '600', lineHeight: 18, letterSpacing: 0.4, textAlign: 'center' },
  authFooterLinks: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 22 },
  authFooterLink: { color: '#775a19', fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  authFooterDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#c4c7c7' },
  homeContent: { paddingHorizontal: 20, paddingTop: 8, backgroundColor: '#faf9f6' },
  homeTopBar: { height: 58, marginHorizontal: -4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  homeTopIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  homeTopIconText: { color: '#181919', fontSize: 24, lineHeight: 28 },
  homeSettingsIcon: { color: '#181919', fontSize: 22, lineHeight: 26 },
  homeLogo: { position: 'absolute', left: 52, right: 52, color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 28, fontWeight: '700', textAlign: 'center' },
  homeSearchWrap: { height: 52, marginTop: 14, borderWidth: 1, borderColor: '#c4c7c7', borderRadius: 12, backgroundColor: '#f4f3f1', flexDirection: 'row', alignItems: 'center', shadowColor: '#2d2d2d', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 1 },
  homeSearchIcon: { width: 46, paddingLeft: 3, color: '#444748', fontSize: 26, textAlign: 'center' },
  homeSearchInput: { flex: 1, height: '100%', paddingRight: 16, color: '#1a1c1a', fontSize: 16 },
  homeSection: { marginTop: 32 },
  homeSectionHeader: { marginBottom: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  homeSectionTitle: { color: '#1a1c1a', fontSize: 20, lineHeight: 28, fontWeight: '700' },
  homeMoreLabel: { color: '#6f716f', fontSize: 12, lineHeight: 18, fontWeight: '700', letterSpacing: 0.7 },
  recentRecipeRow: { gap: 16, paddingBottom: 4 },
  recentRecipeCard: { width: 240, borderRadius: 12, backgroundColor: '#f4f3f1', overflow: 'hidden', shadowColor: '#2d2d2d', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  recentRecipeImage: { width: '100%', height: 132, backgroundColor: '#e3e2e0' },
  recentRecipeFallback: { width: '100%', height: 132, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3e2e0' },
  recentRecipeBody: { padding: 16 },
  recentRecipeEyebrow: { marginBottom: 4, color: '#929781', fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 1 },
  recentRecipeTitle: { color: '#1a1c1a', fontSize: 19, lineHeight: 27, fontWeight: '600' },
  homeCategoryList: { marginTop: 16, gap: 16 },
  homeCategoryCard: { height: 190, borderRadius: 12, backgroundColor: '#e3e2e0', overflow: 'hidden', shadowColor: '#2d2d2d', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  homeCategoryImage: { flex: 1, justifyContent: 'flex-end' },
  homeCategoryImageRadius: { borderRadius: 12 },
  homeCategoryOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(10,12,9,0.28)' },
  homeCategoryCopy: { padding: 16 },
  homeCategoryTitle: { color: '#fff', fontSize: 19, lineHeight: 26, fontWeight: '700' },
  homeCategoryCount: { marginTop: 3, color: 'rgba(255,255,255,0.78)', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  homeBottomSpacer: { height: 112 },
  recipeFormContent: { paddingHorizontal: 20, paddingBottom: 54, backgroundColor: '#faf9f6' },
  recipeFormTopBar: { height: 64, marginBottom: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recipeFormTopIcon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  recipeFormTopIconText: { color: '#181919', fontSize: 30, lineHeight: 34 },
  recipeFormLogo: { color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 28, fontWeight: '700' },
  recipeCoverPicker: { width: '100%', aspectRatio: 4 / 3, borderWidth: 2, borderStyle: 'dashed', borderColor: '#c4c7c7', borderRadius: 12, backgroundColor: '#e3e2e0', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  recipeCoverImage: { position: 'absolute', width: '100%', height: '100%' },
  recipeCoverPlaceholder: { position: 'absolute', width: '100%', height: '100%', backgroundColor: '#e3e2e0' },
  recipeCoverAction: { minWidth: 156, minHeight: 116, paddingHorizontal: 22, borderRadius: 58, backgroundColor: 'rgba(250,249,246,0.78)', alignItems: 'center', justifyContent: 'center' },
  recipeCoverIcon: { color: '#775a19', fontSize: 38, lineHeight: 42 },
  recipeCoverLabel: { marginTop: 5, color: '#181919', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  recipeTitleField: { marginTop: 32 },
  recipeFieldCaps: { marginBottom: 9, color: '#626562', fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 1.1 },
  recipeTitleInput: { minHeight: 56, borderBottomWidth: 1, borderBottomColor: '#c4c7c7', paddingVertical: 8, color: '#181919', fontSize: 28, lineHeight: 36, fontWeight: '600' },
  recipeFormSectionCompact: { marginTop: 32 },
  recipeCategoryRow: { gap: 8, paddingRight: 20 },
  recipeCategoryChip: { minHeight: 44, borderWidth: 1, borderColor: '#d6d6d2', borderRadius: 12, backgroundColor: '#f4f3f1', paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  recipeCategoryChipActive: { borderColor: '#775a19', backgroundColor: '#775a19' },
  recipeCategoryChipLabel: { color: '#444748', fontSize: 14, fontWeight: '700' },
  recipeCategoryChipLabelActive: { color: '#fff' },
  recipeMetaRow: { marginTop: 32, flexDirection: 'row', gap: 16 },
  recipeMetaColumn: { flex: 1 },
  recipeStepper: { height: 50, borderRadius: 12, backgroundColor: '#f4f3f1', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  recipeStepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  recipeStepperSymbol: { color: '#1a1c1a', fontSize: 22 },
  recipeStepperValue: { color: '#1a1c1a', fontSize: 21, fontWeight: '600' },
  recipeDifficultyRow: { height: 50, borderRadius: 12, backgroundColor: '#f4f3f1', flexDirection: 'row', padding: 4 },
  recipeDifficultyButton: { flex: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  recipeDifficultyButtonActive: { backgroundColor: '#fff', shadowColor: '#2d2d2d', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 5, elevation: 2 },
  recipeDifficultyLabel: { color: '#777a77', fontSize: 12, fontWeight: '700' },
  recipeDifficultyLabelActive: { color: '#775a19' },
  recipeEditorSection: { marginTop: 46 },
  recipeEditorHeader: { paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#181919', gap: 12 },
  recipeEditorTitle: { color: '#181919', fontSize: 24, lineHeight: 32, fontWeight: '600' },
  recipeInputModeTabs: { flexDirection: 'row', gap: 6 },
  recipeInputModeTab: { minHeight: 34, borderRadius: 17, backgroundColor: '#efeeeb', paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  recipeInputModeTabActive: { backgroundColor: '#775a19' },
  recipeInputModeLabel: { color: '#666966', fontSize: 11, fontWeight: '800' },
  recipeInputModeLabelActive: { color: '#fff' },
  recipeBulkInput: { minHeight: 112, marginTop: 14, borderRadius: 10, backgroundColor: '#f4f3f1', paddingHorizontal: 16, paddingVertical: 14, color: '#1a1c1a', fontSize: 16, lineHeight: 24, textAlignVertical: 'top' },
  recipeInputHelp: { marginTop: 8, color: '#777a77', fontSize: 11, lineHeight: 17 },
  recipeParsedList: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  recipeParsedChip: { minHeight: 32, borderRadius: 16, backgroundColor: '#e0e5cc', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  recipeParsedName: { color: '#2a2f1f', fontSize: 12, fontWeight: '700' },
  recipeParsedAmount: { color: '#666b58', fontSize: 12, fontWeight: '800' },
  recipeIngredientRow: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 7 },
  recipeIngredientInput: { width: 62, height: 48, borderRadius: 9, backgroundColor: '#f4f3f1', paddingHorizontal: 10, color: '#1a1c1a', fontSize: 14 },
  recipeIngredientNameInput: { flex: 1, width: 'auto' },
  recipeIngredientRemove: { width: 30, height: 42, alignItems: 'center', justifyContent: 'center' },
  recipeIngredientRemoveText: { color: '#93000a', fontSize: 22 },
  recipeAddButton: { minHeight: 42, marginTop: 12, alignSelf: 'center', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  recipeAddButtonLabel: { color: '#775a19', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 },
  recipeStepRow: { marginTop: 22, flexDirection: 'row', gap: 16 },
  recipeStepNumber: { width: 34, color: '#e9c176', fontSize: 24, lineHeight: 32, fontWeight: '600' },
  recipeStepBody: { flex: 1 },
  recipeSmallCaps: { marginBottom: 6, color: '#8b8d89', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  recipeStepInput: { minHeight: 92, borderRadius: 10, backgroundColor: '#f4f3f1', padding: 14, color: '#1a1c1a', fontSize: 15, lineHeight: 22, textAlignVertical: 'top' },
  recipeStepPhotoLabel: { marginTop: 16, marginBottom: 6, color: '#8b8d89', fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  recipeStepImagePicker: { width: '100%', aspectRatio: 16 / 9, borderWidth: 1, borderStyle: 'dashed', borderColor: '#c4c7c7', borderRadius: 10, backgroundColor: '#f4f3f1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  recipeStepImage: { width: '100%', height: '100%' },
  recipeStepImageIcon: { color: '#775a19', fontSize: 30, lineHeight: 34 },
  recipeStepImageLabel: { marginTop: 5, color: '#666966', fontSize: 11, fontWeight: '700' },
  recipeStepActions: { minHeight: 28, marginTop: 4, flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  recipeRemoveLabel: { marginTop: 7, color: '#93000a', fontSize: 11, fontWeight: '700', textAlign: 'right' },
  recipeMemoInput: { minHeight: 104, borderWidth: 1, borderColor: '#c4c7c7', borderRadius: 12, padding: 16, color: '#1a1c1a', fontSize: 15, lineHeight: 22, textAlignVertical: 'top' },
  recipeSingleInput: { height: 50, borderRadius: 10, backgroundColor: '#f4f3f1', paddingHorizontal: 14, color: '#1a1c1a', fontSize: 14 },
  recipeFormActions: { marginTop: 44, flexDirection: 'row', gap: 16 },
  recipeCancelButton: { flex: 1, height: 58, borderWidth: 1, borderColor: '#c4c7c7', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  recipeCancelLabel: { color: '#1a1c1a', fontSize: 19, fontWeight: '600' },
  recipeSaveButton: { flex: 1, height: 58, borderRadius: 12, backgroundColor: '#181919', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 8, elevation: 5 },
  recipeSaveLabel: { color: '#fff', fontSize: 19, fontWeight: '600' },
  recipeDetailScreen: { flex: 1, backgroundColor: '#faf9f6' },
  recipeDetailTopBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, height: 64, paddingHorizontal: 16, backgroundColor: 'rgba(250,249,246,0.92)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: 'rgba(196,199,199,0.22)' },
  recipeDetailTopButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  recipeDetailTopButtonText: { color: '#181919', fontSize: 32, lineHeight: 35 },
  recipeDetailMoreText: { color: '#181919', fontSize: 18, lineHeight: 22, letterSpacing: 1 },
  recipeDetailLogo: { color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 28, fontWeight: '700' },
  recipeDetailContent: { paddingBottom: 54, backgroundColor: '#faf9f6' },
  recipeDetailHero: { height: 500, backgroundColor: '#e3e2e0', overflow: 'hidden' },
  recipeDetailHeroImage: { width: '100%', height: '100%' },
  recipeDetailHeroFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#e3e2e0' },
  recipeDetailHeroShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(15,15,12,0.12)' },
  recipeDetailHeaderCard: { marginHorizontal: 20, marginTop: -92, borderWidth: 1, borderColor: 'rgba(227,226,224,0.7)', borderRadius: 12, backgroundColor: '#faf9f6', padding: 24, shadowColor: '#2d2d2d', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 6 },
  recipeDetailCardTopRow: { zIndex: 4, minHeight: 36, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  recipeDetailCategoryBadge: { minHeight: 28, borderRadius: 14, backgroundColor: 'rgba(254,212,136,0.28)', paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  recipeDetailCategoryBadgeText: { color: '#775a19', fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 0.8 },
  recipeDetailCategoryDropdown: { position: 'absolute', top: 34, left: 0, zIndex: 10, minWidth: 180, borderWidth: 1, borderColor: '#e3e2e0', borderRadius: 12, backgroundColor: '#fff', paddingVertical: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.16, shadowRadius: 12, elevation: 12 },
  recipeDetailCategoryOption: { minHeight: 44, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 18 },
  recipeDetailCategoryOptionText: { color: '#444748', fontSize: 14, fontWeight: '600' },
  recipeDetailCategoryOptionTextActive: { color: '#775a19', fontWeight: '800' },
  recipeDetailCategoryCheck: { color: '#775a19', fontSize: 15, fontWeight: '800' },
  recipeDetailTitleRow: { marginTop: 8, marginBottom: 22, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  recipeDetailHeaderActions: { paddingTop: 3, flexDirection: 'row', gap: 7 },
  recipeDetailCircleButton: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#f4f3f1', alignItems: 'center', justifyContent: 'center' },
  recipeDetailActionIcon: { color: '#181919', fontSize: 18, lineHeight: 21 },
  recipeDetailPdfIcon: { color: '#181919', fontSize: 8, lineHeight: 11, fontWeight: '900', letterSpacing: -0.2 },
  recipeDetailTitle: { flex: 1, color: '#181919', fontSize: 30, lineHeight: 39, fontWeight: '700' },
  recipeDetailInfoGrid: { minHeight: 100, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e3e2e0', flexDirection: 'row', alignItems: 'center' },
  recipeDetailInfoCell: { flex: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center' },
  recipeDetailInfoCellBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#e3e2e0' },
  recipeDetailInfoIcon: { color: '#6c6e6c', fontSize: 19, lineHeight: 22 },
  recipeDetailInfoLabel: { marginTop: 2, color: '#777977', fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 0.7 },
  recipeDetailInfoValue: { marginTop: 3, color: '#181919', fontSize: 16, lineHeight: 22, fontWeight: '700' },
  recipeDetailBody: { paddingHorizontal: 20 },
  recipeDetailMemo: { marginTop: 32, borderLeftWidth: 4, borderLeftColor: '#775a19', borderRadius: 12, backgroundColor: 'rgba(227,226,224,0.45)', padding: 22 },
  recipeDetailMemoLabel: { marginBottom: 8, color: '#775a19', fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 0.8 },
  recipeDetailMemoText: { color: '#444748', fontSize: 15, lineHeight: 24 },
  recipeDetailIngredientGrid: { marginTop: 32, gap: 16 },
  recipeDetailListCard: { borderRadius: 12, backgroundColor: '#f4f3f1', padding: 20 },
  recipeDetailListHeader: { paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(119,90,25,0.3)', flexDirection: 'row', alignItems: 'center', gap: 9 },
  recipeDetailListIcon: { color: '#775a19', fontSize: 18, lineHeight: 22 },
  recipeDetailListTitle: { color: '#181919', fontSize: 22, lineHeight: 30, fontWeight: '700' },
  recipeDetailListRow: { minHeight: 45, borderBottomWidth: 1, borderBottomColor: '#e3e2e0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  recipeDetailItemName: { flex: 1, color: '#1a1c1a', fontSize: 16, lineHeight: 23 },
  recipeDetailItemAmount: { color: '#666966', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  recipeDetailEmptyText: { paddingVertical: 14, color: '#777977', fontSize: 14, lineHeight: 21 },
  recipeDetailStepsSection: { marginTop: 44 },
  recipeDetailSectionHeading: { marginBottom: 24, flexDirection: 'row', alignItems: 'center', gap: 9 },
  recipeDetailSectionIcon: { color: '#775a19', fontSize: 21, lineHeight: 25 },
  recipeDetailSectionTitle: { color: '#181919', fontSize: 24, lineHeight: 32, fontWeight: '700' },
  recipeDetailStep: { marginBottom: 30, flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  recipeDetailStepNumber: { width: 40, height: 40, marginTop: 1, borderRadius: 20, backgroundColor: '#181919', alignItems: 'center', justifyContent: 'center' },
  recipeDetailStepNumberText: { color: '#fff', fontSize: 17, lineHeight: 21, fontWeight: '700' },
  recipeDetailStepBody: { flex: 1 },
  recipeDetailStepText: { paddingTop: 7, color: '#1a1c1a', fontSize: 16, lineHeight: 25 },
  recipeDetailStepImage: { width: '100%', aspectRatio: 16 / 9, marginTop: 16, borderRadius: 12, backgroundColor: '#e3e2e0' },
  recipeDetailCategorySection: { marginTop: 18, paddingTop: 26, borderTopWidth: 1, borderTopColor: '#e3e2e0' },
  recipeDetailCategorySectionTitle: { color: '#444748', fontSize: 12, lineHeight: 18, fontWeight: '800', letterSpacing: 0.8 },
  recipeDetailFolderChip: { minHeight: 38, borderWidth: 1, borderColor: '#d2d3d0', borderRadius: 19, backgroundColor: '#fff', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  recipeDetailFolderChipActive: { borderColor: '#775a19', backgroundColor: '#775a19' },
  recipeDetailFolderChipLabel: { color: '#666966', fontSize: 12, fontWeight: '700' },
  recipeDetailFolderChipLabelActive: { color: '#fff' },
  recipeDetailSource: { marginTop: 32, borderRadius: 12, backgroundColor: '#efeeeb', padding: 18 },
  recipeDetailSourceLabel: { marginBottom: 6, color: '#775a19', fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  recipeDetailSourceUrl: { color: '#444748', fontSize: 13, lineHeight: 20 },
  recipeBookTopBar: { height: 60, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(250,249,246,0.96)' },
  recipeBookTopButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  recipeBookTopIcon: { color: '#181919', fontSize: 23, lineHeight: 27 },
  recipeBookSettingsIcon: { color: '#181919', fontSize: 22, lineHeight: 26 },
  recipeBookLogo: { position: 'absolute', left: 62, right: 62, color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 28, lineHeight: 36, fontWeight: '700', textAlign: 'center' },
  recipeBookCategoryScroller: { flexGrow: 0, height: 52 },
  recipeBookCategories: { height: 52, paddingHorizontal: 20, paddingVertical: 8, gap: 10, alignItems: 'center' },
  recipeBookCategory: { minHeight: 36, borderWidth: 1, borderColor: 'rgba(116,120,120,0.28)', borderRadius: 18, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center' },
  recipeBookCategoryActive: { borderColor: '#181919', backgroundColor: '#181919' },
  recipeBookCategoryLabel: { color: '#5f625f', fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 0.5 },
  recipeBookCategoryLabelActive: { color: '#fff' },
  recipeBookSearchWrap: { height: 50, marginHorizontal: 20, marginTop: 16, borderRadius: 12, backgroundColor: '#f4f3f1', flexDirection: 'row', alignItems: 'center' },
  recipeBookSearchIcon: { width: 46, paddingLeft: 2, color: '#5f625f', fontSize: 25, lineHeight: 28, textAlign: 'center' },
  recipeBookSearchInput: { flex: 1, height: '100%', paddingRight: 15, color: '#1a1c1a', fontSize: 15 },
  recipeBookListHeader: { marginTop: 22, marginBottom: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  recipeBookListTitle: { color: '#181919', fontSize: 22, lineHeight: 30, fontWeight: '700' },
  recipeBookListCount: { color: '#737572', fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.5 },
  recipeBookListContent: { paddingHorizontal: 20, paddingBottom: 110, gap: 10 },
  recipeBookEmptyContent: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 100, justifyContent: 'center' },
  recipeBookRow: { minHeight: 106, borderWidth: 1, borderColor: 'transparent', borderRadius: 12, backgroundColor: '#fff', padding: 5, flexDirection: 'row', alignItems: 'center', gap: 14 },
  recipeBookRowPressed: { borderColor: 'rgba(196,199,199,0.5)', backgroundColor: '#f4f3f1', opacity: 0.88 },
  recipeBookRowImage: { width: 96, height: 96, borderRadius: 9, backgroundColor: '#e3e2e0' },
  recipeBookRowFallback: { width: 96, height: 96, borderRadius: 9, backgroundColor: '#e3e2e0', alignItems: 'center', justifyContent: 'center' },
  recipeBookRowBody: { flex: 1, minWidth: 0, paddingVertical: 5 },
  recipeBookRowTitle: { color: '#181919', fontSize: 18, lineHeight: 24, fontWeight: '700' },
  recipeBookRowMeta: { marginTop: 9, flexDirection: 'row', flexWrap: 'wrap', gap: 13 },
  recipeBookRowMetaText: { color: '#666966', fontSize: 12, lineHeight: 17, fontWeight: '500' },
  recipeBookChevron: { width: 22, color: 'rgba(116,120,120,0.45)', fontSize: 28, lineHeight: 32, textAlign: 'center' },
  recipeBookFab: { position: 'absolute', right: 20, bottom: 88, zIndex: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: '#181919', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 9, elevation: 8 },
  recipeBookFabIcon: { color: '#fff', fontSize: 31, lineHeight: 35, fontWeight: '300' },
  addChoiceScreen: { flex: 1, backgroundColor: '#f4f3f1' },
  addChoiceTopBar: { height: 64, paddingHorizontal: 20, backgroundColor: 'rgba(250,249,246,0.96)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  addChoiceTopButton: { width: 34, height: 44, alignItems: 'center', justifyContent: 'center' },
  addChoiceCloseIcon: { color: '#181919', fontSize: 31, lineHeight: 35, fontWeight: '300' },
  addChoiceLogo: { color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 25, lineHeight: 33, fontWeight: '700' },
  addChoiceContent: { paddingHorizontal: 20, paddingTop: 32, paddingBottom: 112, gap: 24 },
  addChoiceHeading: { marginBottom: 12, alignItems: 'center' },
  addChoiceTitle: { color: '#1a1c1a', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 28, lineHeight: 36, fontWeight: '700', textAlign: 'center' },
  addChoiceSubtitle: { maxWidth: 300, marginTop: 8, color: '#444748', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  addChoiceCard: { minHeight: 232, borderWidth: 1, borderColor: 'transparent', borderRadius: 12, backgroundColor: '#faf9f6', padding: 24, overflow: 'hidden', shadowColor: '#2d2d2d', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12, elevation: 2 },
  addChoiceCardPressed: { borderColor: '#c4c7c7', transform: [{ scale: 0.98 }] },
  addChoiceAccentTop: { position: 'absolute', top: -64, right: -64, width: 128, height: 128, borderRadius: 64, backgroundColor: 'rgba(119,90,25,0.06)' },
  addChoiceAccentBottom: { position: 'absolute', left: -48, bottom: -48, width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(224,229,204,0.5)' },
  addChoiceManualIcon: { width: 48, height: 48, marginBottom: 16, borderRadius: 24, backgroundColor: '#181919', alignItems: 'center', justifyContent: 'center' },
  addChoiceUrlIcon: { width: 48, height: 48, marginBottom: 16, borderRadius: 24, backgroundColor: '#775a19', alignItems: 'center', justifyContent: 'center' },
  addChoiceIconText: { color: '#fff', fontSize: 24, lineHeight: 28 },
  addChoiceCardTitle: { color: '#1a1c1a', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 24, lineHeight: 32, fontWeight: '600' },
  addChoiceCardBody: { marginTop: 4, color: '#444748', fontSize: 16, lineHeight: 24 },
  addChoiceLinkRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  addChoiceLink: { color: '#775a19', fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 1.1 },
  addChoiceArrow: { color: '#775a19', fontSize: 17, lineHeight: 20 },
  categoryManagerScreen: { flex: 1, backgroundColor: '#faf9f6' },
  categoryManagerTopBar: { height: 64, paddingHorizontal: 20, backgroundColor: 'rgba(250,249,246,0.96)', borderBottomWidth: 1, borderBottomColor: 'rgba(196,199,199,0.18)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryManagerTopButton: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  categoryManagerBackIcon: { color: '#181919', fontSize: 34, lineHeight: 38 },
  categoryManagerTitle: { color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 24, lineHeight: 32, fontWeight: '600' },
  categoryManagerContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 56 },
  categoryManagerIntro: { color: '#444748', fontSize: 16, lineHeight: 25 },
  categoryManagerAddButton: { height: 64, marginTop: 30, borderRadius: 12, backgroundColor: '#181919', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#2d2d2d', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.16, shadowRadius: 8, elevation: 5 },
  categoryManagerAddIcon: { color: '#fff', fontSize: 25, lineHeight: 28, fontWeight: '300' },
  categoryManagerAddLabel: { color: '#fff', fontSize: 19, lineHeight: 26, fontWeight: '700' },
  categoryManagerList: { marginTop: 28, gap: 14 },
  categoryManagerItem: { minHeight: 86, borderWidth: 1, borderColor: 'rgba(196,199,199,0.24)', borderRadius: 12, backgroundColor: '#fff', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, shadowColor: '#2d2d2d', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 1 },
  categoryManagerItemDragging: { zIndex: 20, borderColor: 'rgba(119,90,25,0.45)', shadowOpacity: 0.18, shadowRadius: 14, elevation: 10 },
  categoryManagerDragHandle: { width: 28, height: 58, alignItems: 'center', justifyContent: 'center' },
  categoryManagerDragIcon: { color: '#747878', fontSize: 25, lineHeight: 28, transform: [{ rotate: '90deg' }] },
  categoryManagerImage: { width: 58, height: 58, borderRadius: 9, backgroundColor: '#efeeeb' },
  categoryManagerItemBody: { flex: 1, minWidth: 0 },
  categoryManagerItemTitle: { color: '#181919', fontSize: 18, lineHeight: 25, fontWeight: '700' },
  categoryManagerItemCount: { marginTop: 3, color: '#747878', fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.8 },
  categoryManagerAction: { width: 34, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  categoryManagerEditIcon: { color: '#444748', fontSize: 19, lineHeight: 22 },
  categoryManagerDeleteIcon: { color: '#ba1a1a', fontSize: 20, lineHeight: 23 },
  categoryManagerQuote: { marginTop: 32, borderWidth: 1, borderColor: 'rgba(196,199,199,0.18)', borderRadius: 14, backgroundColor: '#f4f3f1', padding: 24 },
  categoryManagerQuoteTitle: { marginBottom: 8, color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 20, lineHeight: 28, fontWeight: '600' },
  categoryManagerQuoteText: { color: '#444748', fontSize: 14, lineHeight: 22, fontStyle: 'italic' },
  categoryManagerQuoteBy: { marginTop: 5, color: 'rgba(68,71,72,0.6)', fontSize: 12, lineHeight: 18 },
  categoryFormScreen: { flex: 1, backgroundColor: '#faf9f6' },
  categoryFormTopBar: { height: 64, paddingHorizontal: 20, backgroundColor: 'rgba(250,249,246,0.96)', borderBottomWidth: 1, borderBottomColor: 'rgba(196,199,199,0.18)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  categoryFormTopButton: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  categoryFormBackIcon: { color: '#181919', fontSize: 34, lineHeight: 38 },
  categoryFormTitle: { color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 24, lineHeight: 32, fontWeight: '600' },
  categoryFormContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 140 },
  categoryImagePicker: { width: '100%', aspectRatio: 4 / 3, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(196,199,199,0.55)', borderRadius: 12, backgroundColor: '#f4f3f1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  categoryImagePreview: { width: '100%', height: '100%' },
  categoryImageChangeBadge: { position: 'absolute', right: 12, bottom: 12, minHeight: 34, paddingHorizontal: 13, borderRadius: 17, backgroundColor: 'rgba(24,25,25,0.82)', alignItems: 'center', justifyContent: 'center' },
  categoryImageChangeBadgeText: { color: '#fff', fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.4 },
  categoryImagePlaceholder: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  categoryImageIcon: { color: '#444748', fontSize: 40, lineHeight: 44, fontWeight: '300' },
  categoryImageLabel: { color: '#444748', fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 1.1 },
  categoryImageHelp: { marginTop: 8, color: 'rgba(68,71,72,0.6)', fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.6, textAlign: 'center' },
  categoryPresetHeader: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  categoryPresetTitle: { color: '#1a1c1a', fontSize: 13, lineHeight: 18, fontWeight: '800' },
  categoryPresetDescription: { marginTop: 2, color: '#747878', fontSize: 10, lineHeight: 15 },
  categoryPresetRandomButton: { minHeight: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: '#e9e8e5', alignItems: 'center', justifyContent: 'center' },
  categoryPresetRandomLabel: { color: '#444748', fontSize: 11, lineHeight: 15, fontWeight: '800' },
  categoryPresetList: { paddingTop: 12, paddingBottom: 4, gap: 9 },
  categoryPresetItem: { width: 72, height: 58, padding: 2, borderWidth: 1, borderColor: 'transparent', borderRadius: 10 },
  categoryPresetItemSelected: { borderWidth: 2, borderColor: '#775a19' },
  categoryPresetImage: { width: '100%', height: '100%', borderRadius: 7, backgroundColor: '#e3e2e0' },
  categoryPresetCheck: { position: 'absolute', right: -2, bottom: -2, width: 20, height: 20, borderWidth: 2, borderColor: '#faf9f6', borderRadius: 10, backgroundColor: '#775a19', alignItems: 'center', justifyContent: 'center' },
  categoryPresetCheckText: { color: '#fff', fontSize: 10, lineHeight: 13, fontWeight: '900' },
  categoryField: { marginTop: 32 },
  categoryFieldLabel: { marginBottom: 8, color: '#775a19', fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 1.1 },
  categoryNameInput: { minHeight: 52, borderBottomWidth: 1, borderBottomColor: '#c4c7c7', paddingVertical: 8, color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 23, lineHeight: 31, fontWeight: '600' },
  categoryDescriptionInput: { minHeight: 104, borderRadius: 8, backgroundColor: '#f4f3f1', paddingHorizontal: 16, paddingVertical: 14, color: '#1a1c1a', fontSize: 16, lineHeight: 24, textAlignVertical: 'top' },
  categoryDecoration: { marginTop: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, opacity: 0.35 },
  categoryDecorationLine: { width: 32, height: 1, backgroundColor: '#747878' },
  categoryDecorationIcon: { color: '#444748', fontSize: 15, lineHeight: 18 },
  categoryFormFooter: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 88, borderTopWidth: 1, borderTopColor: 'rgba(196,199,199,0.28)', backgroundColor: 'rgba(250,249,246,0.97)', paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', gap: 16 },
  categoryCancelButton: { flex: 1, minHeight: 56, borderRadius: 8, backgroundColor: '#e9e8e5', alignItems: 'center', justifyContent: 'center' },
  categoryCancelLabel: { color: '#1a1c1a', fontSize: 18, lineHeight: 24, fontWeight: '600' },
  categorySaveButton: { flex: 2, minHeight: 56, borderRadius: 8, backgroundColor: '#181919', alignItems: 'center', justifyContent: 'center', shadowColor: '#181919', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 5 },
  categorySaveLabel: { color: '#fff', fontSize: 18, lineHeight: 24, fontWeight: '600' },
  simpleTopBar: { height: 60, paddingHorizontal: 16, backgroundColor: 'rgba(250,249,246,0.96)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  simpleTopBarTitle: { color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 25, lineHeight: 33, fontWeight: '700' },
  panel: { borderWidth: 1, borderColor: '#f0ddd5', borderRadius: 8, backgroundColor: '#fff', padding: 16, marginTop: 16 },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#2f211d', fontSize: 28, fontWeight: '900', lineHeight: 34 },
  textButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 2 },
  textButtonLabel: { color: '#d85e49', fontSize: 15, fontWeight: '800' },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallButton: { minHeight: 38, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#f0ddd5' },
  smallButtonLabel: { color: '#d85e49', fontSize: 14, fontWeight: '900' },
  smallButtonPrimary: { minHeight: 38, borderRadius: 8, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: '#ec6f59' },
  smallButtonPrimaryLabel: { color: '#fff', fontSize: 14, fontWeight: '900' },
  searchWrap: { paddingHorizontal: 16, gap: 10, paddingBottom: 8 },
  listContent: { paddingHorizontal: 16, paddingBottom: 112 },
  emptyListContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingBottom: 96 },
  recipeCard: { minHeight: 112, marginBottom: 12, borderWidth: 1, borderColor: '#f0ddd5', borderRadius: 8, backgroundColor: '#fff', flexDirection: 'row', overflow: 'hidden' },
  recipeImage: { width: 104, minHeight: 112, backgroundColor: '#f8e5dc' },
  recipeImageFallback: { width: 104, minHeight: 112, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8e5dc' },
  recipeImageText: { color: '#bf523f', fontSize: 32, fontWeight: '900' },
  recipeCardBody: { flex: 1, padding: 14 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { flex: 1, color: '#2f211d', fontSize: 18, fontWeight: '900' },
  favoriteMark: { marginLeft: 8, color: '#ec6f59', fontSize: 18 },
  cardMeta: { marginTop: 8, color: '#6f5f58', fontSize: 14, lineHeight: 20 },
  cardFooter: { marginTop: 10, color: '#9a8178', fontSize: 13, fontWeight: '700' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#f0ddd5' },
  iconButtonLabel: { color: '#ec6f59', fontSize: 21, lineHeight: 24 },
  deleteButton: { minHeight: 38, justifyContent: 'center', paddingHorizontal: 8 },
  deleteButtonLabel: { color: '#9d4435', fontSize: 14, fontWeight: '800' },
  detailContent: { padding: 20, paddingBottom: 44 },
  detailImage: { width: '100%', aspectRatio: 1.38, borderRadius: 8, backgroundColor: '#f8e5dc' },
  detailImageFallback: { width: '100%', aspectRatio: 1.38, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8e5dc' },
  detailTitle: { marginTop: 20, color: '#2f211d', fontSize: 30, fontWeight: '900', lineHeight: 36 },
  detailMeta: { marginTop: 8, color: '#8a766e', fontSize: 15, fontWeight: '700' },
  detailSection: { marginTop: 24 },
  sectionTitle: { color: '#2f211d', fontSize: 17, fontWeight: '900' },
  sectionBody: { marginTop: 8, color: '#4c3d38', fontSize: 16, lineHeight: 25 },
  formContent: { padding: 20, paddingBottom: 44 },
  screenPadded: { flexGrow: 1, padding: 20, paddingBottom: 112, backgroundColor: '#faf9f6' },
  field: { marginTop: 18 },
  fieldLabel: { marginBottom: 8, color: '#4c3d38', fontSize: 14, fontWeight: '900' },
  input: { minHeight: 50, borderWidth: 1, borderColor: '#f0ddd5', borderRadius: 8, backgroundColor: '#fff', paddingHorizontal: 14, color: '#2f211d', fontSize: 16, marginBottom: 10 },
  multilineInput: { minHeight: 96, paddingTop: 12, paddingBottom: 12, lineHeight: 23 },
  segment: { minHeight: 48, borderWidth: 1, borderColor: '#f0ddd5', borderRadius: 8, padding: 4, backgroundColor: '#fff3ee', flexDirection: 'row', marginBottom: 14 },
  segmentButton: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 6 },
  segmentButtonActive: { backgroundColor: '#fff' },
  segmentButtonLabel: { color: '#8a766e', fontSize: 14, fontWeight: '800' },
  segmentButtonLabelActive: { color: '#2f211d' },
  primaryButton: { minHeight: 52, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ec6f59', marginTop: 12 },
  compactButton: { minHeight: 42, paddingHorizontal: 18, marginTop: 0 },
  disabledButton: { opacity: 0.62 },
  primaryButtonLabel: { color: '#fff', fontSize: 16, fontWeight: '900' },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 22 },
  emptyTitle: { color: '#2f211d', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  emptyMessage: { marginTop: 8, color: '#786a64', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  notice: { position: 'absolute', left: 16, right: 16, bottom: 18, borderRadius: 8, backgroundColor: '#2f211d', paddingHorizontal: 14, paddingVertical: 12 },
  noticeText: { color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 80, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(250,249,246,0.98)', borderTopWidth: 1, borderTopColor: 'rgba(196,199,199,0.3)', paddingHorizontal: 6, paddingBottom: 8, shadowColor: '#2d2d2d', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 12 },
  tabButton: { flex: 1, minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabButtonActive: { backgroundColor: 'rgba(254,212,136,0.24)' },
  tabIcon: { marginBottom: 1, color: '#676a68', fontSize: 22, lineHeight: 25 },
  tabLabel: { color: '#676a68', fontSize: 9, fontWeight: '800', letterSpacing: 0.1 },
  tabLabelActive: { color: '#775a19' },
  tabCreateButton: { minHeight: 72, marginTop: -20, justifyContent: 'flex-start' },
  tabCreateIcon: { width: 50, height: 50, marginBottom: 2, borderWidth: 4, borderColor: '#faf9f6', borderRadius: 25, backgroundColor: '#181919', alignItems: 'center', justifyContent: 'center', shadowColor: '#181919', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.23, shadowRadius: 7, elevation: 8 },
  tabCreateIconActive: { backgroundColor: '#775a19' },
  tabCreateIconText: { marginTop: -3, color: '#fff', fontSize: 31, lineHeight: 34, fontWeight: '300' },
  tabCreateLabel: { color: '#444748', fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.1 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  horizontalChips: { paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  chip: { minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: '#f0ddd5', backgroundColor: '#fff', paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  chipActive: { backgroundColor: '#ec6f59', borderColor: '#ec6f59' },
  chipLabel: { color: '#6f5f58', fontSize: 14, fontWeight: '800' },
  chipLabelActive: { color: '#fff' },
  imagePicker: { width: '100%', aspectRatio: 1.6, marginTop: 16, borderRadius: 8, backgroundColor: '#f8e5dc', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  imagePickerImage: { width: '100%', height: '100%' },
  imagePickerText: { color: '#bf523f', fontSize: 16, fontWeight: '900' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(47,33,29,0.32)', justifyContent: 'flex-end' },
  modalPanel: { maxHeight: '88%', backgroundColor: '#faf9f6', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 18 },
  modalList: { maxHeight: 280, marginVertical: 12 },
  folderRow: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 8, borderBottomWidth: 1, borderBottomColor: '#f0ddd5' },
  folderThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#f8e5dc' },
  folderName: { flex: 1, color: '#2f211d', fontSize: 16, fontWeight: '800' },
  mealCalendarScreen: { flex: 1, backgroundColor: '#fcf9f8' },
  mealCalendarTopBar: { height: 64, paddingHorizontal: 16, backgroundColor: 'rgba(252,249,248,0.98)', borderBottomWidth: 1, borderBottomColor: 'rgba(107,92,76,0.08)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealCalendarBrandWrap: { alignItems: 'center' },
  mealCalendarBrand: { color: '#334537', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 22, lineHeight: 27, fontWeight: '700' },
  mealCalendarBrandSub: { marginTop: -2, color: '#6b5c4c', fontSize: 8, lineHeight: 11, fontWeight: '800', letterSpacing: 1.8 },
  mealCalendarContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 120 },
  mealCalendarMonthHeader: { marginBottom: 16, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  mealCalendarEyebrow: { marginBottom: 4, color: '#6b5c4c', fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 1.2 },
  mealCalendarMonth: { color: '#334537', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 27, lineHeight: 34, fontWeight: '600' },
  mealCalendarMonthActions: { flexDirection: 'row', gap: 6 },
  mealCalendarArrow: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0eded' },
  mealCalendarArrowText: { marginTop: -3, color: '#334537', fontSize: 31, lineHeight: 34, fontWeight: '400' },
  mealCalendarCard: { paddingHorizontal: 10, paddingTop: 14, paddingBottom: 10, borderWidth: 1, borderColor: 'rgba(107,92,76,0.10)', borderRadius: 14, backgroundColor: '#f6f3f2', shadowColor: '#6b5c4c', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  mealCalendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  mealCalendarWeekDay: { width: '14.2857%', paddingBottom: 9, color: '#737872', fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 0.8, textAlign: 'center' },
  mealCalendarDayCell: { width: '14.2857%', height: 45, alignItems: 'center', justifyContent: 'flex-start' },
  mealCalendarDayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  mealCalendarDayCircleActive: { backgroundColor: '#334537' },
  mealCalendarDayLabel: { color: '#1b1c1c', fontSize: 14, lineHeight: 18, fontWeight: '600' },
  mealCalendarDayLabelMuted: { color: '#c3c8c1' },
  mealCalendarDayLabelActive: { color: '#fff' },
  mealCalendarDot: { width: 4, height: 4, marginTop: 3, borderRadius: 2, backgroundColor: '#6b5c4c' },
  mealCalendarDotActive: { backgroundColor: '#334537' },
  mealLogSectionHeader: { marginTop: 34, marginBottom: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(107,92,76,0.14)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealLogSectionTitle: { color: '#334537', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 24, lineHeight: 31, fontWeight: '600' },
  mealLogDate: { marginTop: 3, color: '#737872', fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.2 },
  mealLogAddCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f4dfcb', alignItems: 'center', justifyContent: 'center' },
  mealLogAddCircleText: { marginTop: -2, color: '#524436', fontSize: 26, lineHeight: 30, fontWeight: '400' },
  mealLogList: { gap: 12 },
  mealLogCard: { minHeight: 116, padding: 12, borderWidth: 1, borderColor: 'rgba(107,92,76,0.08)', borderRadius: 14, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 14, shadowColor: '#6b5c4c', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 10, elevation: 2 },
  mealLogImage: { width: 92, height: 92, borderRadius: 10, backgroundColor: '#e4e2e1' },
  mealLogImageFallback: { width: 92, height: 92, borderRadius: 10, backgroundColor: '#d3e8d5', alignItems: 'center', justifyContent: 'center' },
  mealLogImageFallbackText: { color: '#394b3d', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 30, lineHeight: 38, fontWeight: '700' },
  mealLogCardBody: { flex: 1, minHeight: 86, justifyContent: 'center' },
  mealLogType: { marginBottom: 4, color: '#6b5c4c', fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 1 },
  mealLogTitle: { paddingRight: 20, color: '#1b1c1c', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 17, lineHeight: 23, fontWeight: '600' },
  mealLogNote: { marginTop: 5, paddingRight: 8, color: '#737872', fontSize: 12, lineHeight: 17 },
  mealLogOpenHint: { marginTop: 7, color: '#506354', fontSize: 10, lineHeight: 14, fontWeight: '800' },
  mealLogDelete: { position: 'absolute', top: 7, right: 8, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  mealLogDeleteText: { color: '#8d918c', fontSize: 23, lineHeight: 26, fontWeight: '400' },
  mealLogEmptyCard: { minHeight: 118, padding: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(115,120,114,0.38)', borderRadius: 14, backgroundColor: '#f6f3f2', alignItems: 'center', justifyContent: 'center' },
  mealLogEmptyIcon: { width: 34, height: 34, marginBottom: 8, borderRadius: 17, borderWidth: 1, borderColor: '#737872', alignItems: 'center', justifyContent: 'center' },
  mealLogEmptyIconText: { marginTop: -1, color: '#737872', fontSize: 22, lineHeight: 25 },
  mealLogEmptyTitle: { color: '#434843', fontSize: 11, lineHeight: 16, fontWeight: '800', letterSpacing: 0.8 },
  mealLogEmptyText: { marginTop: 5, color: '#737872', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  mealLogModalPanel: { maxHeight: '92%', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: '#fcf9f8' },
  mealLogModalHandle: { width: 42, height: 4, marginBottom: 16, borderRadius: 2, backgroundColor: '#c3c8c1', alignSelf: 'center' },
  mealLogModalHeader: { marginBottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealLogModalEyebrow: { marginBottom: 3, color: '#6b5c4c', fontSize: 10, lineHeight: 14, fontWeight: '800', letterSpacing: 1 },
  mealLogModalTitle: { color: '#334537', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 24, lineHeight: 31, fontWeight: '600' },
  mealLogModalClose: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#f0eded', alignItems: 'center', justifyContent: 'center' },
  mealLogModalCloseText: { color: '#434843', fontSize: 27, lineHeight: 30, fontWeight: '300' },
  mealLogSearchInput: { minHeight: 48, paddingHorizontal: 15, borderWidth: 1, borderColor: '#d6d8d4', borderRadius: 10, backgroundColor: '#fff', color: '#1b1c1c', fontSize: 15 },
  mealLogRecipeList: { maxHeight: 225, marginTop: 10 },
  mealLogRecipeOption: { minHeight: 68, marginBottom: 8, padding: 8, borderRadius: 10, backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 12 },
  mealLogRecipeOptionImage: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#e4e2e1' },
  mealLogRecipeOptionFallback: { width: 52, height: 52, borderRadius: 8, backgroundColor: '#d3e8d5', alignItems: 'center', justifyContent: 'center' },
  mealLogRecipeOptionTitle: { flex: 1, color: '#1b1c1c', fontSize: 15, lineHeight: 21, fontWeight: '700' },
  mealLogRecipeOptionAdd: { width: 30, color: '#506354', fontSize: 24, lineHeight: 28, textAlign: 'center' },
  mealLogNoRecipe: { paddingVertical: 22, color: '#737872', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  mealLogDivider: { marginVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  mealLogDividerLine: { flex: 1, height: 1, backgroundColor: '#e4e2e1' },
  mealLogDividerText: { color: '#737872', fontSize: 10, lineHeight: 14, fontWeight: '700' },
  mealLogManualInput: { minHeight: 46, marginBottom: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: '#d6d8d4', borderRadius: 10, backgroundColor: '#fff', color: '#1b1c1c', fontSize: 15 },
  mealLogManualNote: { minHeight: 70, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  mealLogSubmitButton: { minHeight: 50, marginTop: 2, borderRadius: 10, backgroundColor: '#334537', alignItems: 'center', justifyContent: 'center' },
  mealLogSubmitLabel: { color: '#fff', fontSize: 15, lineHeight: 20, fontWeight: '800' },
  premiumScreen: { flex: 1, backgroundColor: '#faf9f6' },
  premiumFlex: { flex: 1 },
  premiumTopBar: { height: 64, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(196,199,199,0.18)', backgroundColor: 'rgba(250,249,246,0.98)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  premiumCloseButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  premiumCloseText: { marginTop: -3, color: '#181919', fontSize: 31, lineHeight: 34, fontWeight: '300' },
  premiumTopTitle: { color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 24, lineHeight: 31, fontWeight: '700' },
  premiumContent: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 204 },
  premiumHero: { width: '100%', aspectRatio: 1.25, borderRadius: 14, overflow: 'hidden', justifyContent: 'flex-end', shadowColor: '#181919', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 14, elevation: 7 },
  premiumHeroImage: { borderRadius: 14 },
  premiumHeroOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(10,12,9,0.39)' },
  premiumHeroCopy: { paddingHorizontal: 18, paddingBottom: 19 },
  premiumHeroEyebrow: { marginBottom: 8, color: '#ffdea5', fontSize: 9, lineHeight: 13, fontWeight: '800', letterSpacing: 1.7 },
  premiumHeroTitle: { color: '#fff', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 26, lineHeight: 34, fontWeight: '700' },
  premiumActiveBanner: { marginTop: 16, padding: 14, borderRadius: 12, backgroundColor: '#2a2f1f', flexDirection: 'row', alignItems: 'center', gap: 12 },
  premiumActiveIcon: { width: 34, color: '#fed488', fontSize: 25, lineHeight: 30, textAlign: 'center' },
  premiumActiveTitle: { color: '#fff', fontSize: 15, lineHeight: 20, fontWeight: '800' },
  premiumActiveText: { marginTop: 2, color: '#c4c9b1', fontSize: 11, lineHeight: 16 },
  premiumSection: { marginTop: 32 },
  premiumSectionTitle: { marginBottom: 12, color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 22, lineHeight: 29, fontWeight: '700' },
  premiumBenefits: { gap: 10 },
  premiumBenefitCard: { minHeight: 78, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: 'rgba(196,199,199,0.25)', borderRadius: 12, backgroundColor: '#f4f3f1', flexDirection: 'row', alignItems: 'center', gap: 13 },
  premiumBenefitIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(254,212,136,0.25)', alignItems: 'center', justifyContent: 'center' },
  premiumBenefitIconText: { color: '#775a19', fontSize: 22, lineHeight: 27, fontWeight: '700' },
  premiumBenefitTitle: { color: '#1a1c1a', fontSize: 15, lineHeight: 20, fontWeight: '800' },
  premiumBenefitText: { marginTop: 3, paddingRight: 2, color: '#616460', fontSize: 11, lineHeight: 16 },
  premiumPlans: { gap: 12 },
  premiumPlanCard: { position: 'relative', minHeight: 152, padding: 16, paddingTop: 22, borderWidth: 1, borderColor: '#c4c7c7', borderRadius: 14, backgroundColor: '#f4f3f1', overflow: 'hidden' },
  premiumPlanCardSelected: { borderWidth: 2, borderColor: '#775a19', backgroundColor: '#fff', shadowColor: '#775a19', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.12, shadowRadius: 9, elevation: 4 },
  premiumPlanCardMonthly: { minHeight: 127, paddingTop: 16 },
  premiumPopularBadge: { position: 'absolute', top: 0, right: 0, paddingHorizontal: 13, paddingVertical: 5, borderBottomLeftRadius: 10, backgroundColor: '#775a19' },
  premiumPopularBadgeText: { color: '#fff', fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 0.7 },
  premiumPlanRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  premiumPlanTitle: { color: '#1a1c1a', fontSize: 16, lineHeight: 22, fontWeight: '800' },
  premiumPlanCaption: { marginTop: 4, color: '#676a68', fontSize: 12, lineHeight: 17 },
  premiumPlanPriceWrap: { alignItems: 'flex-end' },
  premiumPlanPriceGold: { color: '#775a19', fontSize: 24, lineHeight: 30, fontWeight: '900' },
  premiumPlanPrice: { color: '#181919', fontSize: 24, lineHeight: 30, fontWeight: '900' },
  premiumPlanUnit: { color: '#747878', fontSize: 10, lineHeight: 14 },
  premiumPlanDivider: { height: 1, marginTop: 14, marginBottom: 11, backgroundColor: 'rgba(196,199,199,0.42)' },
  premiumPlanFooter: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  premiumRadio: { width: 18, height: 18, borderWidth: 1.5, borderColor: '#8b8e8b', borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  premiumRadioSelected: { borderColor: '#775a19' },
  premiumRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#775a19' },
  premiumDiscount: { color: '#775a19', fontSize: 11, lineHeight: 15, fontWeight: '800' },
  premiumMonthlyHint: { color: '#676a68', fontSize: 11, lineHeight: 15, fontWeight: '700' },
  premiumLimitNote: { marginTop: 24, padding: 13, borderRadius: 10, backgroundColor: '#efeeeb', flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  premiumLimitNoteIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#747878', color: '#fff', fontSize: 12, lineHeight: 20, fontWeight: '800', textAlign: 'center' },
  premiumLimitNoteText: { flex: 1, color: '#5f625f', fontSize: 10, lineHeight: 16 },
  premiumLegal: { marginTop: 24, paddingHorizontal: 8, color: '#747878', fontSize: 9, lineHeight: 15, textAlign: 'center' },
  premiumCtaBar: { position: 'absolute', left: 0, right: 0, bottom: 80, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: 'rgba(196,199,199,0.22)', backgroundColor: 'rgba(250,249,246,0.98)', zIndex: 10 },
  premiumCta: { minHeight: 54, borderRadius: 12, backgroundColor: '#181919', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, shadowColor: '#181919', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 9, elevation: 6 },
  premiumCtaLabel: { color: '#fff', fontSize: 16, lineHeight: 22, fontWeight: '900' },
  premiumCtaSparkle: { color: '#fed488', fontSize: 19, lineHeight: 23 },
})
