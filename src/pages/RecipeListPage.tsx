import { Link2, Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { RecipeCard } from '../components/recipe/RecipeCard'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/State'
import { dummyRecipes } from '../lib/dummyRecipes'
import { supabase } from '../lib/supabaseClient'
import type { Recipe } from '../types/recipe'
import { useAuth } from '../hooks/useAuth'

export const RecipeListPage = ({ favoritesOnly = false }: { favoritesOnly?: boolean }) => {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState('')
  const [onlyFavorite, setOnlyFavorite] = useState(favoritesOnly)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!user) return
      setLoading(true)
      const { data, error: nextError } = await supabase.from('recipes').select('*').order('created_at', { ascending: false })
      setLoading(false)
      if (nextError) {
        setError(nextError.message)
      } else {
        setRecipes((data || []) as Recipe[])
      }
    }
    load()
  }, [user])

  useEffect(() => {
    if (searchParams.get('focus') === 'search') {
      window.setTimeout(() => document.getElementById('recipe-search')?.focus(), 100)
    }
  }, [searchParams])

  const tags = useMemo(() => Array.from(new Set(recipes.flatMap((recipe) => recipe.tags))).sort(), [recipes])
  const filtered = recipes.filter((recipe) => {
    const matchesQuery = [recipe.title, recipe.description, recipe.personal_note].join(' ').toLowerCase().includes(query.toLowerCase())
    const matchesTag = !tag || recipe.tags.includes(tag)
    const matchesFavorite = !onlyFavorite || recipe.is_favorite
    return matchesQuery && matchesTag && matchesFavorite
  })

  const seedSamples = async () => {
    if (!user) return
    setLoading(true)
    await supabase.from('recipes').insert(dummyRecipes.map((recipe) => ({ ...recipe, user_id: user.id })))
    const { data } = await supabase.from('recipes').select('*').order('created_at', { ascending: false })
    setRecipes((data || []) as Recipe[])
    setLoading(false)
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-950">{favoritesOnly ? '즐겨찾기' : '나의 레시피'}</h1>
          <p className="mt-1 text-sm text-stone-500">내 입맛에 맞춘 개인 레시피북</p>
        </div>
        <Link to="/recipes/new">
          <Button><Plus size={18} />작성</Button>
        </Link>
      </div>

      {!favoritesOnly ? (
        <div>
          <Link to="/recipes/import">
            <Button variant="secondary" className="w-full"><Link2 size={17} />링크로 레시피 가져오기</Button>
          </Link>
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-amber-100 bg-white p-3">
        <input id="recipe-search" className="w-full rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-3 text-sm outline-none focus:border-amber-500" placeholder="레시피 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${!tag ? 'bg-amber-700 text-white' : 'bg-amber-50 text-stone-600'}`} onClick={() => setTag('')}>전체</button>
          {tags.map((nextTag) => (
            <button key={nextTag} type="button" className={`shrink-0 rounded-full px-3 py-2 text-xs font-semibold ${tag === nextTag ? 'bg-amber-700 text-white' : 'bg-amber-50 text-stone-600'}`} onClick={() => setTag(nextTag)}>
              {nextTag}
            </button>
          ))}
        </div>
        {!favoritesOnly ? (
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={onlyFavorite} onChange={(event) => setOnlyFavorite(event.target.checked)} />
            즐겨찾기만 보기
          </label>
        ) : null}
      </div>

      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          title="저장된 레시피가 없습니다."
          description="직접 작성하거나 샘플 레시피 3개를 저장해 시작할 수 있습니다."
          action={<div className="flex justify-center gap-2"><Link to="/recipes/new"><Button>새 레시피</Button></Link><Button type="button" variant="secondary" onClick={seedSamples}>샘플 저장</Button></div>}
        />
      ) : null}
      <div className="space-y-3">{filtered.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} />)}</div>
    </section>
  )
}
