import { Wand2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RecipeForm } from '../components/recipe/RecipeForm'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { importRecipeFromYoutube } from '../lib/apiClient'
import { supabase } from '../lib/supabaseClient'
import { emptyRecipeInput, type RecipeInput } from '../types/recipe'

export const YoutubeImportPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [manualText, setManualText] = useState('')
  const [fallbackMessage, setFallbackMessage] = useState('')
  const [recipe, setRecipe] = useState<RecipeInput | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const importRecipe = async () => {
    setLoading(true)
    setError('')
    setFallbackMessage('')
    try {
      const data = await importRecipeFromYoutube(youtubeUrl, manualText || undefined)
      if ('needs_manual_text' in data) {
        setFallbackMessage(data.message)
      } else {
        setRecipe({ ...emptyRecipeInput(), ...data, source_url: data.source_url || youtubeUrl, source_type: 'youtube', youtube_video_id: data.youtube_video_id || '' })
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '유튜브 변환에 실패했습니다.')
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
      <h1 className="text-2xl font-bold text-stone-950">유튜브에서 가져오기</h1>
      <div className="space-y-3 rounded-xl border border-amber-100 bg-white p-4">
        <input className="w-full rounded-lg border border-amber-100 px-3 py-3 text-sm outline-none focus:border-amber-500" placeholder="https://www.youtube.com/watch?v=..." value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} />
        <textarea className="w-full rounded-lg border border-amber-100 px-3 py-3 text-sm outline-none focus:border-amber-500" rows={6} placeholder="자막이 없거나 틱톡/릴스라면 설명, 자막, 조리 내용을 붙여넣으세요." value={manualText} onChange={(event) => setManualText(event.target.value)} />
        <Button className="w-full" disabled={loading || !youtubeUrl} onClick={importRecipe}>
          <Wand2 size={18} /> AI로 레시피 변환
        </Button>
      </div>
      {fallbackMessage ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{fallbackMessage}</p> : null}
      {error ? <ErrorState message={error} /> : null}
      {recipe ? <RecipeForm initialValue={recipe} submitLabel="내 레시피로 저장" onSubmit={saveRecipe} /> : null}
    </section>
  )
}
