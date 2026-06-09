import { Edit, FolderOpen, Heart, Plus, Signal, Trash2, Users, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { ensureRecipeFolders } from '../lib/recipeFolders'
import { normalizeRecipe } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import type { Recipe, RecipeFolder } from '../types/recipe'

type RecipeBookTab = 'all' | 'favorites' | 'categories'

const tabs: { value: RecipeBookTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'categories', label: 'Categories' },
]

const sourceLabel = (recipe: Recipe) => (recipe.source_type === 'imported' ? '가져온 레시피' : '내가 만든 레시피')

const RecipeBookCard = ({ recipe }: { recipe: Recipe }) => (
  <Link to={`/recipes/${recipe.id}`} className="group block overflow-hidden rounded-xl bg-white shadow-[0_12px_32px_-4px_rgba(154,64,34,0.08)] transition active:scale-[0.98]">
    <div className="relative h-56 overflow-hidden bg-[#f5ece7]">
      {recipe.image_url ? (
        <img src={recipe.image_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      ) : (
        <div className="grid h-full w-full place-items-center bg-[#efe6e2] text-5xl">🍽️</div>
      )}
      {recipe.is_favorite ? (
        <div className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-[#9a4022] shadow-sm backdrop-blur">
          <Heart size={19} className="fill-current" />
        </div>
      ) : null}
      <span className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold shadow-sm backdrop-blur ${recipe.source_type === 'imported' ? 'bg-sky-50/95 text-sky-700' : 'bg-emerald-50/95 text-emerald-700'}`}>
        {sourceLabel(recipe)}
      </span>
    </div>
    <div className="space-y-3 bg-[#fbf2ed] p-4">
      <h3 className="line-clamp-2 font-serif text-2xl font-semibold leading-tight text-[#1e1b18]">{recipe.title}</h3>
      <div className="flex flex-wrap items-center gap-4 text-sm font-semibold text-[#56423c]">
        <span className="inline-flex items-center gap-1">
          <Users size={17} />
          {recipe.servings || 0}인분
        </span>
        <span className="inline-flex items-center gap-1">
          <Signal size={17} />
          {recipe.difficulty || '난이도 미정'}
        </span>
      </div>
    </div>
  </Link>
)

export const RecipeBookPage = () => {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [folders, setFolders] = useState<RecipeFolder[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [items, setItems] = useState<{ folder_id: string; recipe_id: string }[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [activeTab, setActiveTab] = useState<RecipeBookTab>('all')
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const nextFolders = await ensureRecipeFolders(user.id)
      const [itemResult, recipeResult] = await Promise.all([
        supabase.from('recipe_folder_items').select('folder_id, recipe_id'),
        supabase.from('recipes').select('*').order('created_at', { ascending: false }),
      ])
      if (itemResult.error || recipeResult.error) {
        throw new Error(itemResult.error?.message || recipeResult.error?.message || '레시피북을 불러오지 못했습니다.')
      }
      setFolders(nextFolders)
      setItems((itemResult.data || []) as { folder_id: string; recipe_id: string }[])
      setRecipes((recipeResult.data || []).map((recipe) => normalizeRecipe(recipe as Recipe)))
      const folderParam = searchParams.get('folder')
      const folderFromQuery = folderParam ? nextFolders.find((folder) => folder.id === folderParam) : null
      if (folderFromQuery) {
        setActiveTab('categories')
        setSelectedFolderId(folderFromQuery.id)
      } else if (!selectedFolderId && nextFolders[0]) {
        setSelectedFolderId(nextFolders[0].id)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '레시피북을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [searchParams, selectedFolderId, user])

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

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId)

  const displayedRecipes = useMemo(() => {
    if (activeTab === 'favorites') return recipes.filter((recipe) => recipe.is_favorite)
    if (activeTab === 'categories') {
      const recipeIds = new Set(items.filter((item) => item.folder_id === selectedFolderId).map((item) => item.recipe_id))
      return recipes.filter((recipe) => recipeIds.has(recipe.id))
    }
    return recipes
  }, [activeTab, items, recipes, selectedFolderId])

  const openCreateModal = () => {
    setEditingId('')
    setName('')
    setModalOpen(true)
  }

  const openEditModal = (folder: RecipeFolder) => {
    setEditingId(folder.id)
    setName(folder.name)
    setModalOpen(true)
  }

  const submitFolder = async (event: FormEvent) => {
    event.preventDefault()
    if (!user || !name.trim()) return
    setError('')
    const result = editingId
      ? await supabase.from('recipe_folders').update({ name: name.trim() }).eq('id', editingId)
      : await supabase.from('recipe_folders').insert({ name: name.trim(), user_id: user.id }).select('id').single()
    if (result.error) {
      setError(result.error.message)
      return
    }
    if (!editingId && 'data' in result && result.data?.id) {
      setSelectedFolderId(result.data.id as string)
      setActiveTab('categories')
    }
    setName('')
    setEditingId('')
    setModalOpen(false)
    await load()
  }

  const deleteFolder = async (folderId: string) => {
    if (!window.confirm('카테고리를 삭제할까요? 레시피는 삭제되지 않습니다.')) return
    setError('')
    const { error: nextError } = await supabase.from('recipe_folders').delete().eq('id', folderId)
    if (nextError) {
      setError(nextError.message)
      return
    }
    if (selectedFolderId === folderId) setSelectedFolderId('')
    await load()
  }

  const switchTab = (tab: RecipeBookTab) => {
    setActiveTab(tab)
    if (tab === 'categories' && !selectedFolderId && folders[0]) setSelectedFolderId(folders[0].id)
  }

  if (loading) return <LoadingState />

  const emptyCopy = activeTab === 'favorites'
    ? { title: '즐겨찾기한 레시피가 없습니다.', description: '레시피 상세 화면에서 하트를 눌러 즐겨찾기에 추가하세요.' }
    : activeTab === 'categories'
      ? { title: selectedFolder ? '이 카테고리에 담긴 레시피가 없습니다.' : '카테고리가 없습니다.', description: selectedFolder ? '레시피 상세에서 레시피북에 담기를 눌러 추가하세요.' : '오른쪽 아래 + 버튼으로 새 카테고리를 만드세요.' }
      : { title: '저장된 레시피가 없습니다.', description: '직접 작성하거나 링크로 가져온 레시피를 레시피북에서 확인할 수 있습니다.' }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[#89726b]">My Recipe Book</p>
        <h1 className="font-serif text-3xl font-bold text-[#1e1b18]">레시피북</h1>
      </div>

      <div className="flex gap-4 overflow-x-auto border-b border-[#dcc1b9] no-scrollbar">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => switchTab(tab.value)}
            className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-semibold transition ${activeTab === tab.value ? 'border-[#9a4022] text-[#9a4022]' : 'border-transparent text-[#56423c]'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={`flex gap-2 overflow-x-auto pb-2 no-scrollbar ${activeTab === 'categories' ? '' : 'opacity-40'}`}>
        {folders.length ? folders.map((folder) => (
          <button
            key={folder.id}
            type="button"
            disabled={activeTab !== 'categories'}
            onClick={() => {
              setActiveTab('categories')
              setSelectedFolderId(folder.id)
            }}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition active:scale-95 ${activeTab === 'categories' && selectedFolderId === folder.id ? 'bg-[#b95837] text-white' : 'bg-[#e1dfdb] text-[#63635f]'}`}
          >
            {folder.name} · {counts.get(folder.id) || 0}
          </button>
        )) : (
          <button type="button" onClick={openCreateModal} className="rounded-full bg-[#e1dfdb] px-4 py-2 text-xs font-semibold text-[#63635f]">
            + 카테고리 만들기
          </button>
        )}
      </div>

      {activeTab === 'categories' && selectedFolder ? (
        <div className="flex items-center justify-between rounded-xl bg-[#f5ece7] p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#ffdbd0] text-[#9a4022]">
              <FolderOpen size={21} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-serif text-xl font-semibold text-[#1e1b18]">{selectedFolder.name}</p>
              <p className="text-xs font-semibold text-[#89726b]">{counts.get(selectedFolder.id) || 0}개 레시피</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" aria-label="카테고리 수정" className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#56423c]" onClick={() => openEditModal(selectedFolder)}>
              <Edit size={17} />
            </button>
            <button type="button" aria-label="카테고리 삭제" className="grid h-10 w-10 place-items-center rounded-full bg-white text-red-700" onClick={() => void deleteFolder(selectedFolder.id)}>
              <Trash2 size={17} />
            </button>
          </div>
        </div>
      ) : null}

      {error ? <ErrorState message={error} /> : null}
      {!displayedRecipes.length ? <EmptyState title={emptyCopy.title} description={emptyCopy.description} /> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {displayedRecipes.map((recipe) => <RecipeBookCard key={recipe.id} recipe={recipe} />)}
      </div>

      <button
        type="button"
        onClick={openCreateModal}
        className="fixed bottom-24 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[#9a4022] text-white shadow-lg transition active:scale-90"
        aria-label="카테고리 만들기"
      >
        <Plus size={28} />
      </button>

      {modalOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/30 px-4 pb-4 sm:place-items-center">
          <form onSubmit={submitFolder} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-semibold text-[#1e1b18]">{editingId ? '카테고리 수정' : '카테고리 만들기'}</h2>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-[#f5ece7] text-[#56423c]" onClick={() => setModalOpen(false)} aria-label="닫기">
                <X size={18} />
              </button>
            </div>
            <input
              className="mt-5 w-full rounded-lg border border-[#dcc1b9] bg-[#fff8f5] px-4 py-3 text-sm outline-none focus:border-[#9a4022]"
              placeholder="예: 찌개, 볶음밥, 아이반찬"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>취소</Button>
              <Button disabled={!name.trim()} className="flex-1">{editingId ? '수정하기' : '만들기'}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  )
}
