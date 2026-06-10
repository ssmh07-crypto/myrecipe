import { ArrowLeft, CakeSlice, CalendarDays, Edit, FolderPlus, Heart, Search, Star, Timer, Trash2, Utensils, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent, MouseEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { ensureRecipeFolders } from '../lib/recipeFolders'
import { normalizeRecipe } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import type { Recipe, RecipeFolder } from '../types/recipe'

type BookFilter = 'all' | 'favorites' | 'folder'

const folderIconStyles = [
  { icon: Heart, bg: 'bg-[#ffdbc9]', color: 'text-[#974400]' },
  { icon: Timer, bg: 'bg-[#c8f17a]', color: 'text-[#496800]' },
  { icon: CakeSlice, bg: 'bg-[#ffdfa0]', color: 'text-[#765700]' },
  { icon: CalendarDays, bg: 'bg-[#ffdbc9]', color: 'text-[#974400]' },
]

const sourceLabel = (recipe: Recipe) => (recipe.source_type === 'imported' ? 'Imported' : 'Manual')

const normalizeDifficultyLabel = (value: string) => {
  if (value === '\uc26c\uc6c0') return 'Easy'
  if (value === '\ubcf4\ud1b5') return 'Medium'
  if (value === '\uc5b4\ub824\uc6c0') return 'Hard'
  return value || 'Unrated'
}

const RecipeBookCard = ({ recipe }: { recipe: Recipe }) => (
  <Link to={`/recipes/${recipe.id}`} className="group block overflow-hidden rounded-xl bg-white shadow-[0_4px_12px_rgba(0,0,0,0.05)] transition active:scale-[0.98]">
    <div className="relative aspect-[3/2] overflow-hidden bg-[#f0eded]">
      {recipe.image_url ? (
        <img src={recipe.image_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[#974400]">
          <Utensils size={46} />
        </div>
      )}
      <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-white/85 px-2 py-1 text-xs font-semibold text-[#1b1c1c] shadow-sm backdrop-blur">
        <Star size={15} className={recipe.is_favorite ? 'fill-[#974400] text-[#974400]' : 'text-[#974400]'} />
        {recipe.is_favorite ? 'Saved' : sourceLabel(recipe)}
      </div>
    </div>
    <div className="p-4">
      <div className="mb-2 flex flex-wrap gap-1">
        <span className="rounded bg-[#c8f17a] px-1.5 py-0.5 text-xs font-medium text-[#4e6e00]">{normalizeDifficultyLabel(recipe.difficulty)}</span>
        <span className="rounded bg-[#e4e2e1] px-1.5 py-0.5 text-xs font-medium text-[#564338]">{recipe.servings || 0} servings</span>
      </div>
      <h3 className="truncate text-[22px] font-semibold leading-7 text-[#1b1c1c]">{recipe.title}</h3>
      <p className="mt-1 line-clamp-2 text-base leading-6 text-[#8a7266]">{recipe.memo || recipe.steps_text || 'Open this recipe to review ingredients and cooking steps.'}</p>
    </div>
  </Link>
)

const RecipeSearchRow = ({ recipe }: { recipe: Recipe }) => (
  <Link to={`/recipes/${recipe.id}`} className="group flex flex-col gap-6 border-b border-[#ddc1b3] bg-[#fbf9f8] pb-8 transition active:scale-[0.99] last:border-0 md:flex-row">
    <div className="relative h-56 w-full shrink-0 overflow-hidden rounded-xl bg-[#e4e2e1] md:w-56">
      {recipe.image_url ? (
        <img src={recipe.image_url} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-110" />
      ) : (
        <div className="grid h-full w-full place-items-center text-[#1b1c1c]">
          <Utensils size={46} />
        </div>
      )}
      {recipe.is_favorite ? (
        <div className="absolute right-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[#ba1a1a] shadow-sm backdrop-blur">
          <Heart size={18} fill="currentColor" />
        </div>
      ) : null}
    </div>
    <div className="flex flex-col justify-center gap-2">
      <div className="flex items-center gap-2">
        <span className="rounded-md bg-[#eeeeee] px-2 py-0.5 text-xs font-medium text-[#4c4546]">{sourceLabel(recipe)}</span>
        <div className="flex items-center gap-1 text-[#4c4546]">
          <Star size={14} fill="currentColor" />
          <span className="text-xs font-medium">{recipe.is_favorite ? 'Saved' : 'Recipe'}</span>
        </div>
      </div>
      <h2 className="text-2xl font-semibold leading-tight text-[#1b1b1b] group-hover:underline">{recipe.title}</h2>
      <div className="flex items-center gap-4 text-[#4c4546]">
        <div className="flex items-center gap-1">
          <Utensils size={18} />
          <span className="text-xs font-medium">{normalizeDifficultyLabel(recipe.difficulty)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium">{recipe.servings || 0} servings</span>
        </div>
      </div>
    </div>
  </Link>
)

const CategoryCard = ({
  title,
  count,
  active,
  iconIndex,
  onClick,
  onEdit,
  onDelete,
}: {
  title: string
  count: number
  active: boolean
  iconIndex: number
  onClick: () => void
  onEdit?: (event: MouseEvent<HTMLButtonElement>) => void
  onDelete?: (event: MouseEvent<HTMLButtonElement>) => void
}) => {
  const style = folderIconStyles[iconIndex % folderIconStyles.length]
  const Icon = style.icon

  return (
    <div
      role="button"
      tabIndex={0}
      className={`group flex cursor-pointer flex-col gap-2 rounded-xl p-4 transition active:scale-[0.98] ${active ? 'bg-[#e4e2e1] ring-2 ring-[#974400]/25' : 'bg-[#f6f3f2] hover:bg-[#e4e2e1]'}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onClick()
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={`grid h-10 w-10 place-items-center rounded-lg ${style.bg} ${style.color} transition group-hover:scale-110`}>
          <Icon size={21} fill={Icon === Heart ? 'currentColor' : 'none'} />
        </div>
        {onEdit || onDelete ? (
          <div className="flex gap-1">
            {onEdit ? (
              <button type="button" aria-label={`Edit ${title}`} className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#564338] shadow-sm" onClick={onEdit}>
                <Edit size={15} />
              </button>
            ) : null}
            {onDelete ? (
              <button type="button" aria-label={`Delete ${title}`} className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#ba1a1a] shadow-sm" onClick={onDelete}>
                <Trash2 size={15} />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div>
        <p className="text-sm font-semibold leading-5 text-[#1b1c1c]">{title}</p>
        <p className="text-xs font-medium leading-4 text-[#8a7266]">{count} Recipes</p>
      </div>
    </div>
  )
}

export const RecipeBookPage = () => {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [folders, setFolders] = useState<RecipeFolder[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [items, setItems] = useState<{ folder_id: string; recipe_id: string }[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState('')
  const [activeFilter, setActiveFilter] = useState<BookFilter>('all')
  const [query, setQuery] = useState('')
  const [showAllCategories, setShowAllCategories] = useState(false)
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
        throw new Error(itemResult.error?.message || recipeResult.error?.message || 'Failed to load recipe book.')
      }
      setFolders(nextFolders)
      setItems((itemResult.data || []) as { folder_id: string; recipe_id: string }[])
      setRecipes((recipeResult.data || []).map((recipe) => normalizeRecipe(recipe as Recipe)))
      const folderParam = searchParams.get('folder')
      const folderFromQuery = folderParam ? nextFolders.find((folder) => folder.id === folderParam) : null
      if (folderFromQuery) {
        setActiveFilter('folder')
        setSelectedFolderId(folderFromQuery.id)
      }
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to load recipe book.')
    } finally {
      setLoading(false)
    }
  }, [searchParams, user])

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

  const visibleCategories = showAllCategories ? folders : folders.slice(0, 3)

  const displayedRecipes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filteredByCategory = recipes.filter((recipe) => {
      if (activeFilter === 'favorites') return recipe.is_favorite
      if (activeFilter === 'folder') {
        const recipeIds = new Set(items.filter((item) => item.folder_id === selectedFolderId).map((item) => item.recipe_id))
        return recipeIds.has(recipe.id)
      }
      return true
    })

    if (!normalizedQuery) return filteredByCategory

    return filteredByCategory.filter((recipe) =>
      [recipe.title, recipe.memo, recipe.difficulty, recipe.steps_text, sourceLabel(recipe)]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [activeFilter, items, query, recipes, selectedFolderId])

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
      setActiveFilter('folder')
    }
    setName('')
    setEditingId('')
    setModalOpen(false)
    await load()
  }

  const deleteFolder = async (folderId: string) => {
    if (!window.confirm('Delete this category? Recipes will not be deleted.')) return
    setError('')
    const { error: nextError } = await supabase.from('recipe_folders').delete().eq('id', folderId)
    if (nextError) {
      setError(nextError.message)
      return
    }
    if (selectedFolderId === folderId) {
      setSelectedFolderId('')
      setActiveFilter('all')
    }
    await load()
  }

  if (loading) return <LoadingState label="Loading recipe book..." />

  const activeTitle = activeFilter === 'favorites'
    ? 'Favorites'
    : activeFilter === 'folder'
      ? folders.find((folder) => folder.id === selectedFolderId)?.name || 'Category Recipes'
      : 'All Recipes'

  if (activeFilter !== 'all') {
    return (
      <section className="mx-auto max-w-3xl pb-8">
        <div className="-mx-4 mb-6 bg-[#fbf9f8] px-4 pb-6">
          <div className="mb-5 flex items-center gap-4">
            <button
              type="button"
              aria-label="Back to recipe book"
              className="grid h-10 w-10 place-items-center rounded-full text-[#1b1b1b] transition hover:bg-[#e2e2e2]"
              onClick={() => {
                setActiveFilter('all')
                setSelectedFolderId('')
                setQuery('')
              }}
            >
              <ArrowLeft size={22} />
            </button>
            <h1 className="text-2xl font-semibold leading-tight text-[#1b1b1b]">{activeTitle}</h1>
          </div>
          <div className="relative">
            <Search size={22} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#4c4546]" />
            <input
              className="w-full rounded-lg border-none bg-[#f3f3f3] py-4 pl-12 pr-4 text-base text-[#1b1b1b] outline-none transition placeholder:text-[#4c4546]/60 focus:ring-1 focus:ring-[#1b1b1b]"
              placeholder={`Search in ${activeTitle}`}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              autoFocus
            />
          </div>
        </div>

        {error ? <ErrorState message={error} /> : null}

        {!displayedRecipes.length ? (
          <EmptyState
            title={query ? 'No matching recipes.' : `No recipes in ${activeTitle}.`}
            description={query ? 'Try another keyword inside this category.' : 'Add recipes to this category from a recipe detail page.'}
          />
        ) : null}

        <div className="flex flex-col gap-8">
          {displayedRecipes.map((recipe) => <RecipeSearchRow key={recipe.id} recipe={recipe} />)}
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-2xl space-y-8 pb-8">
      <div className="relative w-full">
        <Search size={22} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#8a7266]" />
        <input
          className="h-11 w-full rounded-xl border-none bg-[#e4e2e1] pl-12 pr-4 text-base leading-6 text-[#1b1c1c] outline-none transition placeholder:text-[#8a7266] focus:ring-2 focus:ring-[#974400]"
          placeholder="Search your recipes..."
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold leading-7 text-[#1b1c1c]">My Category</h1>
          <button type="button" className="text-sm font-semibold text-[#974400] hover:underline" onClick={() => setShowAllCategories((value) => !value)}>
            {showAllCategories ? 'Show Less' : 'View All'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <CategoryCard
            title="Favorites"
            count={recipes.filter((recipe) => recipe.is_favorite).length}
            active={false}
            iconIndex={0}
            onClick={() => setActiveFilter('favorites')}
          />
          {visibleCategories.map((folder, index) => (
            <CategoryCard
              key={folder.id}
              title={folder.name}
              count={counts.get(folder.id) || 0}
              active={false}
              iconIndex={index + 1}
              onClick={() => {
                setActiveFilter('folder')
                setSelectedFolderId(folder.id)
              }}
              onEdit={(event) => {
                event.stopPropagation()
                openEditModal(folder)
              }}
              onDelete={(event) => {
                event.stopPropagation()
                void deleteFolder(folder.id)
              }}
            />
          ))}
          {!folders.length ? (
            <button type="button" className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#ddc1b3] bg-white text-sm font-semibold text-[#974400]" onClick={openCreateModal}>
              <FolderPlus size={24} />
              Create Category
            </button>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[22px] font-semibold leading-7 text-[#1b1c1c]">{activeTitle}</h2>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#f0eded] px-3 py-2 text-xs font-semibold text-[#564338]">{displayedRecipes.length} total</span>
          </div>
        </div>

        {error ? <ErrorState message={error} /> : null}

        {!displayedRecipes.length ? (
          <EmptyState
            title={query ? 'No matching recipes.' : 'No recipes found.'}
            description={query ? 'Try a different search term or clear the active category.' : 'Add recipes, mark favorites, or place recipes in categories to build your book.'}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {displayedRecipes.map((recipe) => <RecipeBookCard key={recipe.id} recipe={recipe} />)}
        </div>
      </section>

      <button
        type="button"
        onClick={openCreateModal}
        className="fixed bottom-24 right-6 z-20 grid h-14 w-14 place-items-center rounded-2xl bg-[#974400] text-white shadow-xl transition hover:scale-105 active:scale-95"
        aria-label="Create category"
      >
        <FolderPlus size={28} />
      </button>

      {modalOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/30 px-4 pb-4 sm:place-items-center">
          <form onSubmit={submitFolder} className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-[22px] font-semibold leading-7 text-[#1b1c1c]">{editingId ? 'Edit Category' : 'Create Category'}</h2>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-[#f6f3f2] text-[#564338]" onClick={() => setModalOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <input
              className="mt-5 w-full rounded-lg border border-[#ddc1b3] bg-[#fbf9f8] px-4 py-3 text-sm outline-none focus:border-[#974400]"
              placeholder="e.g., Quick Dinners, Baking, Holiday Classics"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button disabled={!name.trim()} className="flex-1">{editingId ? 'Save' : 'Create'}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  )
}
