import { Lock, Sparkles, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { RecipeForm } from '../components/recipe/RecipeForm'
import { Button } from '../components/ui/Button'
import { ErrorState, LoadingState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { usePremiumAccess } from '../hooks/usePremiumAccess'
import { importRecipeFromUrl } from '../lib/apiClient'
import { uploadRecipeAssets } from '../lib/recipePersistence'
import { normalizeRecipeInput } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import { emptyRecipeInput, type RecipeFormResult, type RecipeInput } from '../types/recipe'

export const RecipeImportPage = () => {
  const { user } = useAuth()
  const { hasImportAccess, loading: accessLoading, error: accessError } = usePremiumAccess()
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [recipe, setRecipe] = useState<RecipeInput | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const importRecipe = async () => {
    if (!hasImportAccess) return
    setLoading(true)
    setError('')
    try {
      const data = await importRecipeFromUrl(url)
      setRecipe(normalizeRecipeInput({ ...emptyRecipeInput(), ...data, source_url: data.source_url || url, source_type: 'imported' }))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '가져오기에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const saveRecipe = async ({ recipe: value, imageFile, stepImageFiles }: RecipeFormResult) => {
    if (!user) return
    setSaving(true)
    setError('')
    try {
      const { data, error: nextError } = await supabase.from('recipes').insert({ ...value, user_id: user.id }).select('id').single()
      if (nextError) throw new Error(nextError.message)
      if (imageFile || Object.keys(stepImageFiles).length) {
        const assets = await uploadRecipeAssets({ userId: user.id, recipeId: data.id, recipe: value, imageFile, stepImageFiles })
        await supabase.from('recipes').update(assets).eq('id', data.id)
      }
      navigate(`/recipes/${data.id}`)
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '레시피 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (accessLoading) return <LoadingState />

  if (!hasImportAccess) {
    return (
      <section className="space-y-4">
        <div className="rounded-xl border border-amber-100 bg-white p-5 shadow-sm">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-[#ffdbd0] text-[#9a4022]">
            <Lock size={24} />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-stone-950">링크로 가져오기는 결제 후 이용할 수 있어요</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            프리미엄 결제가 완료되면 블로그나 웹사이트 레시피 URL을 붙여넣어 개인 레시피 초안으로 정리할 수 있습니다.
          </p>
          {accessError ? <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{accessError}</p> : null}
          <Link to="/premium" className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#9a4022] px-4 py-2 text-sm font-semibold text-white">
            <Sparkles size={18} /> 결제하고 기능 열기
          </Link>
          <Link to="/recipes/new" className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
            직접 레시피 작성하기
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-stone-950">링크로 가져오기</h1>
        <p className="mt-1 text-sm text-stone-500">권한이 있는 블로그나 웹사이트 레시피 URL을 정리해 개인 레시피 초안으로 저장합니다.</p>
      </div>
      <div className="space-y-3 rounded-xl border border-amber-100 bg-white p-4">
        <input className="w-full rounded-lg border border-amber-100 px-3 py-3 text-sm outline-none focus:border-amber-500" placeholder="레시피 링크 붙여넣기" value={url} onChange={(event) => setUrl(event.target.value)} />
        <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-stone-600">
          영상/SNS 자동 추출, 유료 콘텐츠 우회, 저작권을 침해하는 저장은 지원하지 않습니다.
        </p>
        <Button className="w-full" disabled={loading || !url} onClick={importRecipe}>
          <Wand2 size={18} /> 레시피 뽑기
        </Button>
      </div>
      {error ? <ErrorState message={error} /> : null}
      {recipe ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-stone-700">저장 전 내용을 확인하고 수정하세요.</p>
          <RecipeForm initialValue={recipe} submitLabel="내 레시피로 저장" loading={saving} onSubmit={saveRecipe} />
        </div>
      ) : null}
    </section>
  )
}
