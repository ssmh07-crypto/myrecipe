import { supabase } from './supabaseClient'

const bucketName = 'recipe-images'

const getExtension = (file: File) => {
  const fallback = file.type.split('/')[1] || 'jpg'
  const extension = file.name.split('.').pop()?.toLowerCase() || fallback
  return extension === 'jpeg' ? 'jpg' : extension
}

const uploadImage = async (userId: string, recipeId: string, file: File, folder = 'cover') => {
  const path = `${userId}/${recipeId}/${folder}/${crypto.randomUUID()}.${getExtension(file)}`
  const { error } = await supabase.storage.from(bucketName).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  })
  if (error) throw new Error(`이미지 업로드 실패: ${error.message}`)

  const { data } = supabase.storage.from(bucketName).getPublicUrl(path)
  return data.publicUrl
}

export const uploadRecipeImage = (userId: string, recipeId: string, file: File) => uploadImage(userId, recipeId, file, 'cover')

export const uploadRecipeStepImage = (userId: string, recipeId: string, stepIndex: number, file: File) =>
  uploadImage(userId, recipeId, file, `steps/${stepIndex}`)
