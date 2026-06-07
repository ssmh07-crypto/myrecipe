import { Camera, ExternalLink, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { cleanIngredientItems, formatIngredientItems, parseIngredientText } from '../../lib/ingredients'
import type { IngredientItem, RecipeFormResult, RecipeInput } from '../../types/recipe'
import { Button } from '../ui/Button'

const inputClass = 'w-full rounded-lg border border-amber-100 bg-white px-3 py-3 text-sm outline-none focus:border-amber-500'
const labelClass = 'text-sm font-semibold text-stone-800'
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']

const ItemRows = ({ items, onChange }: { items: IngredientItem[]; onChange: (items: IngredientItem[]) => void }) => {
  const rows = items.length ? items : [{ name: '', amount: '', unit: '' }]
  const update = (index: number, key: keyof IngredientItem, value: string) =>
    onChange(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)))

  return (
    <div className="space-y-2">
      {rows.map((item, index) => (
        <div key={index} className="grid grid-cols-[1fr_74px_64px_40px] gap-2">
          <input className={inputClass} placeholder="이름" value={item.name} onChange={(event) => update(index, 'name', event.target.value)} />
          <input className={inputClass} placeholder="수량" value={item.amount} onChange={(event) => update(index, 'amount', event.target.value)} />
          <input className={inputClass} placeholder="단위" value={item.unit} onChange={(event) => update(index, 'unit', event.target.value)} />
          <button type="button" aria-label="삭제" className="grid h-11 place-items-center rounded-lg border border-amber-100 bg-white text-stone-500" onClick={() => onChange(rows.filter((_item, itemIndex) => itemIndex !== index))}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <Button type="button" variant="secondary" className="w-full" onClick={() => onChange([...rows, { name: '', amount: '', unit: '' }])}>
        <Plus size={17} /> 행 추가
      </Button>
    </div>
  )
}

const IngredientEditor = ({
  label,
  items,
  onChange,
}: {
  label: string
  items: IngredientItem[]
  onChange: (items: IngredientItem[]) => void
}) => {
  const [mode, setMode] = useState<'bulk' | 'rows'>('bulk')
  const [bulkText, setBulkText] = useState(formatIngredientItems(items))

  const switchMode = (nextMode: 'bulk' | 'rows') => {
    if (mode === 'bulk') onChange(parseIngredientText(bulkText))
    setMode(nextMode)
  }

  return (
    <section className="space-y-2 rounded-xl border border-amber-100 bg-white/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <label className={labelClass}>{label}</label>
        <div className="grid grid-cols-2 rounded-lg bg-amber-50 p-1 text-xs font-semibold">
          <button type="button" className={`rounded-md px-2 py-1.5 ${mode === 'bulk' ? 'bg-white text-amber-900 shadow-sm' : 'text-stone-500'}`} onClick={() => switchMode('bulk')}>
            한번에 입력
          </button>
          <button type="button" className={`rounded-md px-2 py-1.5 ${mode === 'rows' ? 'bg-white text-amber-900 shadow-sm' : 'text-stone-500'}`} onClick={() => switchMode('rows')}>
            하나씩 입력
          </button>
        </div>
      </div>
      {mode === 'bulk' ? (
        <textarea
          className={inputClass}
          rows={3}
          placeholder="소고기 500g, 양파 1개, 고추 1개"
          value={bulkText}
          onChange={(event) => {
            setBulkText(event.target.value)
            onChange(parseIngredientText(event.target.value))
          }}
        />
      ) : (
        <ItemRows items={items} onChange={onChange} />
      )}
    </section>
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
  onSubmit: (result: RecipeFormResult) => Promise<void>
  loading?: boolean
}) => {
  const [form, setForm] = useState<RecipeInput>(initialValue)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageError, setImageError] = useState('')
  const [removeImage, setRemoveImage] = useState(false)
  const previewUrl = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : ''), [imageFile])
  const visibleImage = previewUrl || (!removeImage ? form.image_url : '')
  const isImported = form.source_type === 'imported'

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const setField = <K extends keyof RecipeInput>(key: K, value: RecipeInput[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleFile = (file: File | null) => {
    setImageError('')
    if (!file) return
    if (!allowedTypes.includes(file.type)) {
      setImageError('jpg, jpeg, png, webp 이미지만 업로드할 수 있습니다.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageError('이미지는 최대 5MB까지 업로드할 수 있습니다.')
      return
    }
    setImageFile(file)
    setRemoveImage(false)
  }

  const handleSubmit = async () => {
    await onSubmit({
      imageFile,
      removeImage,
      recipe: {
        ...form,
        title: form.title.trim(),
        ingredients: cleanIngredientItems(form.ingredients),
        seasonings: cleanIngredientItems(form.seasonings),
        steps_text: form.steps_text.trim(),
        memo: form.memo.trim(),
        source_type: isImported ? 'imported' : 'manual',
        source_url: isImported ? initialValue.source_url : form.source_url.trim(),
      },
    })
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl border border-amber-100 bg-white">
        <div className="relative grid aspect-[4/3] place-items-center bg-amber-50 text-stone-500">
          {visibleImage ? <img src={visibleImage} alt="" className="h-full w-full object-cover" /> : <Camera size={34} />}
          {visibleImage ? (
            <button type="button" aria-label="사진 삭제" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-stone-700 shadow-sm" onClick={() => { setImageFile(null); setRemoveImage(true) }}>
              <X size={18} />
            </button>
          ) : null}
        </div>
        <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 text-sm font-semibold text-amber-800">
          <Camera size={18} /> {visibleImage ? '사진 변경' : '사진 선택'}
          <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => handleFile(event.target.files?.[0] || null)} />
        </label>
      </section>
      {imageError ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{imageError}</p> : null}

      <section className="space-y-4 rounded-xl border border-amber-100 bg-white/70 p-4">
        <div className="space-y-2">
          <label className={labelClass}>레시피명</label>
          <input className={inputClass} value={form.title} onChange={(event) => setField('title', event.target.value)} placeholder="예: 김치볶음밥" />
        </div>
        <div className="space-y-2">
          <label className={labelClass}>인분</label>
          <input className={inputClass} type="number" min={0} value={form.servings ?? ''} onChange={(event) => setField('servings', Number(event.target.value) || null)} />
        </div>
      </section>

      <IngredientEditor label="재료" items={form.ingredients} onChange={(items) => setField('ingredients', items)} />
      <IngredientEditor label="양념" items={form.seasonings} onChange={(items) => setField('seasonings', items)} />

      <section className="space-y-2 rounded-xl border border-amber-100 bg-white/70 p-4">
        <label className={labelClass}>조리순서</label>
        <textarea className={inputClass} rows={9} style={{ minHeight: 220 }} value={form.steps_text} onChange={(event) => setField('steps_text', event.target.value)} placeholder="1. 재료를 손질한다&#10;2. 팬에 볶는다&#10;3. 간을 맞춘다" />
      </section>

      <section className="space-y-2 rounded-xl border border-amber-100 bg-white/70 p-4">
        <label className={labelClass}>메모</label>
        <textarea className={inputClass} rows={4} value={form.memo} onChange={(event) => setField('memo', event.target.value)} placeholder="다음엔 덜 짜게, 아이가 좋아함, 고기 더 넣기" />
      </section>

      {isImported ? (
        <section className="space-y-2 rounded-xl border border-amber-100 bg-white/70 p-4">
          <label className={labelClass}>출처 URL</label>
          <input className={`${inputClass} bg-stone-50 text-stone-500`} value={initialValue.source_url} readOnly />
          {initialValue.source_url ? (
            <a href={initialValue.source_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-800">
              <ExternalLink size={17} /> 원본 레시피 보기
            </a>
          ) : null}
        </section>
      ) : null}

      <Button type="button" className="w-full" disabled={loading || !form.title.trim()} onClick={handleSubmit}>
        {submitLabel}
      </Button>
    </div>
  )
}
