import { supabase } from './supabaseClient'
import type { RecipeFolder } from '../types/recipe'

export const defaultRecipeFolderNames = ['Chicken', 'MEAT', 'FISH', 'PASTA']
const folderSelectColumns = 'id,user_id,name,image_url,description,sort_order,created_at,updated_at'
const legacyFolderSelectColumns = 'id,user_id,name,image_url,created_at,updated_at'

export const ensureRecipeFolders = async (userId: string) => {
  let { data, error } = await supabase
    .from('recipe_folders')
    .select(folderSelectColumns)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  let supportsSortOrder = true
  if (error && /sort_order|description/i.test(error.message)) {
    supportsSortOrder = false
    const legacyResult = await supabase.from('recipe_folders').select(legacyFolderSelectColumns).order('created_at', { ascending: true })
    data = legacyResult.data as typeof data
    error = legacyResult.error
  }

  if (error) throw new Error(error.message)
  if (data?.length) return data as RecipeFolder[]

  const createResult = supportsSortOrder
    ? await supabase
      .from('recipe_folders')
      .insert(defaultRecipeFolderNames.map((name, index) => ({ name, user_id: userId, sort_order: index })))
      .select(folderSelectColumns)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    : await supabase
      .from('recipe_folders')
      .insert(defaultRecipeFolderNames.map((name) => ({ name, user_id: userId })))
      .select(legacyFolderSelectColumns)
      .order('created_at', { ascending: true })

  if (createResult.error) throw new Error(createResult.error.message)
  return (createResult.data || []) as unknown as RecipeFolder[]
}
