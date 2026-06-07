import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RecipeForm } from '../components/recipe/RecipeForm'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'
import { emptyRecipeInput, type RecipeInput } from '../types/recipe'

export const RecipeNewPage = ({ initialRecipe }: { initialRecipe?: RecipeInput }) => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const createRecipe = async (recipe: RecipeInput) => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase.from('recipes').insert({ ...recipe, user_id: user.id }).select('id').single()
    setLoading(false)
    if (error) throw new Error(error.message)
    navigate(`/recipes/${data.id}`)
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-stone-950">레시피 작성</h1>
      <RecipeForm initialValue={initialRecipe || emptyRecipeInput()} submitLabel="저장하기" loading={loading} onSubmit={createRecipe} />
    </section>
  )
}
