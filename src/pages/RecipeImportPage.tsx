import { Wand2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RecipeForm } from '../components/recipe/RecipeForm'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { importRecipeFromUrl, importRecipeFromYoutube } from '../lib/apiClient'
import { supabase } from '../lib/supabaseClient'
import { emptyRecipeInput, type RecipeInput } from '../types/recipe'

const isYoutubeUrl = (value: string) => {
  try {
    const url = new URL(value)
    return url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')
  } catch {
    return false
  }
}

export const RecipeImportPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [manualText, setManualText] = useState('')
  const [recipe, setRecipe] = useState<RecipeInput | null>(null)
  const [fallbackMessage, setFallbackMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const importRecipe = async () => {
    setLoading(true)
    setError('')
    setFallbackMessage('')
    try {
      if (isYoutubeUrl(url)) {
        const data = await importRecipeFromYoutube(url, manualText || undefined)
        if ('needs_manual_text' in data) {
          setFallbackMessage(data.message)
          return
        }
        setRecipe({
          ...emptyRecipeInput(),
          ...data,
          source_url: data.source_url || url,
          source_type: 'youtube',
          youtube_video_id: data.youtube_video_id || '',
        })
        return
      }

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
      <div>
        <h1 className="text-2xl font-bold text-stone-950">링크로 가져오기</h1>
        <p className="mt-1 text-sm text-stone-500">블로그, 웹사이트, 유튜브 링크를 붙여넣으면 AI가 레시피로 정리합니다.</p>
      </div>
      <div className="space-y-3 rounded-xl border border-amber-100 bg-white p-4">
        <input className="w-full rounded-lg border border-amber-100 px-3 py-3 text-sm outline-none focus:border-amber-500" placeholder="레시피 링크 또는 유튜브 링크" value={url} onChange={(event) => setUrl(event.target.value)} />
        {isYoutubeUrl(url) ? (
          <textarea
            className="w-full rounded-lg border border-amber-100 px-3 py-3 text-sm outline-none focus:border-amber-500"
            rows={5}
            placeholder="유튜브 자막을 가져올 수 없는 경우를 대비해 영상 설명이나 자막 텍스트를 붙여넣을 수 있습니다."
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
          />
        ) : null}
        <Button className="w-full" disabled={loading || !url} onClick={importRecipe}>
          <Wand2 size={18} /> 레시피 뽑기
        </Button>
      </div>
      {fallbackMessage ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{fallbackMessage}</p> : null}
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
