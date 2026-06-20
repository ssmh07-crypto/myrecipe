import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Session } from '@supabase/supabase-js'
import { useFonts } from 'expo-font'
import { StatusBar } from 'expo-status-bar'
import * as ImagePicker from 'expo-image-picker'
import * as Print from 'expo-print'
import * as Sharing from 'expo-sharing'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
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
import { getFolderImage } from './src/lib/folderImages'
import { formatIngredientItems, parseIngredientText } from './src/lib/ingredients'
import { getPremiumAccess } from './src/lib/premium'
import { ensureRecipeFolders } from './src/lib/recipeFolders'
import { legacyRecipeSelectColumns, normalizeRecipe, normalizeRecipeInput, recipeSelectColumns, toRecipeRow } from './src/lib/recipes'
import { deleteImagePaths, getLegacyPublicImageUrl, hydrateRecipeImages, type LocalImageAsset, uploadRecipeImage, uploadRecipeStepImage } from './src/lib/storage'
import { hasSupabaseEnv, supabase } from './src/lib/supabaseClient'
import { emptyRecipeInput, type IngredientItem, type Recipe, type RecipeFolder, type RecipeInput } from './src/types/recipe'

type MainTab = 'recipes' | 'book' | 'calendar' | 'premium' | 'settings'
type Screen = 'main' | 'detail' | 'form' | 'import'
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
  { key: 'calendar', label: '캘린더' },
  { key: 'premium', label: '프리미엄' },
  { key: 'settings', label: '설정' },
]

