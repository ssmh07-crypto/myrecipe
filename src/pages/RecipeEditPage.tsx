import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { RecipeForm } from '../components/recipe/RecipeForm'
import { ErrorState, LoadingState } from '../components/ui/State'
import { uploadRecipeAssets } from '../lib/recipePersistence'
import { normalizeRecipe } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import type { Recipe, RecipeFormResult } from '../types/recipe'

export const RecipeEditPage = () => {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!id) return
      const { data, error: nextError } = await supabase.from('recipes').select('*').eq('id', id).single()
      setLoading(false)
      if (nextError) setError(nextError.message)
      else setRecipe(normalizeRecipe(data as Recipe))
    }
    load()
  }, [id])

  const updateRecipe = async ({ recipe: value, imageFile, removeImage, stepImageFiles, removeStepImageIndexes }: RecipeFormResult) => {
    if (!id || !user) return
    setSaving(true)
    setError('')
    try {
      const assets = await uploadRecipeAssets({ userId: user.id, recipeId: id, recipe: value, imageFile, removeImage, stepImageFiles, removeStepImageIndexes })
      const { error: nextError } = await supabase.from('recipes').update({ ...value, ...assets }).eq('id', id)
      if (nextError) throw new Error(nextError.message)
      navigate(`/recipes/${id}`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to update recipe.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />
  if (error || !recipe) return <ErrorState message={error || 'Recipe not found.'} />

  return (
    <section className="mx-auto max-w-2xl space-y-6 pb-8">
      <section className="mt-2">
        <h1 className="text-[28px] font-bold leading-[34px] text-[#1b1c1c]">Edit Recipe</h1>
        <p className="text-base leading-6 text-[#564338]">Capture your culinary masterpiece with precision.</p>
      </section>
      <RecipeForm initialValue={recipe} submitLabel="Save Recipe" loading={saving} onSubmit={updateRecipe} actionLayout="sticky" />
    </section>
  )
}
