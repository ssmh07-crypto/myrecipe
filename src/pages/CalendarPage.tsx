import { CalendarDays, ChevronLeft, ChevronRight, Plus, Search, Trash2, Utensils, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { normalizeRecipe } from '../lib/recipes'
import { supabase } from '../lib/supabaseClient'
import type { Recipe } from '../types/recipe'

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type MealEntry = {
  id: string
  date: string
  type: 'recipe' | 'manual'
  recipeId?: string
  title: string
  note?: string
}

type MealEntryState = {
  key: string
  entries: MealEntry[]
}

const toDateKey = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const mealStorageKey = (userId: string | undefined) => `myrecipe:meal-calendar:${userId || 'guest'}`

export const CalendarPage = () => {
  const { user } = useAuth()
  const [monthDate, setMonthDate] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()))
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [entryState, setEntryState] = useState<MealEntryState>(() => {
    const key = mealStorageKey(undefined)
    const raw = window.localStorage.getItem(key)
    return { key, entries: raw ? JSON.parse(raw) as MealEntry[] : [] }
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'recipe' | 'manual'>('recipe')
  const [query, setQuery] = useState('')
  const [manualTitle, setManualTitle] = useState('')
  const [manualNote, setManualNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const recipeSearchRef = useRef<HTMLInputElement | null>(null)
  const firstRecipeButtonRef = useRef<HTMLButtonElement | null>(null)
  const entries = entryState.entries

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const key = mealStorageKey(user?.id)
      const raw = window.localStorage.getItem(key)
      setEntryState({ key, entries: raw ? JSON.parse(raw) as MealEntry[] : [] })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [user?.id])

  useEffect(() => {
    if (entryState.key !== mealStorageKey(user?.id)) return
    window.localStorage.setItem(entryState.key, JSON.stringify(entryState.entries))
  }, [entryState, user?.id])

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setRecipes([])
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      const { data, error: nextError } = await supabase.from('recipes').select('*').order('created_at', { ascending: false })
      setLoading(false)
      if (nextError) {
        setError(nextError.message)
        return
      }
      setRecipes((data || []).map((recipe) => normalizeRecipe(recipe as Recipe)))
    }
    void load()
  }, [user])

  const days = useMemo(() => {
    const year = monthDate.getFullYear()
    const month = monthDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const values: Array<{ key: string; label: string; muted: boolean; hasMeal: boolean }> = []

    for (let index = 0; index < firstDay.getDay(); index += 1) {
      values.push({ key: `blank-${index}`, label: '', muted: true, hasMeal: false })
    }

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      const date = new Date(year, month, day)
      const key = toDateKey(date)
      values.push({ key, label: String(day), muted: false, hasMeal: entries.some((entry) => entry.date === key) })
    }

    return values
  }, [entries, monthDate])

  const selectedEntries = entries.filter((entry) => entry.date === selectedDate)
  const filteredRecipes = recipes.filter((recipe) => [recipe.title, recipe.memo, recipe.difficulty].join(' ').toLowerCase().includes(query.trim().toLowerCase()))

  const selectedLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const shiftMonth = (amount: number) => {
    setMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1))
  }

  const addRecipeEntry = (recipe: Recipe) => {
    setEntryState((current) => ({
      ...current,
      entries: [
        ...current.entries,
        { id: crypto.randomUUID(), date: selectedDate, type: 'recipe', recipeId: recipe.id, title: recipe.title },
      ],
    }))
    setModalOpen(false)
    setQuery('')
  }

  const addManualEntry = () => {
    if (!manualTitle.trim()) return
    setEntryState((current) => ({
      ...current,
      entries: [
        ...current.entries,
        { id: crypto.randomUUID(), date: selectedDate, type: 'manual', title: manualTitle.trim(), note: manualNote.trim() },
      ],
    }))
    setManualTitle('')
    setManualNote('')
    setModalOpen(false)
  }

  const removeEntry = (entryId: string) => setEntryState((current) => ({ ...current, entries: current.entries.filter((entry) => entry.id !== entryId) }))

  return (
    <section className="mx-auto max-w-xl space-y-6 pb-8">
      <div className="space-y-1">
        <h1 className="text-[28px] font-bold leading-[34px] text-[#1b1c1c]">Meal Calendar</h1>
        <p className="text-base leading-6 text-[#564338]">Track which recipes you cooked on each date.</p>
      </div>

      <section className="rounded-xl border border-[#ddc1b3] bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" aria-label="Previous month" className="grid h-10 w-10 place-items-center rounded-full text-[#564338] hover:bg-[#e4e2e1]" onClick={() => shiftMonth(-1)}>
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2 text-[22px] font-semibold leading-7 text-[#1b1c1c]">
            <CalendarDays size={22} className="text-[#974400]" />
            {monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <button type="button" aria-label="Next month" className="grid h-10 w-10 place-items-center rounded-full text-[#564338] hover:bg-[#e4e2e1]" onClick={() => shiftMonth(1)}>
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-[#8a7266]">
          {weekDays.map((day) => <div key={day} className="py-2">{day}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => (
            <button
              key={day.key}
              type="button"
              disabled={day.muted}
              className={`relative aspect-square rounded-lg text-sm font-semibold transition ${selectedDate === day.key ? 'bg-[#974400] text-white' : day.muted ? 'text-transparent' : 'bg-[#f6f3f2] text-[#1b1c1c] hover:bg-[#e4e2e1]'}`}
              onClick={() => setSelectedDate(day.key)}
            >
              {day.label}
              {day.hasMeal ? <span className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${selectedDate === day.key ? 'bg-white' : 'bg-[#974400]'}`} /> : null}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-[#ddc1b3] bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-semibold leading-7 text-[#1b1c1c]">{selectedLabel}</h2>
            <p className="mt-1 text-sm leading-5 text-[#564338]">Choose a saved recipe or write what you cooked.</p>
          </div>
          <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#974400] text-white shadow-sm" onClick={() => setModalOpen(true)}>
            <Plus size={22} />
          </button>
        </div>

        {selectedEntries.length ? (
          <div className="space-y-2">
            {selectedEntries.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-3 rounded-lg bg-[#f6f3f2] p-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[#1b1c1c]">{entry.title}</p>
                  <p className="text-xs font-medium text-[#564338]">{entry.type === 'recipe' ? 'Saved recipe' : entry.note || 'Manual entry'}</p>
                </div>
                <button type="button" aria-label={`Remove ${entry.title}`} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-[#ba1a1a]" onClick={() => removeEntry(entry.id)}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#ddc1b3] bg-[#fbf9f8] text-center">
            <Utensils size={28} className="text-[#974400]" />
            <p className="text-sm font-semibold text-[#1b1c1c]">No recipe selected yet.</p>
            <p className="max-w-xs text-xs leading-5 text-[#564338]">Tap + to add a saved recipe or a manual meal note.</p>
          </div>
        )}
      </section>

      {modalOpen ? (
        <div className="fixed inset-0 z-40 grid place-items-end bg-black/30 px-4 pb-4 sm:place-items-center">
          <section className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-[22px] font-semibold leading-7 text-[#1b1c1c]">Add Meal</h2>
              <button type="button" aria-label="Close" className="grid h-9 w-9 place-items-center rounded-full bg-[#f6f3f2] text-[#564338]" onClick={() => setModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 rounded-lg bg-[#f0eded] p-1 text-sm font-semibold">
              <button type="button" className={`rounded-md px-3 py-2 ${activeTab === 'recipe' ? 'bg-white text-[#974400] shadow-sm' : 'text-[#564338]'}`} onClick={() => setActiveTab('recipe')}>
                Saved Recipe
              </button>
              <button type="button" className={`rounded-md px-3 py-2 ${activeTab === 'manual' ? 'bg-white text-[#974400] shadow-sm' : 'text-[#564338]'}`} onClick={() => setActiveTab('manual')}>
                Manual Entry
              </button>
            </div>

            {activeTab === 'recipe' ? (
              <div className="mt-4 space-y-3">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a7266]" />
                  <input
                    className="w-full rounded-lg border border-[#ddc1b3] bg-[#fbf9f8] px-4 py-3 pl-10 text-sm outline-none focus:border-[#974400]"
                    placeholder="Search saved recipes"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        recipeSearchRef.current?.blur()
                        window.setTimeout(() => {
                          firstRecipeButtonRef.current?.focus()
                          firstRecipeButtonRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                        }, 0)
                      }
                    }}
                    ref={recipeSearchRef}
                  />
                </div>
                {error ? <ErrorState message={error} /> : null}
                {loading ? <LoadingState label="Loading recipes..." /> : null}
                {!loading && !filteredRecipes.length ? <EmptyState title="No saved recipes found." description="Create a recipe first, or use the manual tab." /> : null}
                <div className="max-h-72 space-y-2 overflow-y-auto">
                  {filteredRecipes.map((recipe, index) => (
                    <button key={recipe.id} ref={index === 0 ? firstRecipeButtonRef : undefined} type="button" className="flex w-full items-center gap-3 rounded-lg bg-[#f6f3f2] p-3 text-left transition hover:bg-[#e4e2e1]" onClick={() => addRecipeEntry(recipe)}>
                      <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-white text-[#974400]">
                        {recipe.image_url ? <img src={recipe.image_url} alt="" className="h-full w-full object-cover" /> : <Utensils size={20} />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#1b1c1c]">{recipe.title}</p>
                        <p className="text-xs text-[#564338]">{recipe.difficulty || 'Recipe'}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <input
                  className="w-full rounded-lg border border-[#ddc1b3] bg-[#fbf9f8] px-4 py-3 text-sm outline-none focus:border-[#974400]"
                  placeholder="What did you cook?"
                  value={manualTitle}
                  onChange={(event) => setManualTitle(event.target.value)}
                />
                <textarea
                  className="w-full rounded-lg border border-[#ddc1b3] bg-[#fbf9f8] px-4 py-3 text-sm outline-none focus:border-[#974400]"
                  placeholder="Optional note"
                  rows={3}
                  value={manualNote}
                  onChange={(event) => setManualNote(event.target.value)}
                />
                <Button type="button" className="w-full" disabled={!manualTitle.trim()} onClick={addManualEntry}>Add Manual Entry</Button>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  )
}
