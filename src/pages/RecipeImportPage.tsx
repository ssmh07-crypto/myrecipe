import { BadgeCheck, CloudSync, Info, Link2, Lock, Sparkles, Wand2, X, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { FormEvent } from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RecipeForm } from '../components/recipe/RecipeForm'
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

const DraftPreview = ({ recipe }: { recipe: RecipeInput }) => {
  const ingredients = recipe.ingredients.slice(0, 3)
  const extraCount = Math.max(recipe.ingredients.length - ingredients.length, 0)

  return (
    <section className="animate-[import-fade-in_0.4s_ease-out_forwards] space-y-4">
      <div className="overflow-hidden rounded-xl border border-[#e4e2e1] bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05)]">
        {recipe.image_url ? (
          <div className="relative aspect-[3/2] w-full">
            <img src={recipe.image_url} alt="" className="h-full w-full object-cover" />
            <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-[#c8f17a] px-2 py-1 text-xs font-semibold text-[#4e6e00] shadow-sm">
              <BadgeCheck size={17} />
              Draft Extracted
            </div>
          </div>
        ) : (
          <div className="relative grid aspect-[3/2] w-full place-items-center bg-[#f0eded]">
            <div className="grid h-20 w-20 place-items-center rounded-xl bg-white text-[#974400] shadow-sm">
              <Wand2 size={38} />
            </div>
            <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-[#c8f17a] px-2 py-1 text-xs font-semibold text-[#4e6e00] shadow-sm">
              <BadgeCheck size={17} />
              Draft Extracted
            </div>
          </div>
        )}

        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <h2 className="text-[22px] font-semibold leading-7 text-[#1b1c1c]">{recipe.title || 'Imported Recipe Draft'}</h2>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-lg bg-[#e4e2e1] px-2 py-1 text-xs font-medium text-[#564338]">Imported</span>
              {recipe.difficulty ? <span className="rounded-lg bg-[#e4e2e1] px-2 py-1 text-xs font-medium text-[#564338]">{recipe.difficulty}</span> : null}
            </div>
          </div>

          {ingredients.length ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase leading-5 text-[#974400]">Ingredients Preview</p>
              <ul className="space-y-1">
                {ingredients.map((ingredient, index) => (
                  <li key={`${ingredient.name}-${index}`} className="flex items-center gap-2 text-base leading-6 text-[#564338]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#974400]/40" />
                    <span>{ingredient.amount ? `${ingredient.amount} ` : ''}{ingredient.unit ? `${ingredient.unit} ` : ''}{ingredient.name}</span>
                  </li>
                ))}
                {extraCount ? <li className="text-xs font-medium italic leading-4 text-[#8a7266]">+ {extraCount} more ingredients...</li> : null}
              </ul>
            </div>
          ) : null}

          <div className="flex items-start gap-4 rounded-lg border-l-4 border-[#765700] bg-[#ffdfa0]/25 p-4">
            <Info size={20} className="mt-0.5 shrink-0 text-[#765700]" />
            <p className="text-base leading-6 text-[#5c4300]">Please review and edit this draft before saving to your book.</p>
          </div>
        </div>
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
      setError(nextError instanceof Error ? nextError.message : 'Failed to import recipe.')
    } finally {
      setLoading(false)
    }
  }

  const handleImportSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void importRecipe()
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
      setError(nextError instanceof Error ? nextError.message : 'Failed to save recipe.')
    } finally {
      setSaving(false)
    }
  }

  if (accessLoading) return <LoadingState />

  if (!hasImportAccess) return <ImportPremiumGate accessError={accessError} />

  return (
    <section className="mx-auto max-w-lg space-y-8 pb-6">
      <section className="mt-2">
        <h1 className="text-[28px] font-bold leading-[34px] text-[#1b1c1c]">Import Recipe</h1>
        <p className="mt-1 text-base leading-6 text-[#564338]">Save any recipe from the web to your digital notebook instantly.</p>
      </section>

      {!recipe && !loading ? (
        <form className="animate-[import-fade-in_0.4s_ease-out_forwards] space-y-4" onSubmit={handleImportSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-semibold uppercase leading-5 text-[#564338]" htmlFor="recipe-url">Recipe URL</label>
            <div className="relative">
              <input
                id="recipe-url"
                className="h-11 w-full rounded-lg border-none bg-[#e4e2e1] px-4 pr-11 text-base text-[#1b1c1c] outline-none transition placeholder:text-[#8a7266] focus:ring-2 focus:ring-[#974400]"
                placeholder="Paste recipe URL here..."
                type="url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
              <Link2 size={21} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7266]" />
            </div>
          </div>

          <button
            type="submit"
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#974400] px-4 py-2 text-sm font-bold text-white shadow-sm transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={!url}
          >
            <Wand2 size={19} />
            Extract Recipe
          </button>

          <p className="rounded-lg bg-[#ffdfa0]/25 p-3 text-xs font-medium leading-5 text-[#564338]">
            Video content, social posts, paywalled websites, and copyright-infringing imports are not supported.
          </p>
        </form>
      ) : null}

      {loading ? (
        <section className="animate-[import-fade-in_0.4s_ease-out_forwards] space-y-4 py-8 text-center">
          <div className="relative h-1 w-full overflow-hidden rounded-full bg-[#e4e2e1]">
            <div className="absolute top-0 h-full rounded-full bg-[#974400] animate-[import-loading-pulse_2s_ease-in-out_infinite]" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <p className="text-lg font-semibold leading-7 text-[#974400]">Extracting ingredients and steps...</p>
            <p className="text-xs font-medium leading-4 text-[#564338]">Our AI is reading the culinary details for you.</p>
          </div>
        </section>
      ) : null}

      {error ? <ErrorState message={error} /> : null}

      {recipe ? (
        <div className="space-y-4">
          <DraftPreview recipe={recipe} />
          <RecipeForm initialValue={recipe} submitLabel="Save to My Book" loading={saving} onSubmit={saveRecipe} />
        </div>
      ) : null}
    </section>
  )
}
