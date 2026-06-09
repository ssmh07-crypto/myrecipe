import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, FolderOpen, Link2, Plus, Sparkles, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { ensureRecipeFolders } from '../lib/recipeFolders'
import { normalizeRecipe } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import type { Recipe, RecipeFolder } from '../types/recipe'

const RecentRecipeTile = ({ recipe }: { recipe: Recipe }) => (
  <Link to={`/recipes/${recipe.id}`} className="block min-w-[280px] overflow-hidden rounded-xl bg-[#e4e2dd] shadow-sm">
    <div className="h-44 overflow-hidden bg-[#f5ece7]">
      {recipe.image_url ? (
        <img src={recipe.image_url} alt="" className="h-full w-full object-cover transition-transform duration-500 hover:scale-105" />
      ) : (
        <div className="grid h-full place-items-center text-5xl">🍚</div>
      )}
    </div>
    <div className="space-y-2 p-4">
      <h3 className="line-clamp-1 font-serif text-2xl font-semibold text-[#1e1b18]">{recipe.title}</h3>
      <div className="flex items-center justify-between text-xs font-semibold text-[#56423c]">
        <span className={recipe.source_type === 'imported' ? 'text-sky-700' : 'text-emerald-700'}>
          {recipe.source_type === 'imported' ? '가져온 레시피' : '내가 만든 레시피'}
        </span>
        <span className="inline-flex items-center gap-1">
          <Users size={14} /> {recipe.servings || 0}인분
        </span>
      </div>
    </div>
  </Link>
)

const FolderTile = ({ folder, count }: { folder: RecipeFolder; count: number }) => (
  <Link to="/recipe-books" className="flex min-h-24 items-center gap-4 rounded-xl bg-white p-4 shadow-sm transition active:scale-[0.98]">
    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#ffdbd0] text-[#9a4022]">
      <FolderOpen size={24} />
    </span>
    <div className="min-w-0 flex-1">
      <h3 className="truncate text-lg font-bold text-[#1e1b18]">{folder.name}</h3>
      <p className="mt-1 text-sm font-semibold text-[#89726b]">{count} recipes</p>
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

  const counts = useMemo(
    () => ({
      total: recipes.length,
      imported: recipes.filter((recipe) => recipe.source_type === 'imported').length,
      manual: recipes.filter((recipe) => recipe.source_type === 'manual').length,
    }),
    [recipes],
  )

  const folderCounts = useMemo(() => {
    const map = new Map<string, number>()
    folderItems.forEach((item) => map.set(item.folder_id, (map.get(item.folder_id) || 0) + 1))
    return map
  }, [folderItems])

  return (
    <section className="relative -mx-4 min-h-[calc(100svh-140px)] space-y-8 px-5 pb-20 pt-2">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[#56423c]">Welcome back, {displayName}</p>
        <h1 className="font-serif text-[28px] font-bold leading-9 text-[#1e1b18]">오늘은 어떤 레시피를 저장할까요?</h1>
      </div>

      <div className="relative overflow-hidden rounded-xl bg-[#b95837] p-6 shadow-lg">
        <div className="absolute -right-16 -top-16 h-32 w-32 rounded-full bg-[#390b00]/10" />
        <div className="relative z-10 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-white">
              <Sparkles size={19} className="fill-white" />
              <span className="text-xs font-bold uppercase tracking-wider">Recipe Import</span>
            </div>
            <h2 className="font-serif text-2xl font-semibold text-white">Import from anywhere</h2>
            <p className="text-sm leading-6 text-white/90">권한이 있는 웹 레시피 링크를 붙여넣으면 주방에서 바로 쓰기 좋은 개인 레시피 초안으로 정리합니다.</p>
          </div>
          <Link to="/recipes/import">
            <Button variant="secondary" className="bg-white text-[#9a4022]">
              <Link2 size={18} /> Import via Link
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-[#89726b]">Total</p>
          <p className="mt-1 text-2xl font-bold text-[#1e1b18]">{counts.total}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-[#89726b]">Manual</p>
          <p className="mt-1 text-2xl font-bold text-[#1e1b18]">{counts.manual}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold text-[#89726b]">Imported</p>
          <p className="mt-1 text-2xl font-bold text-[#1e1b18]">{counts.imported}</p>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl font-semibold text-[#1e1b18]">Recent Recipes</h2>
          <Link to="/recipes/recent" className="text-sm font-semibold text-[#9a4022]">View All</Link>
        </div>

        {error ? <ErrorState message={error} /> : null}
        {loading ? <LoadingState /> : null}
        {!loading && !recipes.length ? (
          <EmptyState
            title={user ? '아직 저장된 레시피가 없습니다.' : '비회원으로 둘러보는 중입니다.'}
            description={user ? '직접 작성하거나 링크로 첫 레시피를 가져와 보세요.' : '레시피 저장, 링크 가져오기, 레시피북 기능은 로그인 후 사용할 수 있습니다.'}
            action={<Link to={user ? '/recipes/new' : '/login'}><Button><BookOpen size={17} /> {user ? '첫 레시피 작성' : '로그인하기'}</Button></Link>}
          />
        ) : null}
        <div className="no-scrollbar -mx-5 flex gap-4 overflow-x-auto px-5 pb-2">
          {recipes.map((recipe) => <RecentRecipeTile key={recipe.id} recipe={recipe} />)}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-2xl font-semibold text-[#1e1b18]">My Feed</h2>
          <Link to="/recipe-books" className="text-sm font-semibold text-[#9a4022]">View All</Link>
        </div>

        {!loading && user ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
