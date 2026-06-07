import { supabase } from './supabaseClient'

const bucketName = 'recipe-images'

const getExtension = (file: File) => {
  const fallback = file.type.split('/')[1] || 'jpg'
  return file.name.split('.').pop()?.toLowerCase() || fallback
}

export const uploadRecipeImage = async (userId: string, recipeId: string, file: File) => {
  const path = `${userId}/${recipeId}/${crypto.randomUUID()}.${getExtension(file)}`
  const { error } = await supabase.storage.from(bucketName).upload(path, file, {
    cacheControl: '3600',
    upsert: true,
  })
  if (error) throw new Error(`이미지 업로드 실패: ${error.message}`)

  const { data } = supabase.storage.from(bucketName).getPublicUrl(path)
  return data.publicUrl
}
