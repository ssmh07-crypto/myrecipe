import type { Recipe, RecipeInput } from '../types/recipe'
import type { Database, Json } from '../types/database.generated'
import { normalizeIngredientItems } from './ingredients'

export const recipeSelectColumns = 'id,user_id,title,servings,difficulty,image_url,image_path,ingredients,seasonings,steps_text,step_images,step_image_paths,memo,source_url,source_type,is_favorite,created_at,updated_at'
export const legacyRecipeSelectColumns = 'id,user_id,title,servings,difficulty,image_url,ingredients,seasonings,steps_text,step_images,memo,source_url,source_type,is_favorite,created_at,updated_at'

type LegacyRecipe = Partial<Recipe> & {
  description?: string
  steps?: string[]
  personal_note?: string
  next_time_note?: string
  source_type?: string
  difficulty?: string
  is_favorite?: boolean
  step_images?: string[]
}

const normalizeDifficulty = (value?: string) => {
  if (value === '쉬움') return 'Easy'
  if (value === '보통') return 'Medium'
  if (value === '어려움') return 'Hard'
  return ['Easy', 'Medium', 'Hard'].includes(value || '') ? value! : 'Easy'
}

const cleanText = (value: unknown, maxLength: number) => String(value || '').trim().slice(0, maxLength)
const cleanUrl = (value: unknown) => {
  const url = cleanText(value, 2_000)
  if (!url) return ''
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol) ? url : ''
  } catch {
    return ''
  }
}

const cleanStringArray = (value: unknown, maxItems = 100) =>
  Array.isArray(value) ? value.slice(0, maxItems).map((item) => cleanText(item, 2_000)) : []

const storageUrlMarker = '/storage/v1/object/public/recipe-images/'
const getStoragePath = (value: unknown) => {
  const url = String(value || '')
  const markerIndex = url.indexOf(storageUrlMarker)
  if (markerIndex < 0) return ''
  try {
    return decodeURIComponent(url.slice(markerIndex + storageUrlMarker.length)).slice(0, 1_000)
  } catch {
    return ''
  }
}

const getStepImagePaths = (images: unknown, paths: unknown) => {
  const normalizedImages = cleanStringArray(images)
  const normalizedPaths = cleanStringArray(paths)
  return Array.from({ length: Math.max(normalizedImages.length, normalizedPaths.length) }, (_, index) =>
    normalizedPaths[index] || getStoragePath(normalizedImages[index]),
  )
}

export const normalizeRecipe = (value: unknown): Recipe => {
  const recipe = value && typeof value === 'object' ? value as LegacyRecipe : {}
  return {
  ...(recipe as Recipe),
  title: cleanText(recipe.title, 200),
  image_url: cleanUrl(recipe.image_url),
  image_path: cleanText(recipe.image_path, 1_000) || getStoragePath(recipe.image_url),
  servings: Math.min(100, Math.max(1, Number(recipe.servings) || 1)),
  difficulty: normalizeDifficulty(recipe.difficulty),
  ingredients: normalizeIngredientItems(recipe.ingredients),
  seasonings: normalizeIngredientItems(recipe.seasonings),
  steps_text: cleanText(recipe.steps_text || recipe.steps?.join('\n'), 50_000),
  step_images: cleanStringArray(recipe.step_images),
  step_image_paths: getStepImagePaths(recipe.step_images, recipe.step_image_paths),
  memo: cleanText(recipe.memo || [recipe.personal_note, recipe.next_time_note].filter(Boolean).join('\n'), 10_000),
  source_url: cleanUrl(recipe.source_url),
  source_type: recipe.source_type === 'imported' ? 'imported' : 'manual',
  is_favorite: Boolean(recipe.is_favorite),
  }
}

export const normalizeRecipeInput = (recipe: Partial<RecipeInput>): RecipeInput => ({
  title: cleanText(recipe.title, 200),
  image_url: cleanUrl(recipe.image_url),
  image_path: cleanText(recipe.image_path, 1_000) || getStoragePath(recipe.image_url),
  servings: Math.min(100, Math.max(1, Number(recipe.servings) || 1)),
  difficulty: normalizeDifficulty(recipe.difficulty),
  ingredients: normalizeIngredientItems(recipe.ingredients),
  seasonings: normalizeIngredientItems(recipe.seasonings),
  steps_text: cleanText(recipe.steps_text, 50_000),
  step_images: cleanStringArray(recipe.step_images),
  step_image_paths: getStepImagePaths(recipe.step_images, recipe.step_image_paths),
  memo: cleanText(recipe.memo, 10_000),
  source_url: cleanUrl(recipe.source_url),
  source_type: recipe.source_type === 'imported' ? 'imported' : 'manual',
  is_favorite: Boolean(recipe.is_favorite),
})

const toJson = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json

type RecipeWriteRow = Database['public']['Tables']['recipes']['Update'] & { title: string }

export const toRecipeRow = (recipe: RecipeInput): RecipeWriteRow => ({
  title: recipe.title,
  servings: recipe.servings,
  difficulty: recipe.difficulty,
  ingredients: toJson(recipe.ingredients),
  seasonings: toJson(recipe.seasonings),
  steps_text: recipe.steps_text,
  memo: recipe.memo,
  source_url: recipe.source_url,
  source_type: recipe.source_type,
  is_favorite: recipe.is_favorite,
  image_url: recipe.image_path ? null : recipe.image_url || null,
  image_path: recipe.image_path || null,
  step_images: toJson(recipe.step_images.map((url, index) => recipe.step_image_paths[index] ? '' : url)),
  step_image_paths: toJson(recipe.step_image_paths),
})
