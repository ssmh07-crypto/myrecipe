import { Link, useNavigate } from 'react-router-dom'
import { BookOpen, Link2, Search, Sparkles, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { normalizeRecipe } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import type { Recipe } from '../types/recipe'

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

export const HomePage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const displayName = (user?.user_metadata?.display_name as string | undefined) || 'Chef'

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setRecipes([])
        setLoading(false)
        return
      }
      setLoading(true)
      const { data, error: nextError } = await supabase.from('recipes').select('*').order('created_at', { ascending: false }).limit(8)
      setLoading(false)
      if (nextError) setError(nextError.message)
      else setRecipes((data || []).map((recipe) => normalizeRecipe(recipe as Recipe)))
    }
    void load()
  }, [user])

  const counts = useMemo(
    () => ({
      total: recipes.length,
      imported: recipes.filter((recipe) => recipe.source_type === 'imported').length,
      manual: recipes.filter((recipe) => recipe.source_type === 'manual').length,
    }),
    [recipes],
  )

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
              <span className="text-xs font-bold uppercase tracking-wider">AI Import</span>
            </div>
            <h2 className="font-serif text-2xl font-semibold text-white">Import from anywhere</h2>
            <p className="text-sm leading-6 text-white/90">링크 하나만 붙여넣으면 광고와 긴 글을 걷어내고 주방에서 바로 쓰기 좋은 레시피 초안을 만듭니다.</p>
          </div>
          <Link to={user ? '/recipes/import' : '/login'}>
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

      <button
        type="button"
        aria-label="검색"
        className="fixed bottom-24 right-6 z-40 grid h-14 w-14 place-items-center rounded-full bg-[#9a4022] text-white shadow-xl active:scale-95 md:hidden"
        onClick={() => navigate('/recipes/search')}
      >
        <Search size={24} />
      </button>
    </section>
  )
}
