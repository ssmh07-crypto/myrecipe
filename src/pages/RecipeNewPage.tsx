import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RecipeForm } from '../components/recipe/RecipeForm'
import { useAuth } from '../hooks/useAuth'
import { normalizeRecipeInput } from '../lib/recipes'
import { uploadRecipeImage } from '../lib/storage'
import { supabase } from '../lib/supabaseClient'
import { emptyRecipeInput, type RecipeFormResult, type RecipeInput } from '../types/recipe'

export const RecipeNewPage = ({ initialRecipe }: { initialRecipe?: RecipeInput }) => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const createRecipe = async ({ recipe, imageFile }: RecipeFormResult) => {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase.from('recipes').insert({ ...recipe, user_id: user.id }).select('id').single()
      if (error) throw new Error(error.message)
      if (imageFile) {
        const imageUrl = await uploadRecipeImage(user.id, data.id, imageFile)
        await supabase.from('recipes').update({ image_url: imageUrl }).eq('id', data.id)
      }
      navigate(`/recipes/${data.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-stone-950">레시피 작성</h1>
      <RecipeForm initialValue={normalizeRecipeInput(initialRecipe || emptyRecipeInput())} submitLabel="저장하기" loading={loading} onSubmit={createRecipe} />
    </section>
  )
}
