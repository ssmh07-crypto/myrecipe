import { normalizeIngredientItems } from './ingredients'
import type { Recipe, RecipeInput } from '../types/recipe'

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
  if (value === '\uc26c\uc6c0') return 'Easy'
  if (value === '\ubcf4\ud1b5') return 'Medium'
  if (value === '\uc5b4\ub824\uc6c0') return 'Hard'
  return value || 'Easy'
}

export const normalizeRecipe = (recipe: LegacyRecipe): Recipe => ({
  ...(recipe as Recipe),
  title: recipe.title || '',
  image_url: recipe.image_url || '',
  servings: recipe.servings ?? 1,
  difficulty: normalizeDifficulty(recipe.difficulty),
  ingredients: normalizeIngredientItems(recipe.ingredients),
  seasonings: normalizeIngredientItems(recipe.seasonings),
  steps_text: recipe.steps_text || recipe.steps?.join('\n') || '',
  step_images: Array.isArray(recipe.step_images) ? recipe.step_images : [],
  memo: recipe.memo || [recipe.personal_note, recipe.next_time_note].filter(Boolean).join('\n') || '',
  source_url: recipe.source_url || '',
  source_type: recipe.source_type === 'imported' ? 'imported' : 'manual',
  is_favorite: Boolean(recipe.is_favorite),
})

export const normalizeRecipeInput = (recipe: Partial<RecipeInput>): RecipeInput => ({
  title: recipe.title || '',
  image_url: recipe.image_url || '',
  servings: recipe.servings ?? 1,
  difficulty: normalizeDifficulty(recipe.difficulty),
  ingredients: normalizeIngredientItems(recipe.ingredients),
  seasonings: normalizeIngredientItems(recipe.seasonings),
  steps_text: recipe.steps_text || '',
  step_images: Array.isArray(recipe.step_images) ? recipe.step_images : [],
  memo: recipe.memo || '',
  source_url: recipe.source_url || '',
  source_type: recipe.source_type === 'imported' ? 'imported' : 'manual',
  is_favorite: Boolean(recipe.is_favorite),
})
