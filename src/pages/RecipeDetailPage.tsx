import { BookMarked, Edit, ExternalLink, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ErrorState, LoadingState } from '../components/ui/State'
import { formatIngredientItems } from '../lib/ingredients'
import { normalizeRecipe } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../hooks/useAuth'
import type { Recipe, RecipeFolder } from '../types/recipe'

const Section = ({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) => {
  const List = ordered ? 'ol' : 'ul'
  return (
    <section className="rounded-xl border border-amber-100 bg-white p-4">
      <h2 className="font-bold text-stone-950">{title}</h2>
      <List className={`mt-3 space-y-2 text-sm leading-6 text-stone-700 ${ordered ? 'list-decimal pl-5' : 'list-disc pl-5'}`}>
        {items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
      </List>
    </section>
  )
}

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
    load()
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
    loadFolders()
  }, [id, user])

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
      await supabase.from('recipe_folder_items').insert({ folder_id: folderId, recipe_id: recipe.id, user_id: user.id })
      setSelectedFolderIds((prev) => [...prev, folderId])
    }
  }

  if (loading) return <LoadingState />
  if (error && !recipe) return <ErrorState message={error} />
  if (!recipe) return <ErrorState message="레시피를 찾을 수 없습니다." />

  return (
    <article className="space-y-4">
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="grid h-48 place-items-center bg-amber-50 text-5xl">
          {recipe.image_url ? <img src={recipe.image_url} alt="" className="h-full w-full object-cover" /> : '🍲'}
        </div>
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-stone-950">{recipe.title}</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-3 py-1 font-semibold ${recipe.source_type === 'imported' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {recipe.source_type === 'imported' ? '가져온 레시피' : '내가 만든 레시피'}
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{recipe.servings || 0}인분</span>
          </div>
          {recipe.source_type === 'imported' && recipe.source_url ? (
            <a href={recipe.source_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
              <ExternalLink size={17} /> 원본 레시피 보기
            </a>
          ) : null}
          <div className="flex gap-2">
            <Link className="flex-1" to={`/recipes/${recipe.id}/edit`}><Button className="w-full" variant="secondary"><Edit size={17} />수정</Button></Link>
            <Button variant="secondary" onClick={() => setFolderOpen(true)}><BookMarked size={17} />담기</Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}><Trash2 size={17} />삭제</Button>
          </div>
        </div>
      </div>

      <Section title="재료" items={recipe.ingredients.map((item) => formatIngredientItems([item]))} />
      <Section title="양념" items={recipe.seasonings.map((item) => formatIngredientItems([item]))} />
      <section className="rounded-xl border border-amber-100 bg-white p-4">
        <h2 className="font-bold text-stone-950">조리순서</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-stone-700">{recipe.steps_text || '작성된 조리순서가 없습니다.'}</p>
      </section>

      {recipe.memo ? (
        <section className="rounded-xl border border-amber-100 bg-white p-4 text-sm leading-6 text-stone-700">
          <h2 className="font-bold text-stone-950">메모</h2>
          <p className="mt-2 whitespace-pre-wrap">{recipe.memo}</p>
        </section>
      ) : null}

      <ConfirmDialog open={confirmOpen} title="레시피 삭제" description="삭제한 레시피는 되돌릴 수 없습니다." onCancel={() => setConfirmOpen(false)} onConfirm={deleteRecipe} />
      {folderOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/30 p-4 sm:items-center sm:justify-center">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-bold text-stone-950">레시피북에 담기</h2>
            <div className="mt-4 space-y-2">
              {folders.length ? folders.map((folder) => (
                <label key={folder.id} className="flex min-h-11 items-center justify-between rounded-lg border border-amber-100 px-3 text-sm font-semibold text-stone-800">
                  {folder.name}
                  <input type="checkbox" checked={selectedFolderIds.includes(folder.id)} onChange={() => toggleFolder(folder.id)} />
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
