import { Link, useNavigate } from 'react-router-dom'
import { FolderOpen, Plus, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { ensureRecipeFolders } from '../lib/recipeFolders'
import { normalizeRecipe } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import type { Recipe, RecipeFolder } from '../types/recipe'

const RecentRecipeTile = ({ recipe }: { recipe: Recipe }) => (
  <Link to={`/recipes/${recipe.id}`} className="group block w-64 shrink-0 overflow-hidden rounded-xl bg-white shadow-sm transition active:scale-95">
    <div className="aspect-[3/2] w-full overflow-hidden bg-[#e4e2e1]">
      {recipe.image_url ? (
        <img src={recipe.image_url} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      ) : (
        <div className="grid h-full place-items-center bg-[#ffdbc9] text-5xl">🍚</div>
      )}
    </div>
    <div className="space-y-2 p-4">
      <h3 className="truncate text-sm font-semibold text-[#1b1c1c]">{recipe.title}</h3>
      <div className="flex items-center gap-2 text-xs font-medium text-[#564338]">
        <span className={recipe.source_type === 'imported' ? 'text-sky-700' : 'text-emerald-700'}>
          {recipe.source_type === 'imported' ? 'Imported' : 'My Recipe'}
        </span>
        <span>·</span>
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <Users size={14} /> {recipe.servings || 0} servings
        </span>
      </div>
    </div>
  </Link>
)

const FolderTile = ({ folder, count }: { folder: RecipeFolder; count: number }) => (
  <Link to="/recipe-books" className="group overflow-hidden rounded-xl bg-white shadow-sm transition active:scale-95">
    <div className="relative h-32 overflow-hidden bg-[#ffdbc9]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#c8f17a_0,transparent_34%),linear-gradient(135deg,#ffdbc9,#f6f3f2)]" />
      <div className="absolute left-4 top-4 rounded-full bg-[#974400] px-3 py-1 text-xs font-semibold text-white">
        Category
      </div>
      <div className="absolute bottom-4 right-4 grid h-14 w-14 place-items-center rounded-full bg-white/85 text-[#974400] shadow-sm backdrop-blur">
        <FolderOpen size={28} />
      </div>
    </div>
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[22px] font-semibold leading-7 text-[#1b1c1c]">{folder.name}</h3>
        <span className="rounded-lg bg-[#c8f17a] px-2 py-1 text-xs font-semibold text-[#4e6e00]">
          {count}
        </span>
      </div>
      <p className="mt-2 text-sm text-[#564338]">{count} saved recipes</p>
    </div>
  </Link>
)

export const HomePage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [folders, setFolders] = useState<RecipeFolder[]>([])
  const [folderItems, setFolderItems] = useState<{ folder_id: string; recipe_id: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const displayName = (user?.user_metadata?.display_name as string | undefined) || 'Chef'

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
          throw new Error(recipeResult.error?.message || itemResult.error?.message || '홈을 불러오지 못했습니다.')
        }

        setFolders(nextFolders)
        setFolderItems((itemResult.data || []) as { folder_id: string; recipe_id: string }[])
        setRecipes((recipeResult.data || []).map((recipe) => normalizeRecipe(recipe as Recipe)))
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : '홈을 불러오지 못했습니다.')
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
      <div className="space-y-2">
        <p className="text-sm font-semibold text-[#564338]">Welcome back, {displayName}</p>
        <h1 className="text-[28px] font-bold leading-[34px] text-[#1b1c1c]">My Recipe Note</h1>
      </div>

      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-4 rounded-xl bg-[#e4e2e1] px-4 text-left text-base text-[#564338] transition focus:outline-none focus:ring-2 focus:ring-[#974400]"
        onClick={() => navigate('/recipes/search')}
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
            title={user ? '아직 저장된 레시피가 없습니다.' : '비회원으로 둘러보는 중입니다.'}
            description={user ? '직접 작성하거나 링크로 첫 레시피를 가져와 보세요.' : '레시피 저장, 링크 가져오기, 레시피북 기능은 로그인 후 사용할 수 있습니다.'}
            action={<Link to={user ? '/recipes/add' : '/login'}><Button>{user ? '첫 레시피 추가' : '로그인하기'}</Button></Link>}
          />
        ) : null}
        <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
          {recipes.map((recipe) => <RecentRecipeTile key={recipe.id} recipe={recipe} />)}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-[22px] font-semibold leading-7 text-[#1b1c1c]">My Feed</h2>
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
            title="로그인 후 카테고리를 사용할 수 있습니다."
            description="Chicken, MEAT, FISH, PASTA 기본 카테고리는 로그인 후 자동으로 만들어집니다."
            action={<Link to="/login"><Button>로그인하기</Button></Link>}
          />
        ) : null}
      </section>

      <button
        type="button"
        aria-label="레시피 추가"
        className="fixed bottom-24 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#9a4022] text-white shadow-xl active:scale-95 md:hidden"
        onClick={() => navigate(user ? '/recipes/add' : '/login')}
      >
        <Plus size={27} />
      </button>
    </section>
  )
}
