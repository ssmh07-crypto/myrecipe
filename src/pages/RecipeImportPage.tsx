import { CloudSync, Link2, Lock, Sparkles, Wand2, X, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

const PremiumFeatureCard = ({
  icon: Icon,
  title,
  description,
  tone,
}: {
  icon: LucideIcon
  title: string
  description: string
  tone: 'secondary' | 'tertiary'
}) => (
  <div className="flex min-h-36 flex-col items-start gap-2 rounded-xl border border-[#ddc1b3] bg-white p-4 shadow-sm">
    <span className={`grid h-9 w-9 place-items-center rounded-lg ${tone === 'secondary' ? 'bg-[#c8f17a]/50 text-[#496800]' : 'bg-[#ffdfa0]/60 text-[#765700]'}`}>
      <Icon size={21} />
    </span>
    <span className="text-sm font-semibold leading-5 text-[#1b1c1c]">{title}</span>
    <span className="text-xs font-medium leading-4 text-[#564338]">{description}</span>
  </div>
)

const ImportPremiumGate = ({ accessError }: { accessError?: string }) => {
  const navigate = useNavigate()

  return (
    <section className="relative flex min-h-[calc(100dvh-2rem)] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top_right,#ffdbc9_0%,#fbf9f8_58%)] px-4 py-8">
      <button
        type="button"
        aria-label="Close"
        className="absolute right-4 top-4 grid min-h-11 min-w-11 place-items-center rounded-full bg-white text-[#564338] shadow-sm transition hover:bg-[#e4e2e1] active:scale-95"
        onClick={() => navigate('/recipes/add')}
      >
        <X size={22} />
      </button>

      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <section className="flex flex-col items-center gap-6 text-center">
          <div className="relative grid h-32 w-32 place-items-center">
            <div className="absolute inset-0 rounded-full bg-[#ffdbc9]/70" />
            <div className="relative grid h-24 w-24 place-items-center rounded-xl border border-[#ddc1b3] bg-white shadow-lg">
              <Link2 size={54} className="text-[#974400]" />
              <div className="absolute -bottom-2 -right-2 grid h-12 w-12 place-items-center rounded-full border-4 border-[#fbf9f8] bg-[#974400] text-white shadow-md">
                <Lock size={22} fill="currentColor" />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="px-3 text-[28px] font-bold leading-[34px] text-[#1b1c1c]">Import from Link는 Premium 기능입니다.</h1>
            <p className="px-5 text-lg leading-7 text-[#564338]">
              웹사이트 레시피를 자동으로 정리해 재료와 조리 과정을 빠르게 저장하세요.
            </p>
          </div>
        </section>

        <section className="grid w-full grid-cols-2 gap-4">
          <PremiumFeatureCard
            icon={Zap}
            title="Smart Import"
            description="재료와 조리 단계를 자동으로 추출합니다."
            tone="secondary"
          />
          <PremiumFeatureCard
            icon={CloudSync}
            title="Unlimited Sync"
            description="저장한 레시피를 여러 기기에서 확인합니다."
            tone="tertiary"
          />
        </section>

        {accessError ? <p className="w-full rounded-lg bg-[#ffdad6] p-3 text-xs font-medium leading-5 text-[#93000a]">{accessError}</p> : null}

        <section className="flex w-full flex-col items-center gap-4">
          <button
            type="button"
            className="relative flex min-h-14 w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-[#974400] px-5 py-3 text-sm font-semibold text-white shadow-lg transition hover:shadow-xl active:scale-[0.98]"
            onClick={() => navigate('/premium')}
          >
            <span className="absolute inset-0 animate-[premium-shimmer_3s_linear_infinite] bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.36)_50%,rgba(255,255,255,0)_100%)] bg-[length:200%_100%]" />
            <Sparkles size={20} fill="currentColor" className="relative" />
            <span className="relative">Premium 열기</span>
          </button>
          <button
            type="button"
            className="min-h-11 px-4 text-sm font-semibold text-[#974400] transition hover:underline active:opacity-70"
            onClick={() => navigate('/recipes/new')}
          >
            직접 레시피 작성하기
          </button>
        </section>
      </div>
    </section>
  )
}

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

  if (!hasImportAccess) return <ImportPremiumGate accessError={accessError} />

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
