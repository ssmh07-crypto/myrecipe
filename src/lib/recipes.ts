import { normalizeIngredientItems } from './ingredients'
import type { Recipe, RecipeInput } from '../types/recipe'

type LegacyRecipe = Partial<Recipe> & {
  description?: string
  steps?: string[]
  personal_note?: string
  next_time_note?: string
  source_type?: string
}

export const normalizeRecipe = (recipe: LegacyRecipe): Recipe => ({
  ...(recipe as Recipe),
  title: recipe.title || '',
  image_url: recipe.image_url || '',
  servings: recipe.servings ?? 1,
  ingredients: normalizeIngredientItems(recipe.ingredients),
  seasonings: normalizeIngredientItems(recipe.seasonings),
  steps_text: recipe.steps_text || recipe.steps?.join('\n') || '',
  memo: recipe.memo || [recipe.personal_note, recipe.next_time_note].filter(Boolean).join('\n') || '',
  source_url: recipe.source_url || '',
  source_type: recipe.source_type === 'imported' ? 'imported' : 'manual',
})

export const normalizeRecipeInput = (recipe: Partial<RecipeInput>): RecipeInput => ({
  title: recipe.title || '',
  image_url: recipe.image_url || '',
  servings: recipe.servings ?? 1,
  ingredients: normalizeIngredientItems(recipe.ingredients),
  seasonings: normalizeIngredientItems(recipe.seasonings),
  steps_text: recipe.steps_text || '',
  memo: recipe.memo || '',
  source_url: recipe.source_url || '',
  source_type: recipe.source_type === 'imported' ? 'imported' : 'manual',
})
