import { Edit, Folder, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { RecipeCard } from '../components/recipe/RecipeCard'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { normalizeRecipe } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import type { Recipe, RecipeFolder } from '../types/recipe'

export const RecipeBookPage = () => {
  const { user } = useAuth()
  const [folders, setFolders] = useState<RecipeFolder[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [items, setItems] = useState<{ folder_id: string; recipe_id: string }[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [folderResult, itemResult, recipeResult] = await Promise.all([
      supabase.from('recipe_folders').select('*').order('created_at', { ascending: false }),
      supabase.from('recipe_folder_items').select('folder_id, recipe_id'),
      supabase.from('recipes').select('*').order('created_at', { ascending: false }),
    ])
    setLoading(false)
    if (folderResult.error || itemResult.error || recipeResult.error) {
      setError(folderResult.error?.message || itemResult.error?.message || recipeResult.error?.message || '레시피북을 불러오지 못했습니다.')
      return
    }
    setFolders((folderResult.data || []) as RecipeFolder[])
    setItems((itemResult.data || []) as { folder_id: string; recipe_id: string }[])
    setRecipes((recipeResult.data || []).map((recipe) => normalizeRecipe(recipe as Recipe)))
  }, [user])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    items.forEach((item) => map.set(item.folder_id, (map.get(item.folder_id) || 0) + 1))
    return map
  }, [items])

  const selectedRecipes = useMemo(() => {
    const recipeIds = new Set(items.filter((item) => item.folder_id === selectedFolderId).map((item) => item.recipe_id))
    return recipes.filter((recipe) => recipeIds.has(recipe.id))
  }, [items, recipes, selectedFolderId])

  const submitFolder = async (event: FormEvent) => {
    event.preventDefault()
    if (!user || !name.trim()) return
    if (editingId) {
      await supabase.from('recipe_folders').update({ name: name.trim() }).eq('id', editingId)
    } else {
      await supabase.from('recipe_folders').insert({ name: name.trim(), user_id: user.id })
    }
    setName('')
    setEditingId('')
    await load()
  }

  const deleteFolder = async (folderId: string) => {
    await supabase.from('recipe_folders').delete().eq('id', folderId)
    if (selectedFolderId === folderId) setSelectedFolderId('')
    await load()
  }

  if (loading) return <LoadingState />

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-stone-950">레시피북</h1>
        <p className="mt-1 text-sm text-stone-500">폴더별로 레시피를 정리하세요.</p>
      </div>

      <form onSubmit={submitFolder} className="flex gap-2 rounded-xl border border-amber-100 bg-white p-3">
        <input className="min-w-0 flex-1 rounded-lg border border-amber-100 px-3 py-3 text-sm outline-none focus:border-amber-500" placeholder="폴더명" value={name} onChange={(event) => setName(event.target.value)} />
        <Button disabled={!name.trim()}><Plus size={17} />{editingId ? '수정' : '만들기'}</Button>
      </form>

      {error ? <ErrorState message={error} /> : null}
      {!folders.length ? <EmptyState title="폴더가 없습니다." description="+ 폴더 만들기로 레시피북을 시작하세요." /> : null}

      <div className="grid grid-cols-2 gap-3">
        {folders.map((folder) => (
          <div key={folder.id} className={`rounded-xl border p-4 ${selectedFolderId === folder.id ? 'border-amber-500 bg-amber-50' : 'border-amber-100 bg-white'}`}>
            <button type="button" className="w-full text-left" onClick={() => setSelectedFolderId(folder.id)}>
              <Folder className="text-amber-700" size={22} />
              <p className="mt-3 font-bold text-stone-950">{folder.name}</p>
              <p className="mt-1 text-sm text-stone-500">{counts.get(folder.id) || 0}개 레시피</p>
            </button>
            <div className="mt-3 flex gap-2">
              <button type="button" aria-label="수정" className="grid h-9 flex-1 place-items-center rounded-lg bg-white text-stone-600" onClick={() => { setEditingId(folder.id); setName(folder.name) }}>
                <Edit size={16} />
              </button>
              <button type="button" aria-label="삭제" className="grid h-9 flex-1 place-items-center rounded-lg bg-white text-rose-600" onClick={() => deleteFolder(folder.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedFolderId ? (
        <section className="space-y-3">
          <h2 className="font-bold text-stone-950">{folders.find((folder) => folder.id === selectedFolderId)?.name}</h2>
          {selectedRecipes.length ? selectedRecipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} />) : <EmptyState title="이 폴더에 담긴 레시피가 없습니다." description="레시피 상세에서 레시피북에 담기를 눌러 추가하세요." />}
        </section>
      ) : null}
    </section>
  )
}
