import { ArrowLeft, BookMarked, Download, Edit, ExternalLink, MoreHorizontal, Plus, Signal, Trash2, Users } from 'lucide-react'
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

const glassButton = 'grid h-11 w-11 place-items-center rounded-full bg-black/30 text-white shadow-sm backdrop-blur-md transition active:scale-95'

const ListSection = ({ title, items }: { title: string; items: string[] }) => (
  <section>
    <h2 className="mb-4 text-[22px] font-semibold leading-7 text-[#1b1c1c]">{title}</h2>
    <ul className="space-y-2">
      {items.length ? items.map((item, index) => (
        <li key={`${item}-${index}`} className="rounded-lg border border-[#e4e2e1]/60 bg-white p-4 text-base leading-6 text-[#1b1c1c]">
          {item}
        </li>
      )) : <li className="rounded-lg border border-[#e4e2e1]/60 bg-white p-4 text-sm text-[#564338]">작성된 항목이 없습니다.</li>}
    </ul>
  </section>
)

const SeasoningSection = ({ items }: { items: Recipe['seasonings'] }) => (
  <section>
    <h2 className="mb-4 text-[22px] font-semibold leading-7 text-[#1b1c1c]">Seasonings</h2>
    <ul className="space-y-2">
      {items.length ? items.map((item, index) => {
        const amount = [item.amount, item.unit].filter(Boolean).join(' ')
        return (
          <li key={`${item.name}-${index}`} className="flex items-center justify-between gap-4 rounded-lg border border-[#e4e2e1]/60 bg-white p-4 text-base leading-6 text-[#1b1c1c]">
            <span>{item.name}</span>
            {amount ? <span className="shrink-0 text-sm font-semibold text-[#564338]">{amount}</span> : null}
          </li>
        )
      }) : <li className="rounded-lg border border-[#e4e2e1]/60 bg-white p-4 text-sm text-[#564338]">작성된 항목이 없습니다.</li>}
    </ul>
  </section>
)

const formatUpdatedDate = (value: string) =>
  new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value))

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
  const [moreOpen, setMoreOpen] = useState(false)

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

  return (
    <article className="recipe-print mx-auto min-h-screen max-w-md bg-[#fbf9f8] pb-32 text-[#1b1c1c]">
      <header className="relative h-[400px] w-full overflow-hidden">
        {recipe.image_url ? (
          <img src={recipe.image_url} alt="" className="h-full w-full object-cover [mask-image:linear-gradient(to_bottom,black_85%,transparent_100%)]" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[#e4e2e1] text-[#5c5c5c] [mask-image:linear-gradient(to_bottom,black_85%,transparent_100%)]">
            <BookMarked size={72} />
          </div>
        )}
        <div className="no-print absolute left-0 top-0 z-10 flex w-full items-center justify-between p-4">
          <button type="button" aria-label="뒤로" className={glassButton} onClick={() => navigate(-1)}>
            <ArrowLeft size={22} />
          </button>
          <div className="relative">
            <button type="button" aria-label="더 보기" className={glassButton} onClick={() => setMoreOpen((value) => !value)}>
              <MoreHorizontal size={23} />
            </button>
            {moreOpen ? (
              <div className="absolute right-0 mt-1 w-48 overflow-hidden rounded-lg border border-[#ddc1b3] bg-white py-1 shadow-xl">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-[#1b1c1c] hover:bg-[#e4e2e1]"
                  onClick={() => {
                    setMoreOpen(false)
                    exportPdf()
                  }}
                >
                  <Download size={18} />
                  Download PDF
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-semibold text-[#93000a] hover:bg-[#ffdad6]/40"
                  onClick={() => {
                    setMoreOpen(false)
                    setConfirmOpen(true)
                  }}
                >
                  <Trash2 size={18} />
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <main className="relative z-20 -mt-16 px-4">
        <section className="rounded-xl border border-[#e4e2e1]/60 bg-white p-4 shadow-sm">
          <h1 className="mb-2 text-[28px] font-bold leading-[34px] text-[#1b1c1c]">{recipe.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-[#564338]">
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              <Users size={18} className="text-[#5c5c5c]" />
              {recipe.servings || 0} Servings
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              <Signal size={18} className="text-[#5c5c5c]" />
              {recipe.difficulty || 'Difficulty'}
            </span>
          </div>
        </section>

        <div className="space-y-8 py-8">
          {recipe.memo ? (
            <section>
              <h2 className="mb-4 text-[22px] font-semibold leading-7 text-[#1b1c1c]">Chef's Notes</h2>
              <div className="rounded-xl border-l-4 border-[#5c5c5c] bg-[#f6f3f2] p-4 text-base leading-7 text-[#564338]">
                {recipe.memo}
                <div className="mt-2 text-xs font-medium leading-4 text-[#8a7266] opacity-80">
                  Last updated: {formatUpdatedDate(recipe.updated_at)}
                </div>
              </div>
            </section>
          ) : null}

          <ListSection title="Ingredients" items={ingredients} />
          <SeasoningSection items={recipe.seasonings} />

          <section id="instructions">
            <h2 className="mb-4 text-[22px] font-semibold leading-7 text-[#1b1c1c]">Instructions</h2>
            <div className="space-y-6">
              {steps.length ? steps.map((step, index) => (
                <div key={`${step}-${index}`} className="flex gap-4">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#5c5c5c] text-sm font-bold text-white">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-base leading-7 text-[#1b1c1c]">{step}</p>
                    {recipe.step_images[index] ? (
                      <div className="mt-4 aspect-video overflow-hidden rounded-xl shadow-sm">
                        <img src={recipe.step_images[index]} alt="" className="h-full w-full object-cover" />
                      </div>
                    ) : null}
                  </div>
                </div>
              )) : <p className="rounded-lg border border-[#e4e2e1]/60 bg-white p-4 text-sm text-[#564338]">작성된 조리순서가 없습니다.</p>}
            </div>
          </section>

          {recipe.source_type === 'imported' && recipe.source_url ? (
            <footer className="border-t border-[#e4e2e1]/60 pt-6 text-center">
              <a href={recipe.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1 text-sm font-semibold text-[#5c5c5c]">
                <ExternalLink size={16} />
                원본 레시피 보기
              </a>
            </footer>
          ) : null}
        </div>
      </main>

      <div className="no-print pointer-events-none fixed bottom-0 left-0 right-0 z-40 bg-gradient-to-t from-[#fbf9f8] via-[#fbf9f8]/90 to-transparent p-4">
        <div className="mx-auto flex max-w-md gap-4">
          <Link to={`/recipes/${recipe.id}/edit`} className="pointer-events-auto flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-[#1b1c1c] text-sm font-semibold text-[#fbf9f8] shadow-xl transition active:scale-95">
            <Edit size={22} />
            Edit Recipe
          </Link>
          <button
            type="button"
            className="pointer-events-auto flex h-14 flex-1 items-center justify-center gap-2 rounded-full border border-[#ddc1b3] bg-white text-sm font-semibold text-[#1b1c1c] shadow-sm transition active:scale-95"
            onClick={() => setFolderOpen(true)}
          >
            <Plus size={22} />
            Add Recipe
          </button>
        </div>
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
