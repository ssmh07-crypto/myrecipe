import { Edit, ExternalLink, Heart, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ErrorState, LoadingState } from '../components/ui/State'
import { supabase } from '../lib/supabaseClient'
import type { Recipe } from '../types/recipe'

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
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      if (!id) return
      const { data, error: nextError } = await supabase.from('recipes').select('*').eq('id', id).single()
      setLoading(false)
      if (nextError) setError(nextError.message)
      else setRecipe(data as Recipe)
    }
    load()
  }, [id])

  const toggleFavorite = async () => {
    if (!recipe) return
    const next = !recipe.is_favorite
    setRecipe({ ...recipe, is_favorite: next })
    await supabase.from('recipes').update({ is_favorite: next }).eq('id', recipe.id)
  }

  const deleteRecipe = async () => {
    if (!recipe) return
    await supabase.from('recipes').delete().eq('id', recipe.id)
    navigate('/recipes')
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
            <div>
              <h1 className="text-2xl font-bold text-stone-950">{recipe.title}</h1>
              <p className="mt-1 text-sm leading-6 text-stone-600">{recipe.description}</p>
            </div>
            <button type="button" aria-label="즐겨찾기" className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-rose-500" onClick={toggleFavorite}>
              <Heart size={20} className={recipe.is_favorite ? 'fill-rose-500' : ''} />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`rounded-full px-3 py-1 font-semibold ${recipe.source_type === 'imported' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {recipe.source_type === 'imported' ? '가져온 레시피' : '내가 만든 레시피'}
            </span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{recipe.cooking_time || '시간 확인 필요'}</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{recipe.servings || 0}인분</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{recipe.difficulty}</span>
          </div>
          {recipe.source_type === 'imported' && recipe.source_url ? (
            <a href={recipe.source_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
              <ExternalLink size={17} /> 원본 레시피 보기
            </a>
          ) : null}
          <div className="flex gap-2">
            <Link className="flex-1" to={`/recipes/${recipe.id}/edit`}><Button className="w-full" variant="secondary"><Edit size={17} />수정</Button></Link>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}><Trash2 size={17} />삭제</Button>
          </div>
        </div>
      </div>

      <Section title="재료" items={recipe.ingredients} />
      <Section title="양념" items={recipe.seasonings} />
      <Section title="조리 순서" items={recipe.steps} ordered />
      {recipe.tips?.length ? <Section title="팁" items={recipe.tips} /> : null}

      {(recipe.personal_note || recipe.next_time_note) ? (
        <section className="rounded-xl border border-amber-100 bg-white p-4 text-sm leading-6 text-stone-700">
          <h2 className="font-bold text-stone-950">내 메모</h2>
          {recipe.personal_note ? <p className="mt-2">{recipe.personal_note}</p> : null}
          {recipe.next_time_note ? <p className="mt-2 text-stone-500">다음에는: {recipe.next_time_note}</p> : null}
        </section>
      ) : null}

      <ConfirmDialog open={confirmOpen} title="레시피 삭제" description="삭제한 레시피는 되돌릴 수 없습니다." onCancel={() => setConfirmOpen(false)} onConfirm={deleteRecipe} />
    </article>
  )
}
