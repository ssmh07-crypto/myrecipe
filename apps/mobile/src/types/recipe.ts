export type RecipeSourceType = 'manual' | 'imported'

export interface IngredientItem {
  name: string
  amount: string
  unit: string
}

export interface RecipeInput {
  title: string
  image_url: string
  image_path: string
  servings: number | null
  difficulty: string
  ingredients: IngredientItem[]
  seasonings: IngredientItem[]
  steps_text: string
  step_images: string[]
  step_image_paths: string[]
  memo: string
  source_url: string
  source_type: RecipeSourceType
  is_favorite: boolean
}

export interface Recipe extends RecipeInput {
  id: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface RecipeFolder {
  id: string
  user_id: string
  name: string
  image_url?: string
  created_at: string
  updated_at: string
}

export interface RecipeFolderItem {
  id: string
  user_id: string
  folder_id: string
  recipe_id: string
  created_at: string
}

export const emptyRecipeInput = (): RecipeInput => ({
  title: '',
  image_url: '',
  image_path: '',
  servings: 1,
  difficulty: 'Easy',
  ingredients: [],
  seasonings: [],
  steps_text: '',
  step_images: [],
  step_image_paths: [],
  memo: '',
  source_url: '',
  source_type: 'manual',
  is_favorite: false,
})
