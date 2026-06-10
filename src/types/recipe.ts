export type RecipeSourceType = 'manual' | 'imported'

export interface IngredientItem {
  name: string
  amount: string
  unit: string
}

export interface RecipeInput {
  title: string
  image_url: string
  servings: number | null
  difficulty: string
  ingredients: IngredientItem[]
  seasonings: IngredientItem[]
  steps_text: string
  step_images: string[]
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

export interface RecipeFormResult {
  recipe: RecipeInput
  imageFile: File | null
  removeImage: boolean
  stepImageFiles: Record<number, File>
  removeStepImageIndexes: number[]
}

export const emptyRecipeInput = (): RecipeInput => ({
  title: '',
  image_url: '',
  servings: 1,
  difficulty: 'Easy',
  ingredients: [],
  seasonings: [],
  steps_text: '',
  step_images: [],
  memo: '',
  source_url: '',
  source_type: 'manual',
  is_favorite: false,
})
