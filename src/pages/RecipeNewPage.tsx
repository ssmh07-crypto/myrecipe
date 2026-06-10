import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RecipeForm } from '../components/recipe/RecipeForm'
import { ErrorState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { uploadRecipeAssets } from '../lib/recipePersistence'
import { normalizeRecipeInput } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import { emptyRecipeInput, type RecipeFormResult, type RecipeInput } from '../types/recipe'

export const RecipeNewPage = ({ initialRecipe }: { initialRecipe?: RecipeInput }) => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const createRecipe = async ({ recipe, imageFile, stepImageFiles }: RecipeFormResult) => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const { data, error } = await supabase.from('recipes').insert({ ...recipe, user_id: user.id }).select('id').single()
      if (error) throw new Error(error.message)
      if (imageFile || Object.keys(stepImageFiles).length) {
        const assets = await uploadRecipeAssets({ userId: user.id, recipeId: data.id, recipe, imageFile, stepImageFiles })
        await supabase.from('recipes').update(assets).eq('id', data.id)
      }
      navigate(`/recipes/${data.id}`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to save recipe.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6 pb-8">
      <section className="mt-2">
        <h1 className="text-[28px] font-bold leading-[34px] text-[#1b1c1c]">New Recipe</h1>
        <p className="text-base leading-6 text-[#564338]">Capture your culinary masterpiece with precision.</p>
      </section>
      {error ? <ErrorState message={error} /> : null}
      <RecipeForm initialValue={normalizeRecipeInput(initialRecipe || emptyRecipeInput())} submitLabel="Save Recipe" loading={loading} onSubmit={createRecipe} actionLayout="sticky" />
    </section>
  )
}