const tabIcons: Record<MainTab, string> = {
  recipes: '⌂',
  book: '▤',
  calendar: '□',
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
  const { image_path, step_image_paths, ...row } = recipe
  return {
    ...row,
    image_url: image_path ? getLegacyPublicImageUrl(image_path) : recipe.image_url || null,
    step_images: recipe.step_images.map((url, index) => {
      const path = step_image_paths[index]
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
  const [notice, setNotice] = useState('')

  const user = session?.user ?? null
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
      let [recipeResult, itemResult, nextFolders, premium, rawMeals] = await Promise.all([
        supabase.from('recipes').select(recipeSelectColumns).order('created_at', { ascending: false }),
        supabase.from('recipe_folder_items').select('folder_id, recipe_id'),
        ensureRecipeFolders(user.id),
        getPremiumAccess(user.id).catch(() => false),
        AsyncStorage.getItem(mealStorageKey(user.id)),
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

      const nextRecipes = await Promise.all((recipeResult.data || []).map((recipe) => hydrateRecipeImages(normalizeRecipe(recipe as Partial<Recipe>))))
      setRecipes(nextRecipes)
      setFolderItems((itemResult.data || []) as FolderItem[])
      setFolders(nextFolders)
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
      if (screen === 'main') return true
      if (screen === 'detail') {
        setScreen('main')
        setSelectedId(null)
      } else if (screen === 'form' && formMode === 'edit') {
        setScreen('detail')
      } else {
        setScreen('main')
      }
      return true
    })
    return () => subscription.remove()
  }, [formMode, screen, session])

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

  const openNewRecipe = () => {
    setFormMode('new')
    setSelectedId(null)
    setFormInitialValue(emptyRecipeInput())
    setScreen('form')
  }

  const openEditRecipe = (recipe: Recipe) => {
    setFormMode('edit')
    setSelectedId(recipe.id)
    setFormInitialValue(normalizeRecipeInput(recipe))
    setScreen('form')
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
        const updated = await hydrateRecipeImages(normalizeRecipe(data as Partial<Recipe>))
        const retainedPaths = new Set([nextPayload.image_path, ...nextPayload.step_image_paths].filter(Boolean))
        const stalePaths = [selectedRecipe.image_path, ...selectedRecipe.step_image_paths].filter((path) => path && !retainedPaths.has(path))
        await deleteImagePaths(stalePaths).catch(() => undefined)
        savedRecipeId = updated.id
        setRecipes((current) => current.map((item) => (item.id === updated.id ? updated : item)))
        setSelectedId(updated.id)
      } else {
        const { data, error } = await writeRecipe(payload)
        if (error) throw new Error(error.message)
        let created = normalizeRecipe(data as Partial<Recipe>)
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
          created = await hydrateRecipeImages(normalizeRecipe(updated as Partial<Recipe>))
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
              onCreate={openNewRecipe}
              onImport={() => setScreen('import')}
            />
          )}
          {tab === 'book' && (
            <RecipeBookScreen
              recipes={recipes}
              folders={folders}
              folderItems={folderItems}
              onOpenRecipe={openRecipe}
              onReload={loadAll}
              onNotice={setNotice}
            />
          )}
          {tab === 'calendar' && (
            <CalendarScreen recipes={recipes} meals={meals} onSaveMeals={saveMeals} onOpenRecipe={openRecipe} />
          )}
          {tab === 'premium' && (
            <PremiumScreen hasPremium={hasPremium} loading={loading} onActivate={activatePremium} onImport={() => setScreen('import')} />
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
          initialFolderId={selectedId ? folderItems.find((item) => item.recipe_id === selectedId)?.folder_id || null : null}
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
    setLoading(true)
    try {
      const result = mode === 'login'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password })
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
              style={({ pressed }) => [styles.googleButton, pressed && styles.authButtonPressed]}
              onPress={() => onNotice('Google 로그인은 OAuth 설정 후 사용할 수 있습니다.')}
            >
              <Text style={styles.googleMark}>G</Text>
              <Text style={styles.googleButtonLabel}>Google로 로그인</Text>
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
  onCreate,
  onImport,
}: {
  recipes: Recipe[]
  folders: RecipeFolder[]
  folderItems: FolderItem[]
  loading: boolean
  onRefresh: () => void
  onOpenRecipe: (recipe: Recipe) => void
  onCreate: () => void
  onImport: () => void
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
          <View style={styles.homeTopIcon}><Text style={styles.homeTopIconText}>◌</Text></View>
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

      <Pressable style={({ pressed }) => [styles.homeFab, pressed && styles.authButtonPressed]} onPress={onCreate}>
        <Text style={styles.homeFabLabel}>＋</Text>
      </Pressable>
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

          {!!recipe.source_url && <View style={styles.recipeDetailSource}><Text style={styles.recipeDetailSourceLabel}>출처</Text><Text selectable style={styles.recipeDetailSourceUrl}>{recipe.source_url}</Text></View>}
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

  const submit = async () => {
    if (!url.trim()) return
    setImporting(true)
    try {
      const data = await importRecipeFromUrl(url.trim(), accessToken)
      onImported(normalizeRecipeInput({ ...emptyRecipeInput(), ...data, source_url: data.source_url || url.trim(), source_type: 'imported' }))
    } catch (error) {
      onNotice(error instanceof Error ? error.message : '레시피 가져오기에 실패했습니다.')
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
      <PrimaryButton label={importing || loading ? '가져오는 중...' : '레시피 가져오기'} disabled={importing || loading || !url.trim()} onPress={submit} />
    </View>
  )
}

function RecipeBookScreen({
  recipes,
  folders,
  folderItems,
  onOpenRecipe,
  onReload,
  onNotice,
}: {
  recipes: Recipe[]
  folders: RecipeFolder[]
  folderItems: FolderItem[]
  onOpenRecipe: (recipe: Recipe) => void
  onReload: () => void
  onNotice: (message: string) => void
}) {
  const [activeFolderId, setActiveFolderId] = useState('')
  const [showFavorites, setShowFavorites] = useState(false)
  const [query, setQuery] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingFolder, setEditingFolder] = useState<RecipeFolder | null>(null)

  const activeFolderRecipeIds = useMemo(
    () => new Set(folderItems.filter((item) => item.folder_id === activeFolderId).map((item) => item.recipe_id)),
    [activeFolderId, folderItems],
  )

  const visibleRecipes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return recipes.filter((recipe) => {
      const inFolder = activeFolderId ? activeFolderRecipeIds.has(recipe.id) : true
      const inFavorites = showFavorites ? recipe.is_favorite : true
      if (!normalizedQuery) return inFolder && inFavorites
      const matchesQuery = [recipe.title, recipe.memo, recipe.steps_text].join(' ').toLowerCase().includes(normalizedQuery)
      return inFolder && inFavorites && matchesQuery
    })
  }, [activeFolderId, activeFolderRecipeIds, query, recipes, showFavorites])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    folderItems.forEach((item) => map.set(item.folder_id, (map.get(item.folder_id) || 0) + 1))
    return map
  }, [folderItems])

  const deleteFolder = (folder: RecipeFolder) => {
    Alert.alert('카테고리 삭제', '레시피는 삭제되지 않습니다.', [
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
            setActiveFolderId('')
            onReload()
          }
        },
      },
    ])
  }

  return (
    <View style={styles.flex}>
      <View style={styles.recipeBookTopBar}>
        <Pressable accessibilityLabel="카테고리 관리" style={styles.recipeBookTopButton} onPress={() => { setEditingFolder(null); setModalOpen(true) }}><Text style={styles.recipeBookTopIcon}>☰</Text></Pressable>
        <Text style={styles.recipeBookLogo}>ReciPick</Text>
        <View style={styles.recipeBookTopButton}><Text style={styles.recipeBookTopIcon}>◌</Text></View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.recipeBookCategories}>
        <Pressable style={[styles.recipeBookCategory, !activeFolderId && !showFavorites && styles.recipeBookCategoryActive]} onPress={() => { setActiveFolderId(''); setShowFavorites(false) }}><Text style={[styles.recipeBookCategoryLabel, !activeFolderId && !showFavorites && styles.recipeBookCategoryLabelActive]}>전체</Text></Pressable>
        <Pressable style={[styles.recipeBookCategory, showFavorites && styles.recipeBookCategoryActive]} onPress={() => { setShowFavorites(true); setActiveFolderId('') }}><Text style={[styles.recipeBookCategoryLabel, showFavorites && styles.recipeBookCategoryLabelActive]}>즐겨찾기</Text></Pressable>
        {folders.map((folder) => (
          <Pressable key={folder.id} style={[styles.recipeBookCategory, activeFolderId === folder.id && styles.recipeBookCategoryActive]} onPress={() => { setActiveFolderId(folder.id); setShowFavorites(false) }}>
            <Text style={[styles.recipeBookCategoryLabel, activeFolderId === folder.id && styles.recipeBookCategoryLabelActive]}>{folder.name} · {counts.get(folder.id) || 0}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.recipeBookSearchWrap}>
        <Text style={styles.recipeBookSearchIcon}>⌕</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="레시피 제목을 입력하세요..." placeholderTextColor="#969793" style={styles.recipeBookSearchInput} />
      </View>

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
      <FolderModal
        visible={modalOpen}
        folders={folders}
        editingFolder={editingFolder}
        onEdit={setEditingFolder}
        onDelete={deleteFolder}
        onClose={() => setModalOpen(false)}
        onSaved={() => { setModalOpen(false); setEditingFolder(null); onReload() }}
        onNotice={onNotice}
      />
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

function FolderModal({
  visible,
  folders,
  editingFolder,
  onEdit,
  onDelete,
  onClose,
  onSaved,
  onNotice,
}: {
  visible: boolean
  folders: RecipeFolder[]
  editingFolder: RecipeFolder | null
  onEdit: (folder: RecipeFolder | null) => void
  onDelete: (folder: RecipeFolder) => void
  onClose: () => void
  onSaved: () => void
  onNotice: (message: string) => void
}) {
  const [name, setName] = useState('')
  const [imageUrl, setImageUrl] = useState('')

  useEffect(() => {
    setName(editingFolder?.name || '')
    setImageUrl(editingFolder?.image_url || '')
  }, [editingFolder])

  const save = async () => {
    if (!name.trim()) return
    let normalizedImageUrl: string | null = null
    if (imageUrl.trim()) {
      try {
        const parsed = new URL(imageUrl.trim())
        if (parsed.protocol !== 'https:') throw new Error()
        normalizedImageUrl = parsed.toString().slice(0, 2_000)
      } catch {
        onNotice('카테고리 이미지는 https URL만 사용할 수 있습니다.')
        return
      }
    }
    const payload = { name: name.trim().slice(0, 100), image_url: normalizedImageUrl }
    const { data: userResult } = await supabase.auth.getUser()
    if (!userResult.user) {
      onNotice('로그인이 필요합니다.')
      return
    }

    let result = editingFolder
      ? await supabase.from('recipe_folders').update(payload).eq('id', editingFolder.id).eq('user_id', userResult.user.id)
      : await supabase.from('recipe_folders').insert({ ...payload, user_id: userResult.user.id })

    if (result.error && result.error.message.toLowerCase().includes('image_url')) {
      result = editingFolder
        ? await supabase.from('recipe_folders').update({ name: payload.name }).eq('id', editingFolder.id).eq('user_id', userResult.user.id)
        : await supabase.from('recipe_folders').insert({ name: payload.name, user_id: userResult.user.id })
    }

    if (result.error) {
      onNotice(result.error.message)
      return
    }
    onSaved()
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalPanel}>
          <View style={styles.topBar}>
            <Text style={styles.sectionTitle}>카테고리 관리</Text>
            <Pressable style={styles.textButton} onPress={onClose}><Text style={styles.textButtonLabel}>닫기</Text></Pressable>
          </View>
          <Field label="이름" value={name} onChangeText={setName} placeholder="Quick Dinners" />
          <Field label="이미지 URL" value={imageUrl} onChangeText={setImageUrl} autoCapitalize="none" />
          <PrimaryButton label={editingFolder ? '수정 저장' : '새 카테고리 저장'} disabled={!name.trim()} onPress={save} />
          <ScrollView style={styles.modalList}>
            {folders.map((folder) => {
              const image = getFolderImage(folder).image
              return (
                <View key={folder.id} style={styles.folderRow}>
                  <Image source={{ uri: image }} style={styles.folderThumb} />
                  <Text style={styles.folderName}>{folder.name}</Text>
                  <Pressable style={styles.smallButton} onPress={() => onEdit(folder)}><Text style={styles.smallButtonLabel}>수정</Text></Pressable>
                  <Pressable style={styles.deleteButton} onPress={() => onDelete(folder)}><Text style={styles.deleteButtonLabel}>삭제</Text></Pressable>
                </View>
              )
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

function CalendarScreen({
  recipes,
  meals,
  onSaveMeals,
  onOpenRecipe,
}: {
  recipes: Recipe[]
  meals: MealEntry[]
  onSaveMeals: (meals: MealEntry[]) => void
  onOpenRecipe: (recipe: Recipe) => void
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
    const lastDay = new Date(year, month + 1, 0)
    const values: Array<{ key: string; label: string; muted: boolean; hasMeal: boolean }> = []
    for (let index = 0; index < firstDay.getDay(); index += 1) values.push({ key: `blank-${index}`, label: '', muted: true, hasMeal: false })
    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      const key = toDateKey(new Date(year, month, day))
      values.push({ key, label: String(day), muted: false, hasMeal: mealDateSet.has(key) })
    }
    return values
  }, [mealDateSet, monthDate])

  const selectedEntries = useMemo(() => meals.filter((entry) => entry.date === selectedDate), [meals, selectedDate])
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

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <View>
          <Text style={styles.kicker}>Meal Calendar</Text>
          <Text style={styles.title}>{monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</Text>
        </View>
        <View style={styles.rowActions}>
          <Pressable style={styles.smallButton} onPress={() => setMonthDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}><Text style={styles.smallButtonLabel}>‹</Text></Pressable>
          <Pressable style={styles.smallButton} onPress={() => setMonthDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}><Text style={styles.smallButtonLabel}>›</Text></Pressable>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.screenPadded}>
        <View style={styles.calendarGrid}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <Text key={day} style={styles.weekDay}>{day}</Text>)}
          {days.map((day) => (
            <Pressable key={day.key} disabled={day.muted} style={[styles.dayCell, selectedDate === day.key && styles.dayCellActive]} onPress={() => setSelectedDate(day.key)}>
              <Text style={[styles.dayLabel, selectedDate === day.key && styles.dayLabelActive]}>{day.label}</Text>
              {day.hasMeal && <View style={[styles.mealDot, selectedDate === day.key && styles.mealDotActive]} />}
            </Pressable>
          ))}
        </View>
        <View style={styles.topBar}>
          <Text style={styles.sectionTitle}>{selectedDate}</Text>
          <Pressable style={styles.smallButtonPrimary} onPress={() => setModalOpen(true)}><Text style={styles.smallButtonPrimaryLabel}>추가</Text></Pressable>
        </View>
        {selectedEntries.length ? selectedEntries.map((entry) => (
          <Pressable key={entry.id} style={styles.mealRow} onPress={() => {
            const recipe = entry.recipeId ? recipesById.get(entry.recipeId) : null
            if (recipe) onOpenRecipe(recipe)
          }}>
            <View style={styles.flex}><Text style={styles.cardTitle}>{entry.title}</Text><Text style={styles.cardMeta}>{entry.type === 'recipe' ? '저장된 레시피' : entry.note || '직접 입력'}</Text></View>
            <Pressable style={styles.deleteButton} onPress={() => removeEntry(entry.id)}><Text style={styles.deleteButtonLabel}>삭제</Text></Pressable>
          </Pressable>
        )) : <EmptyState title="기록이 없습니다" message="오늘 먹은 레시피를 추가해보세요." />}
      </ScrollView>
      <Modal visible={modalOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalPanel}>
            <View style={styles.topBar}><Text style={styles.sectionTitle}>식단 추가</Text><Pressable style={styles.textButton} onPress={() => setModalOpen(false)}><Text style={styles.textButtonLabel}>닫기</Text></Pressable></View>
            <Field label="레시피 검색" value={query} onChangeText={setQuery} />
            <ScrollView style={styles.modalList}>
              {filteredRecipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} onPress={() => addRecipeEntry(recipe)} />)}
            </ScrollView>
            <Field label="직접 입력" value={manualTitle} onChangeText={setManualTitle} placeholder="오늘 먹은 음식" />
            <Field label="메모" value={manualNote} onChangeText={setManualNote} multiline />
            <PrimaryButton label="직접 입력 추가" disabled={!manualTitle.trim()} onPress={addManualEntry} />
          </View>
        </View>
      </Modal>
    </View>
  )
}

