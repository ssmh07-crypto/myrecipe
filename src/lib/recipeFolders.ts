import { supabase } from './supabaseClient'
import type { RecipeFolder } from '../types/recipe'

export const defaultRecipeFolderNames = ['Chicken', 'MEAT', 'FISH', 'PASTA']

export const ensureRecipeFolders = async (userId: string) => {
  const { data, error } = await supabase
    .from('recipe_folders')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  if (data?.length) return data as RecipeFolder[]

  const { data: created, error: createError } = await supabase
    .from('recipe_folders')
    .insert(defaultRecipeFolderNames.map((name) => ({ name, user_id: userId })))
    .select('*')
    .order('created_at', { ascending: true })

  if (createError) throw new Error(createError.message)
  return (created || []) as RecipeFolder[]
}
