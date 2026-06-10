import { Link2, Plus } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { RecipeCard } from '../components/recipe/RecipeCard'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/State'
import { dummyRecipes } from '../lib/dummyRecipes'
import { normalizeRecipe } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import type { Recipe } from '../types/recipe'
import { useAuth } from '../hooks/useAuth'

export const RecipeListPage = ({
  title = '나의 레시피',
  subtitle = '빠르게 저장하는 개인 레시피 노트',
  showImportAction = true,
}: {
  title?: string
  subtitle?: string
  showImportAction?: boolean
}) => {
  const { user } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'manual' | 'imported'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)
  const firstResultRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setRecipes([])
        setLoading(false)
        return
      }
      setLoading(true)
      const { data, error: nextError } = await supabase.from('recipes').select('*').order('created_at', { ascending: false })
      setLoading(false)
      if (nextError) {
        setError(nextError.message)
      } else {
        setRecipes((data || []).map((recipe) => normalizeRecipe(recipe as Recipe)))
      }
    }
    load()
  }, [user])

  const filtered = recipes.filter((recipe) => {
    const matchesQuery = [recipe.title, recipe.memo, recipe.steps_text].join(' ').toLowerCase().includes(query.toLowerCase())
    const matchesSource = sourceFilter === 'all' || recipe.source_type === sourceFilter
    return matchesQuery && matchesSource
  })

  const seedSamples = async () => {
    if (!user) return
    setLoading(true)
    await supabase.from('recipes').insert(dummyRecipes.map((recipe) => ({ ...recipe, user_id: user.id })))
    const { data } = await supabase.from('recipes').select('*').order('created_at', { ascending: false })
    setRecipes((data || []).map((recipe) => normalizeRecipe(recipe as Recipe)))
    setLoading(false)
  }

  const emptyDescription = !user
    ? 'You can browse as a guest. Log in to see and save your recipes.'
    : sourceFilter === 'imported'
      ? 'No imported recipes yet.'
      : sourceFilter === 'manual'
        ? 'No manually written recipes yet.'
        : 'Write a recipe or save sample recipes to get started.'

  const emptyAction = !user ? (
    <Link to="/login"><Button>Log in</Button></Link>
  ) : sourceFilter === 'imported' ? (
    <Link to="/recipes/import"><Button><Link2 size={17} />Import from Link</Button></Link>
  ) : sourceFilter === 'manual' ? (
    <Link to="/recipes/new"><Button>New Recipe</Button></Link>
  ) : (
    <div className="flex justify-center gap-2">
      <Link to="/recipes/new"><Button>New Recipe</Button></Link>
      <Button type="button" variant="secondary" onClick={seedSamples}>Save Samples</Button>
    </div>
  )

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-stone-950">{title}</h1>
          <p className="mt-1 text-sm text-stone-500">{subtitle}</p>
        </div>
        <Link to={user ? '/recipes/new' : '/login'}>
          <Button><Plus size={18} />Write</Button>
        </Link>
      </div>

      {showImportAction ? <div>
        <Link to={user ? '/recipes/import' : '/login'}>
          <Button variant="secondary" className="w-full"><Link2 size={17} />Import Recipe from Link</Button>
        </Link>
      </div> : null}

      <div className="space-y-2 rounded-xl border border-amber-100 bg-white p-3">
        <input
          ref={searchRef}
          id="recipe-search"
          className="w-full rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-3 text-sm outline-none focus:border-amber-500"
          placeholder="Search recipes"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              searchRef.current?.blur()
              window.setTimeout(() => {
                firstResultRef.current?.focus()
                firstResultRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
              }, 0)
            }
          }}
        />
        <div className="grid grid-cols-3 gap-2">
          {[
            ['all', 'All'],
            ['manual', 'Manual'],
            ['imported', 'Imported'],
          ].map(([value, label]) => (
            <button key={value} type="button" className={`rounded-lg px-3 py-2 text-xs font-semibold ${sourceFilter === value ? 'bg-amber-700 text-white' : 'bg-amber-50 text-stone-600'}`} onClick={() => setSourceFilter(value as typeof sourceFilter)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {error ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState
          title="No saved recipes."
          description={emptyDescription}
          action={emptyAction}
        />
      ) : null}
      <div className="space-y-3">
        {filtered.map((recipe, index) => (
          <div key={recipe.id} ref={index === 0 ? firstResultRef : undefined} tabIndex={-1}>
            <RecipeCard recipe={recipe} />
          </div>
        ))}
      </div>
    </section>
  )
}