function PremiumScreen({
  hasPremium,
  loading,
  onActivate,
  onImport,
}: {
  hasPremium: boolean
  loading: boolean
  onActivate: (plan: 'monthly' | 'yearly') => void
  onImport: () => void
}) {
  return (
    <ScrollView contentContainerStyle={styles.screenPadded}>
      <Text style={styles.kicker}>Premium</Text>
      <Text style={styles.heroTitle}>URL 레시피 가져오기를 잠금 해제하세요</Text>
      <Text style={styles.heroText}>웹사이트 레시피를 재료, 양념, 조리 과정으로 정리해 개인 레시피 초안으로 저장합니다.</Text>
      <View style={styles.planCard}>
        <Text style={styles.sectionTitle}>Yearly</Text>
        <Text style={styles.price}>$19/year</Text>
        <Text style={styles.cardMeta}>100 imports/30 days · 10 imports/day</Text>
        <PrimaryButton label={hasPremium ? 'Premium Active' : loading ? '처리 중...' : 'Yearly 시작'} disabled={hasPremium || loading} onPress={() => onActivate('yearly')} />
      </View>
      <View style={styles.planCard}>
        <Text style={styles.sectionTitle}>Monthly</Text>
        <Text style={styles.price}>$1.90/month</Text>
        <Text style={styles.cardMeta}>100 imports/30 days · 10 imports/day</Text>
        <PrimaryButton label={hasPremium ? 'Premium Active' : loading ? '처리 중...' : 'Monthly 시작'} disabled={hasPremium || loading} onPress={() => onActivate('monthly')} />
      </View>
      {hasPremium && <PrimaryButton label="URL 레시피 가져오기" onPress={onImport} />}
      <Text style={styles.finePrint}>영상, SNS, 유료 콘텐츠 우회, 저작권 침해성 가져오기는 지원하지 않습니다.</Text>
    </ScrollView>
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
      {tabs.map((item) => (
        <Pressable key={item.key} style={[styles.tabButton, active === item.key && styles.tabButtonActive]} onPress={() => onChange(item.key)}>
          <Text style={[styles.tabIcon, active === item.key && styles.tabLabelActive]}>{tabIcons[item.key]}</Text>
          <Text style={[styles.tabLabel, active === item.key && styles.tabLabelActive]}>{item.label}</Text>
        </Pressable>
      ))}
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
  safeArea: { flex: 1, backgroundColor: '#fff8f5' },
  safeAreaDark: { backgroundColor: '#161612' },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mutedText: { marginTop: 12, color: '#786a64', fontSize: 15 },
  kicker: { color: '#ec6f59', fontSize: 13, fontWeight: '800', letterSpacing: 0, textTransform: 'uppercase' },
  heroTitle: { marginTop: 8, color: '#2f211d', fontSize: 33, fontWeight: '900', lineHeight: 40 },
  heroText: { marginTop: 12, color: '#6f5f58', fontSize: 16, lineHeight: 24 },
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
  homeFab: { position: 'absolute', right: 20, bottom: 84, width: 56, height: 56, borderRadius: 28, backgroundColor: '#775a19', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.24, shadowRadius: 9, elevation: 8 },
  homeFabLabel: { color: '#fff', fontSize: 32, lineHeight: 36, fontWeight: '300' },
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
  recipeBookLogo: { position: 'absolute', left: 62, right: 62, color: '#181919', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }), fontSize: 28, lineHeight: 36, fontWeight: '700', textAlign: 'center' },
  recipeBookCategories: { minHeight: 56, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8, gap: 10, alignItems: 'center' },
  recipeBookCategory: { minHeight: 36, borderWidth: 1, borderColor: 'rgba(116,120,120,0.28)', borderRadius: 18, paddingHorizontal: 17, alignItems: 'center', justifyContent: 'center' },
  recipeBookCategoryActive: { borderColor: '#181919', backgroundColor: '#181919' },
  recipeBookCategoryLabel: { color: '#5f625f', fontSize: 11, lineHeight: 15, fontWeight: '800', letterSpacing: 0.5 },
  recipeBookCategoryLabelActive: { color: '#fff' },
  recipeBookSearchWrap: { height: 50, marginHorizontal: 20, marginTop: 16, borderRadius: 12, backgroundColor: '#f4f3f1', flexDirection: 'row', alignItems: 'center' },
  recipeBookSearchIcon: { width: 46, paddingLeft: 2, color: '#5f625f', fontSize: 25, lineHeight: 28, textAlign: 'center' },
  recipeBookSearchInput: { flex: 1, height: '100%', paddingRight: 15, color: '#1a1c1a', fontSize: 15 },
  recipeBookListHeader: { marginTop: 30, marginBottom: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
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
  screenPadded: { padding: 20, paddingBottom: 112 },
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
  tabBar: { position: 'absolute', left: 0, right: 0, bottom: 0, minHeight: 76, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(250,249,246,0.97)', borderTopWidth: 1, borderTopColor: 'rgba(196,199,199,0.3)', paddingHorizontal: 8, paddingBottom: 8, shadowColor: '#2d2d2d', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 12 },
  tabButton: { flex: 1, minHeight: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabButtonActive: { backgroundColor: 'rgba(254,212,136,0.24)' },
  tabIcon: { marginBottom: 1, color: '#676a68', fontSize: 21, lineHeight: 24 },
  tabLabel: { color: '#676a68', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  tabLabelActive: { color: '#775a19' },
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
  modalPanel: { maxHeight: '88%', backgroundColor: '#fff8f5', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 18 },
  modalList: { maxHeight: 280, marginVertical: 12 },
  folderRow: { flexDirection: 'row', alignItems: 'center', minHeight: 64, gap: 8, borderBottomWidth: 1, borderBottomColor: '#f0ddd5' },
  folderThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#f8e5dc' },
  folderName: { flex: 1, color: '#2f211d', fontSize: 16, fontWeight: '800' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 20 },
  weekDay: { width: '13.2%', textAlign: 'center', color: '#8a766e', fontSize: 12, fontWeight: '900', paddingVertical: 6 },
  dayCell: { width: '13.2%', aspectRatio: 1, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#f0ddd5' },
  dayCellActive: { backgroundColor: '#ec6f59', borderColor: '#ec6f59' },
  dayLabel: { color: '#2f211d', fontSize: 14, fontWeight: '900' },
  dayLabelActive: { color: '#fff' },
  mealDot: { position: 'absolute', bottom: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: '#ec6f59' },
  mealDotActive: { backgroundColor: '#fff' },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#f0ddd5', padding: 12, marginBottom: 10 },
  planCard: { borderWidth: 1, borderColor: '#f0ddd5', borderRadius: 8, backgroundColor: '#fff', padding: 18, marginTop: 16 },
  price: { color: '#2f211d', fontSize: 30, fontWeight: '900', marginTop: 8 },
  finePrint: { marginTop: 18, color: '#8a766e', fontSize: 12, lineHeight: 18, textAlign: 'center' },
})
