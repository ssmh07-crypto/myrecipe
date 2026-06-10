import { CalendarDays, ChevronLeft, ChevronRight, Plus, Utensils } from 'lucide-react'
import { useMemo, useState } from 'react'

const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const toDateKey = (date: Date) => date.toISOString().slice(0, 10)

export const CalendarPage = () => {
  const today = useMemo(() => new Date(), [])
  const [selectedDate, setSelectedDate] = useState(toDateKey(today))

  const days = useMemo(() => {
    const year = today.getFullYear()
    const month = today.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const leadingBlanks = firstDay.getDay()
    const values: Array<{ key: string; label: string; muted: boolean }> = []

    for (let index = 0; index < leadingBlanks; index += 1) {
      values.push({ key: `blank-${index}`, label: '', muted: true })
    }

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      const date = new Date(year, month, day)
      values.push({ key: toDateKey(date), label: String(day), muted: false })
    }

    return values
  }, [today])

  const selectedLabel = new Date(`${selectedDate}T00:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  return (
    <section className="mx-auto max-w-xl space-y-6 pb-8">
      <div className="space-y-1">
        <h1 className="text-[28px] font-bold leading-[34px] text-[#1b1c1c]">Meal Calendar</h1>
        <p className="text-base leading-6 text-[#564338]">Track which recipes you cooked on each date.</p>
      </div>

      <section className="rounded-xl border border-[#ddc1b3] bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" aria-label="Previous month" className="grid h-10 w-10 place-items-center rounded-full text-[#564338] hover:bg-[#e4e2e1]">
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2 text-[22px] font-semibold leading-7 text-[#1b1c1c]">
            <CalendarDays size={22} className="text-[#974400]" />
            {today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <button type="button" aria-label="Next month" className="grid h-10 w-10 place-items-center rounded-full text-[#564338] hover:bg-[#e4e2e1]">
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
              className={`aspect-square rounded-lg text-sm font-semibold transition ${selectedDate === day.key ? 'bg-[#974400] text-white' : day.muted ? 'text-transparent' : 'bg-[#f6f3f2] text-[#1b1c1c] hover:bg-[#e4e2e1]'}`}
              onClick={() => setSelectedDate(day.key)}
            >
              {day.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-[#ddc1b3] bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[22px] font-semibold leading-7 text-[#1b1c1c]">{selectedLabel}</h2>
            <p className="mt-1 text-sm leading-5 text-[#564338]">Recipe selection for this date will be added here.</p>
          </div>
          <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#974400] text-white shadow-sm">
            <Plus size={22} />
          </button>
        </div>

        <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#ddc1b3] bg-[#fbf9f8] text-center">
          <Utensils size={28} className="text-[#974400]" />
          <p className="text-sm font-semibold text-[#1b1c1c]">No recipe selected yet.</p>
          <p className="max-w-xs text-xs leading-5 text-[#564338]">This placeholder will become the cooked-recipe picker once the detailed flow is defined.</p>
        </div>
      </section>
    </section>
  )
}
