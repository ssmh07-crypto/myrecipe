export type RecipeSourceType = 'manual' | 'url' | 'youtube' | 'text'

export type RecipeDifficulty = '쉬움' | '보통' | '어려움'

export interface RecipeInput {
  title: string
  description: string
  image_url: string
  servings: number | null
  cooking_time: string
  difficulty: RecipeDifficulty
  ingredients: string[]
  seasonings: string[]
  steps: string[]
  tips: string[]
  tags: string[]
  personal_note: string
  next_time_note: string
  source_url: string
  source_type: RecipeSourceType
  youtube_video_id: string
  is_favorite: boolean
}

export interface Recipe extends RecipeInput {
  id: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface AiSuggestion {
  id: string
  user_id: string
  recipe_id: string
  request_text: string
  suggestion: AiSuggestionPayload
  created_at: string
}

export interface AiSuggestionPayload {
  summary: string
  updated_recipe: Partial<RecipeInput>
  shopping_list: string[]
  notes: string[]
}

export const emptyRecipeInput = (): RecipeInput => ({
  title: '',
  description: '',
  image_url: '',
  servings: 1,
  cooking_time: '',
  difficulty: '보통',
  ingredients: [''],
  seasonings: [''],
  steps: [''],
  tips: [],
  tags: [],
  personal_note: '',
  next_time_note: '',
  source_url: '',
  source_type: 'manual',
  youtube_video_id: '',
  is_favorite: false,
})
