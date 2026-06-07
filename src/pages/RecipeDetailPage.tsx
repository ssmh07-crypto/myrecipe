import { Edit, Heart, Trash2, Wand2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { ErrorState, LoadingState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { requestRecipeHelp } from '../lib/apiClient'
import { supabase } from '../lib/supabaseClient'
import type { AiSuggestionPayload, Recipe, RecipeInput } from '../types/recipe'

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
  const { session } = useAuth()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [userRequest, setUserRequest] = useState('')
  const [suggestion, setSuggestion] = useState<AiSuggestionPayload | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

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

  const askAi = async (requestText: string) => {
    if (!recipe || !session?.access_token) return
    setAiLoading(true)
    setError('')
    try {
      setSuggestion(await requestRecipeHelp(recipe.id, requestText, session.access_token))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'AI 제안 생성에 실패했습니다.')
    } finally {
      setAiLoading(false)
    }
  }

  const applySuggestion = async () => {
    if (!recipe || !suggestion?.updated_recipe) return
    const nextRecipe = { ...recipe, ...suggestion.updated_recipe } as Recipe
    await supabase.from('recipes').update(suggestion.updated_recipe as Partial<RecipeInput>).eq('id', recipe.id)
    setRecipe(nextRecipe)
  }

  if (loading) return <LoadingState />
  if (error && !recipe) return <ErrorState message={error} />
  if (!recipe) return <ErrorState message="레시피를 찾을 수 없습니다." />

  const quickRequests = ['2인분으로 바꿔줘', '아이용으로 맵지 않게', '다이어트식으로 개선', '장보기 리스트 생성']

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
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{recipe.cooking_time || '시간 확인 필요'}</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{recipe.servings || 0}인분</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-800">{recipe.difficulty}</span>
          </div>
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

      <section className="space-y-3 rounded-xl border border-amber-100 bg-white p-4">
        <h2 className="font-bold text-stone-950">AI 도움</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {quickRequests.map((request) => (
            <button key={request} type="button" className="shrink-0 rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800" onClick={() => askAi(request)}>
              {request}
            </button>
          ))}
        </div>
        <textarea className="w-full rounded-lg border border-amber-100 px-3 py-3 text-sm outline-none focus:border-amber-500" rows={3} placeholder="예: 실패 원인을 분석해줘" value={userRequest} onChange={(event) => setUserRequest(event.target.value)} />
        <Button className="w-full" disabled={aiLoading || !userRequest} onClick={() => askAi(userRequest)}>
          <Wand2 size={18} /> 제안 받기
        </Button>
        {error ? <ErrorState message={error} /> : null}
        {suggestion ? (
          <div className="space-y-3 rounded-lg bg-amber-50 p-3 text-sm text-stone-700">
            <p className="font-semibold text-stone-950">{suggestion.summary}</p>
            {suggestion.shopping_list?.length ? <p>장보기: {suggestion.shopping_list.join(', ')}</p> : null}
            {suggestion.notes?.length ? <ul className="list-disc pl-5">{suggestion.notes.map((note) => <li key={note}>{note}</li>)}</ul> : null}
            <Button type="button" variant="secondary" onClick={applySuggestion}>제안 반영하기</Button>
          </div>
        ) : null}
      </section>

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
