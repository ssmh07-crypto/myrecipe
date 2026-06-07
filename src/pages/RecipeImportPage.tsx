import { Wand2 } from 'lucide-react'
import { useState } from 'react'
import { RecipeForm } from '../components/recipe/RecipeForm'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { importRecipeFromUrl } from '../lib/apiClient'
import { supabase } from '../lib/supabaseClient'
import { emptyRecipeInput, type RecipeInput } from '../types/recipe'
import { useNavigate } from 'react-router-dom'

export const RecipeImportPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [recipe, setRecipe] = useState<RecipeInput | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const importRecipe = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await importRecipeFromUrl(url)
      setRecipe({ ...emptyRecipeInput(), ...data, source_url: data.source_url || url, source_type: 'url' })
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '가져오기에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const saveRecipe = async (value: RecipeInput) => {
    if (!user) return
    const { data, error: nextError } = await supabase.from('recipes').insert({ ...value, user_id: user.id }).select('id').single()
    if (nextError) throw new Error(nextError.message)
    navigate(`/recipes/${data.id}`)
  }

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-stone-950">URL에서 가져오기</h1>
      <div className="space-y-3 rounded-xl border border-amber-100 bg-white p-4">
        <input className="w-full rounded-lg border border-amber-100 px-3 py-3 text-sm outline-none focus:border-amber-500" placeholder="https://example.com/recipe" value={url} onChange={(event) => setUrl(event.target.value)} />
        <Button className="w-full" disabled={loading || !url} onClick={importRecipe}>
          <Wand2 size={18} /> AI로 정리하기
        </Button>
      </div>
      {error ? <ErrorState message={error} /> : null}
      {recipe ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-stone-700">저장 전 내용을 확인하고 수정하세요.</p>
          <RecipeForm initialValue={recipe} submitLabel="내 레시피로 저장" onSubmit={saveRecipe} />
        </div>
      ) : null}
    </section>
  )
}
