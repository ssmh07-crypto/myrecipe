import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Plus, Search, Signal, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { ensureRecipeFolders } from '../lib/recipeFolders'
import { getFolderImage } from '../lib/folderImages'
import { normalizeRecipe } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import type { Recipe, RecipeFolder } from '../types/recipe'

const RecentRecipeTile = ({ recipe }: { recipe: Recipe }) => (
  <Link to={`/recipes/${recipe.id}`} className="group block w-64 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm transition active:scale-95">
    <div className="aspect-[3/2] w-full overflow-hidden bg-[#e4e2e1]">
      {recipe.image_url ? (
        <img src={recipe.image_url} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="grid h-full place-items-center bg-[#ffdbc9] text-[#974400]">
          <BookOpen size={42} />
        </div>
      )}
    </div>
    <div className="space-y-2 p-4">
      <h3 className="truncate text-sm font-semibold text-[#1b1c1c]">{recipe.title}</h3>
      <div className="flex items-center gap-2 text-xs font-medium text-[#564338]">
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Signal size={14} /> {recipe.difficulty || 'Unrated'}
        </span>
        <span>·</span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Users size={14} /> {recipe.servings || 0} servings
        </span>
      </div>
    </div>
  </Link>
)

const FolderTile = ({ folder, count }: { folder: RecipeFolder; count: number }) => {
  const folderImage = getFolderImage(folder)

  return (
    <Link to={`/recipe-books?folder=${folder.id}`} className="group block overflow-hidden rounded-xl bg-white shadow-sm transition active:scale-95">
      <div className="relative h-48 overflow-hidden bg-[#e4e2e1]">
      <img
        src={folderImage.image}
        alt=""
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 flex items-center justify-center bg-black/25 px-4">
        <span className="text-center text-[28px] font-bold leading-[34px] tracking-[0.18em] text-white drop-shadow-sm">
          {folderImage.label.toUpperCase()}
        </span>
      </div>
      <span className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#4e6e00] shadow-sm backdrop-blur">
        {count}
      </span>
      </div>
    </Link>
  )
}

export const HomePage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [folders, setFolders] = useState<RecipeFolder[]>([])
  const [folderItems, setFolderItems] = useState<{ folder_id: string; recipe_id: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setRecipes([])
        setFolders([])
        setFolderItems([])
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const nextFolders = await ensureRecipeFolders(user.id)
        const [recipeResult, itemResult] = await Promise.all([
          supabase.from('recipes').select('*').order('created_at', { ascending: false }).limit(8),
          supabase.from('recipe_folder_items').select('folder_id, recipe_id'),
        ])

        if (recipeResult.error || itemResult.error) {
          throw new Error(recipeResult.error?.message || itemResult.error?.message || 'Failed to load home.')
        }

        setFolders(nextFolders)
        setFolderItems((itemResult.data || []) as { folder_id: string; recipe_id: string }[])
        setRecipes((recipeResult.data || []).map((recipe) => normalizeRecipe(recipe as Recipe)))
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : 'Failed to load home.')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [user])

  useEffect(() => {
    const preloadImportPage = () => {
      void import('./RecipeImportPage')
      void import('./RecipeAddPage')
    }
    const idleId = window.requestIdleCallback?.(preloadImportPage)
    if (!idleId) {
      const timer = window.setTimeout(preloadImportPage, 800)
      return () => window.clearTimeout(timer)
    }
    return () => window.cancelIdleCallback?.(idleId)
  }, [])

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>()
    folderItems.forEach((item) => map.set(item.folder_id, (map.get(item.folder_id) || 0) + 1))
    return map
  }, [folderItems])

  return (
    <section className="relative mx-auto min-h-[calc(100svh-140px)] max-w-xl space-y-8 pb-20">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-4 rounded-xl bg-[#e4e2e1] px-4 text-left text-base text-[#564338] transition focus:outline-none focus:ring-2 focus:ring-[#974400]"
        onClick={() => navigate('/recipe-books?search=1')}
      >
        <Search size={22} className="text-[#8a7266]" />
        <span>Search your recipes...</span>
      </button>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-[22px] font-semibold leading-7 text-[#1b1c1c]">Recent Recipes</h2>
          <Link to="/recipes/recent" className="text-sm font-semibold text-[#974400]">View all</Link>
        </div>

        {error ? <ErrorState message={error} /> : null}
        {loading ? <LoadingState /> : null}
        {!loading && !recipes.length ? (
          <EmptyState
            title={user ? 'No saved recipes yet.' : 'Browsing as a guest.'}
            description={user ? 'Create one manually or import your first recipe from a link.' : 'Sign in to save recipes, import from links, and use your recipe book.'}
            action={<Link to={user ? '/recipes/add' : '/login'}><Button>{user ? 'Add First Recipe' : 'Sign In'}</Button></Link>}
          />
        ) : null}
        <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
          {recipes.map((recipe) => <RecentRecipeTile key={recipe.id} recipe={recipe} />)}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-[22px] font-semibold leading-7 text-[#1b1c1c]">My Category</h2>
          <Link to="/recipe-books" className="text-sm font-semibold text-[#974400]">View all</Link>
        </div>

        {!loading && user ? (
          <div className="grid grid-cols-1 gap-4">
            {folders.map((folder) => (
              <FolderTile key={folder.id} folder={folder} count={folderCounts.get(folder.id) || 0} />
            ))}
          </div>
        ) : null}
        {!loading && !user ? (
          <EmptyState
            title="Sign in to use categories."
            description="Default categories such as Chicken, MEAT, FISH, and PASTA are created automatically after sign-in."
            action={<Link to="/login"><Button>Sign In</Button></Link>}
          />
        ) : null}
      </section>

      <button
        type="button"
        aria-label="Add recipe"
        className="fixed bottom-24 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#9a4022] text-white shadow-xl active:scale-95 md:hidden"
        onClick={() => navigate(user ? '/recipes/add' : '/login')}
      >
        <Plus size={27} />
      </button>
    </section>
  )
}
