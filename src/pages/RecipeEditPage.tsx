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
      setError(nextError instanceof Error ? nextError.message : '레시피 수정에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />
  if (error || !recipe) return <ErrorState message={error || '레시피를 찾을 수 없습니다.'} />

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-stone-950">레시피 수정</h1>
      <RecipeForm initialValue={recipe} submitLabel="수정 완료" loading={saving} onSubmit={updateRecipe} />
    </section>
  )
}
