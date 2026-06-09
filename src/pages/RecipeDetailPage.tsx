import { ArrowLeft, BookMarked, Download, Edit, ExternalLink, Heart, Signal, StickyNote, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ButtonHTMLAttributes } from 'react'
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

const ActionButton = ({
  children,
  className = '',
  tone = 'neutral',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'neutral' | 'danger' }) => (
  <button
    type="button"
    className={`inline-flex min-h-10 items-center justify-center gap-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition active:scale-95 ${
      tone === 'danger' ? 'bg-[#ffdad6] text-[#93000a]' : 'bg-[#f0eded] text-[#1b1c1c] hover:bg-[#e4e2e1]'
    } ${className}`}
    {...props}
  >
    {children}
  </button>
)

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
    <article className="recipe-print mx-auto min-h-screen max-w-md bg-[#fbf9f8] pb-32 text-[#1b1c1c]">
      <header className="relative h-[360px] w-full overflow-hidden">
        {recipe.image_url ? (
          <img src={recipe.image_url} alt="" className="h-full w-full object-cover [mask-image:linear-gradient(to_bottom,black_80%,transparent_100%)]" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[#e4e2e1] text-[#5c5c5c] [mask-image:linear-gradient(to_bottom,black_80%,transparent_100%)]">
            <BookMarked size={72} />
          </div>
        )}
        <div className="no-print absolute left-0 top-0 z-10 flex w-full items-center justify-between p-4">
          <button type="button" aria-label="뒤로" className={glassButton} onClick={() => navigate(-1)}>
            <ArrowLeft size={22} />
          </button>
          <button type="button" aria-label="즐겨찾기" className={glassButton} onClick={toggleFavorite}>
            <Heart size={22} className={recipe.is_favorite ? 'fill-red-500 text-red-500' : ''} />
          </button>
        </div>
      </header>

      <main className="relative z-20 -mt-12 px-4">
        <section className="rounded-xl border border-[#e4e2e1]/60 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h1 className="flex-1 text-[28px] font-bold leading-[34px] text-[#1b1c1c]">{recipe.title}</h1>
          </div>

          <div className="no-print mb-4 flex flex-wrap gap-1 border-b border-[#e4e2e1]/60 pb-4">
            <Link to={`/recipes/${recipe.id}/edit`} className="inline-flex min-h-10 items-center justify-center gap-1 rounded-lg bg-[#f0eded] px-3 py-2 text-[13px] font-semibold text-[#1b1c1c] transition active:scale-95">
              <Edit size={18} />
              Edit
            </Link>
            <ActionButton onClick={() => setFolderOpen(true)}>
              <BookMarked size={18} />
              Category
            </ActionButton>
            <ActionButton onClick={exportPdf}>
              <Download size={18} />
              PDF
            </ActionButton>
            <ActionButton tone="danger" className="ml-auto" aria-label="레시피 삭제" onClick={() => setConfirmOpen(true)}>
              <Trash2 size={18} />
            </ActionButton>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-4 text-[#564338]">
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              <Users size={18} className="text-[#5c5c5c]" />
              {recipe.servings || 0} Servings
            </span>
            <span className="inline-flex items-center gap-1 text-sm font-semibold">
              <Signal size={18} className="text-[#5c5c5c]" />
              {recipe.difficulty || 'Difficulty'}
            </span>
          </div>

          {recipe.memo ? (
            <div className="rounded-lg border-l-4 border-[#5c5c5c] bg-[#f6f3f2] p-4 text-[15px] leading-6 text-[#564338]">
              <div className="mb-1 flex items-center gap-1">
                <StickyNote size={18} />
                <span className="text-sm font-semibold uppercase tracking-wider opacity-70">Chef's Notes</span>
              </div>
              {recipe.memo}
            </div>
          ) : null}
        </section>

        <div className="space-y-8 py-8">
          <ListSection title="Ingredients" items={ingredients} />
          <ListSection title="Seasonings" items={seasonings} />

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
          <Link to={`/recipes/${recipe.id}/edit`} className="pointer-events-auto flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-[#5c5c5c] text-sm font-semibold text-white shadow-lg transition active:scale-95">
            <Edit size={23} />
            Edit Recipe
          </Link>
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
