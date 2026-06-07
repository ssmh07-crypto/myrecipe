import type { RecipeInput } from '../types/recipe'
import { uploadRecipeImage, uploadRecipeStepImage } from './storage'

interface RecipeImageUploadOptions {
  userId: string
  recipeId: string
  recipe: RecipeInput
  imageFile?: File | null
  removeImage?: boolean
  stepImageFiles?: Record<number, File>
  removeStepImageIndexes?: number[]
}

export const uploadRecipeAssets = async ({
  userId,
  recipeId,
  recipe,
  imageFile = null,
  removeImage = false,
  stepImageFiles = {},
  removeStepImageIndexes = [],
}: RecipeImageUploadOptions) => {
  const stepImages = [...recipe.step_images]
  removeStepImageIndexes.forEach((index) => {
    stepImages[index] = ''
  })

  const [imageUrl, stepUploads] = await Promise.all([
    imageFile ? uploadRecipeImage(userId, recipeId, imageFile) : Promise.resolve(removeImage ? '' : recipe.image_url),
    Promise.all(
      Object.entries(stepImageFiles).map(async ([index, file]) => ({
        index: Number(index),
        url: await uploadRecipeStepImage(userId, recipeId, Number(index), file),
      })),
    ),
  ])

  stepUploads.forEach(({ index, url }) => {
    stepImages[index] = url
  })

  return {
    image_url: imageUrl,
    step_images: stepImages,
  }
}
