import { Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '../ui/Button'
import type { RecipeInput } from '../../types/recipe'

const inputClass = 'w-full rounded-lg border border-amber-100 bg-white px-3 py-3 text-sm outline-none focus:border-amber-500'
const labelClass = 'text-sm font-semibold text-stone-800'

const splitTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

const DynamicList = ({
  label,
  values,
  placeholder,
  onChange,
}: {
  label: string
  values: string[]
  placeholder: string
  onChange: (values: string[]) => void
}) => {
  const update = (index: number, value: string) => onChange(values.map((item, itemIndex) => (itemIndex === index ? value : item)))
  const remove = (index: number) => onChange(values.filter((_item, itemIndex) => itemIndex !== index))

  return (
    <div className="space-y-2">
      <label className={labelClass}>{label}</label>
      {values.map((value, index) => (
        <div key={index} className="flex gap-2">
          <input className={inputClass} value={value} placeholder={placeholder} onChange={(event) => update(index, event.target.value)} />
          <button type="button" aria-label="삭제" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-amber-100 bg-white text-stone-500" onClick={() => remove(index)}>
            <Trash2 size={17} />
          </button>
        </div>
      ))}
      <Button type="button" variant="secondary" className="w-full" onClick={() => onChange([...values, ''])}>
        <Plus size={17} /> 추가
      </Button>
    </div>
  )
}

export const RecipeForm = ({
  initialValue,
  submitLabel,
  onSubmit,
  loading,
}: {
  initialValue: RecipeInput
  submitLabel: string
  onSubmit: (recipe: RecipeInput) => Promise<void>
  loading?: boolean
}) => {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<RecipeInput>(initialValue)
  const tagText = useMemo(() => form.tags.join(', '), [form.tags])

  const setField = <K extends keyof RecipeInput>(key: K, value: RecipeInput[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const clean = (items: string[]) => items.map((item) => item.trim()).filter(Boolean)

  const handleSubmit = async () => {
    await onSubmit({
      ...form,
      title: form.title.trim(),
      ingredients: clean(form.ingredients),
      seasonings: clean(form.seasonings),
      steps: clean(form.steps),
      tips: clean(form.tips),
      tags: clean(form.tags),
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {['기본', '재료', '메모'].map((label, index) => (
          <button key={label} type="button" onClick={() => setStep(index)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${step === index ? 'bg-amber-700 text-white' : 'bg-white text-stone-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <section className="space-y-4 rounded-xl border border-amber-100 bg-white/70 p-4">
          <div className="space-y-2">
            <label className={labelClass}>레시피명</label>
            <input className={inputClass} value={form.title} onChange={(event) => setField('title', event.target.value)} placeholder="예: 김치볶음밥" />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>설명</label>
            <textarea className={inputClass} rows={3} value={form.description} onChange={(event) => setField('description', event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>대표 이미지 URL</label>
            <input className={inputClass} value={form.image_url} onChange={(event) => setField('image_url', event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className={labelClass}>조리 시간</label>
              <input className={inputClass} value={form.cooking_time} onChange={(event) => setField('cooking_time', event.target.value)} placeholder="20분" />
            </div>
            <div className="space-y-2">
              <label className={labelClass}>인분</label>
              <input className={inputClass} type="number" min={0} value={form.servings ?? ''} onChange={(event) => setField('servings', Number(event.target.value) || null)} />
            </div>
          </div>
          <div className="space-y-2">
            <label className={labelClass}>난이도</label>
            <select className={inputClass} value={form.difficulty} onChange={(event) => setField('difficulty', event.target.value as RecipeInput['difficulty'])}>
              <option>쉬움</option>
              <option>보통</option>
              <option>어려움</option>
            </select>
          </div>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-5 rounded-xl border border-amber-100 bg-white/70 p-4">
          <DynamicList label="재료" values={form.ingredients} placeholder="재료와 양" onChange={(values) => setField('ingredients', values)} />
          <DynamicList label="양념" values={form.seasonings} placeholder="양념과 양" onChange={(values) => setField('seasonings', values)} />
          <DynamicList label="조리 순서" values={form.steps} placeholder="한 단계씩 입력" onChange={(values) => setField('steps', values)} />
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4 rounded-xl border border-amber-100 bg-white/70 p-4">
          <DynamicList label="팁" values={form.tips.length ? form.tips : ['']} placeholder="알아두면 좋은 점" onChange={(values) => setField('tips', values)} />
          <div className="space-y-2">
            <label className={labelClass}>태그</label>
            <input className={inputClass} value={tagText} onChange={(event) => setField('tags', splitTags(event.target.value))} placeholder="한식, 집밥, 간단요리" />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>나만의 메모</label>
            <textarea className={inputClass} rows={3} value={form.personal_note} onChange={(event) => setField('personal_note', event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>다음에 수정할 점</label>
            <textarea className={inputClass} rows={3} value={form.next_time_note} onChange={(event) => setField('next_time_note', event.target.value)} />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>출처 URL</label>
            <input className={inputClass} value={form.source_url} onChange={(event) => setField('source_url', event.target.value)} />
          </div>
        </section>
      ) : null}

      <div className="flex gap-2">
        {step > 0 ? <Button type="button" variant="secondary" className="flex-1" onClick={() => setStep(step - 1)}>이전</Button> : null}
        {step < 2 ? (
          <Button type="button" className="flex-1" onClick={() => setStep(step + 1)}>다음</Button>
        ) : (
          <Button type="button" className="flex-1" disabled={loading || !form.title.trim()} onClick={handleSubmit}>{submitLabel}</Button>
        )}
      </div>
    </div>
  )
}
