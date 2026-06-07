import { ArrowLeft, BookMarked, Download, Edit, ExternalLink, Heart, PlayCircle, Share2, Signal, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ErrorState, LoadingState } from '../components/ui/State'
import { formatIngredientItems } from '../lib/ingredients'
import { normalizeRecipe } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import type { Recipe, RecipeFolder } from '../types/recipe'

const splitSteps = (stepsText: string) =>
  stepsText
    .split('\n')
    .map((step) => step.trim())
    .filter(Boolean)

const SourceBadge = ({ sourceType }: { sourceType: Recipe['source_type'] }) => (
  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${sourceType === 'imported' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>
    {sourceType === 'imported' ? '가져온 레시피' : '내가 만든 레시피'}
  </span>
)

const IngredientChecklist = ({ title, items }: { title: string; items: string[] }) => (
  <section className="px-5">
    <h2 className="mb-3 font-serif text-2xl font-semibold text-[#1e1b18]">{title}</h2>
    <div className="space-y-4 rounded-xl bg-[#efe6e2] p-5">
      {items.length ? items.map((item, index) => (
        <label key={`${item}-${index}`} className="flex cursor-pointer items-center gap-4">
          <input className="peer h-5 w-5 rounded border-[#dcc1b9] text-[#9a4022] focus:ring-[#9a4022]" type="checkbox" />
          <span className="text-base leading-6 text-[#1e1b18] peer-checked:line-through">{item}</span>
        </label>
      )) : <p className="text-sm text-[#56423c]">작성된 항목이 없습니다.</p>}
    </div>
  </section>
)

export const RecipeDetailPage = () => {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [folders, setFolders] = useState<RecipeFolder[]>([])
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [folderOpen, setFolderOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!id) return
      const { data, error: nextError } = await supabase.from('recipes').select('*').eq('id', id).single()
      setLoading(false)
      if (nextError) setError(nextError.message)
      else setRecipe(normalizeRecipe(data as Recipe))
    }
    void load()
  }, [id])

  useEffect(() => {
    const loadFolders = async () => {
      if (!user || !id) return
      const [{ data: folderData }, { data: itemData }] = await Promise.all([
        supabase.from('recipe_folders').select('*').order('created_at', { ascending: false }),
        supabase.from('recipe_folder_items').select('folder_id').eq('recipe_id', id),
      ])
      setFolders((folderData || []) as RecipeFolder[])
      setSelectedFolderIds((itemData || []).map((item) => item.folder_id as string))
    }
    void loadFolders()
  }, [id, user])

  const steps = useMemo(() => splitSteps(recipe?.steps_text || ''), [recipe?.steps_text])

  const deleteRecipe = async () => {
    if (!recipe) return
    await supabase.from('recipes').delete().eq('id', recipe.id)
    navigate('/recipes')
  }

  const toggleFavorite = async () => {
    if (!recipe) return
    const next = !recipe.is_favorite
    setRecipe({ ...recipe, is_favorite: next })
    await supabase.from('recipes').update({ is_favorite: next }).eq('id', recipe.id)
  }

  const shareRecipe = async () => {
    if (!recipe) return
    const shareData = { title: recipe.title, url: window.location.href }
    if (navigator.share) {
      await navigator.share(shareData).catch(() => undefined)
    } else {
      await navigator.clipboard.writeText(window.location.href).catch(() => undefined)
    }
  }

  const toggleFolder = async (folderId: string) => {
    if (!recipe || !user) return
    const exists = selectedFolderIds.includes(folderId)
    if (exists) {
      await supabase.from('recipe_folder_items').delete().eq('folder_id', folderId).eq('recipe_id', recipe.id)
      setSelectedFolderIds((prev) => prev.filter((id) => id !== folderId))
    } else {
      await supabase.from('recipe_folder_items').upsert({ folder_id: folderId, recipe_id: recipe.id, user_id: user.id }, { onConflict: 'folder_id,recipe_id' })
      setSelectedFolderIds((prev) => [...prev, folderId])
    }
  }

  const exportPdf = () => {
    window.print()
  }

  if (loading) return <main className="min-h-screen bg-[#fff8f5] p-4"><LoadingState /></main>
  if (error && !recipe) return <main className="min-h-screen bg-[#fff8f5] p-4"><ErrorState message={error} /></main>
  if (!recipe) return <main className="min-h-screen bg-[#fff8f5] p-4"><ErrorState message="레시피를 찾을 수 없습니다." /></main>

  const ingredients = recipe.ingredients.map((item) => formatIngredientItems([item]))
  const seasonings = recipe.seasonings.map((item) => formatIngredientItems([item]))

  return (
    <article className="recipe-print min-h-screen bg-[#fff8f5] pb-28 text-[#1e1b18]">
      <header className="no-print sticky top-0 z-50 bg-[#fff8f5]/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-2">
          <div className="flex items-center gap-3">
            <button type="button" aria-label="뒤로" className="grid h-10 w-10 place-items-center rounded-full text-[#9a4022] active:scale-95" onClick={() => navigate(-1)}>
              <ArrowLeft size={22} />
            </button>
            <h1 className="font-serif text-2xl font-semibold text-[#9a4022]">My Recipe Note</h1>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" aria-label="즐겨찾기" className="grid h-10 w-10 place-items-center rounded-full text-[#9a4022]" onClick={toggleFavorite}>
              <Heart size={22} className={recipe.is_favorite ? 'fill-[#9a4022]' : ''} />
            </button>
            <button type="button" aria-label="공유" className="grid h-10 w-10 place-items-center rounded-full text-[#9a4022]" onClick={() => void shareRecipe()}>
              <Share2 size={21} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl">
        <section className="relative aspect-[4/3] w-full overflow-hidden shadow-lg md:aspect-[21/9] md:rounded-b-xl">
          {recipe.image_url ? <img src={recipe.image_url} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center bg-[#f5ece7] text-7xl">🍲</div>}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </section>

        <section className="relative z-10 -mt-8 px-5">
          <div className="relative rounded-xl bg-white p-6 shadow-[0_4px_12px_rgba(154,64,34,0.08)]">
            <div className="no-print absolute right-4 top-4 flex gap-1">
              <Link to={`/recipes/${recipe.id}/edit`} className="grid h-9 w-9 place-items-center rounded-full bg-[#f5ece7] text-[#9a4022]" aria-label="수정">
                <Edit size={17} />
              </Link>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-[#f5ece7] text-[#9a4022]" aria-label="레시피북에 담기" onClick={() => setFolderOpen(true)}>
                <BookMarked size={17} />
              </button>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-[#f5ece7] text-[#9a4022]" aria-label="PDF로 내보내기" onClick={exportPdf}>
                <Download size={17} />
              </button>
            </div>
            <div className="mb-3 flex flex-wrap gap-2 pr-32">
              <SourceBadge sourceType={recipe.source_type} />
              {recipe.source_type === 'imported' && recipe.source_url ? (
                <a href={recipe.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-[#f5ece7] px-3 py-1 text-xs font-semibold text-[#9a4022]">
                  <ExternalLink size={13} /> 원본 레시피 보기
                </a>
              ) : null}
            </div>
            <h2 className="font-serif text-[28px] font-bold leading-9 text-[#1e1b18]">{recipe.title}</h2>
            <div className="mt-4 flex flex-wrap gap-5 text-xs font-semibold uppercase tracking-wide text-[#56423c]">
              <span className="inline-flex items-center gap-1.5"><Users size={17} />{recipe.servings || 0} servings</span>
              <span className="inline-flex items-center gap-1.5"><Signal size={17} />{recipe.difficulty}</span>
            </div>
            {recipe.memo ? (
              <p className="mt-5 border-l-4 border-[#9a4022] pl-4 text-base italic leading-7 text-[#56423c]">{recipe.memo}</p>
            ) : null}
            <div className="no-print mt-5 flex justify-end">
              <Button variant="danger" onClick={() => setConfirmOpen(true)}><Trash2 size={17} /></Button>
            </div>
          </div>
        </section>

        <div className="mt-10 space-y-10">
          <IngredientChecklist title="Ingredients" items={ingredients} />
          <IngredientChecklist title="Seasonings" items={seasonings} />

          <section className="space-y-6 px-5 pb-10" id="instructions">
            <h2 className="font-serif text-2xl font-semibold text-[#1e1b18]">Instructions</h2>
            {steps.length ? steps.map((step, index) => (
              <div key={`${step}-${index}`} className="flex items-start gap-4">
                <span className="select-none font-serif text-5xl font-bold text-[#9a4022]/10">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <p className="mb-4 text-lg leading-8 text-[#1e1b18]">{step}</p>
                  {recipe.step_images[index] ? (
                    <div className="aspect-video w-full overflow-hidden rounded-xl shadow-sm">
                      <img src={recipe.step_images[index]} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : null}
                </div>
              </div>
            )) : <p className="rounded-xl bg-white p-5 text-sm text-[#56423c]">작성된 조리순서가 없습니다.</p>}
          </section>
        </div>
      </main>

      <div className="no-print pointer-events-none fixed bottom-0 left-0 z-50 flex w-full justify-center p-4">
        <button type="button" className="pointer-events-auto inline-flex items-center gap-3 rounded-full bg-[#5b7d54] px-8 py-4 text-sm font-bold text-white shadow-lg active:scale-95" onClick={() => document.getElementById('instructions')?.scrollIntoView({ behavior: 'smooth' })}>
          <PlayCircle size={22} /> START COOKING
        </button>
      </div>

      <ConfirmDialog open={confirmOpen} title="레시피 삭제" description="삭제한 레시피는 되돌릴 수 없습니다." onCancel={() => setConfirmOpen(false)} onConfirm={deleteRecipe} />
      {folderOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-stone-950">레시피북에 담기</h2>
            <div className="mt-4 space-y-2">
              {folders.length ? folders.map((folder) => (
                <label key={folder.id} className="flex min-h-11 items-center justify-between rounded-lg border border-amber-100 px-3 text-sm font-semibold text-stone-800">
                  {folder.name}
                  <input type="checkbox" checked={selectedFolderIds.includes(folder.id)} onChange={() => void toggleFolder(folder.id)} />
                </label>
              )) : <p className="rounded-lg bg-amber-50 p-3 text-sm text-stone-600">레시피북 탭에서 폴더를 먼저 만들어 주세요.</p>}
            </div>
            <Button type="button" className="mt-4 w-full" onClick={() => setFolderOpen(false)}>완료</Button>
          </div>
        </div>
      ) : null}
    </article>
  )
}
