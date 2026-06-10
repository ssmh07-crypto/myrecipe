import { Camera, ChevronDown, ExternalLink, ImagePlus, Minus, Plus, ShoppingBasket, Trash2, Utensils, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { compressRecipeImage } from '../../lib/imageCompression'
import { cleanIngredientItems, formatIngredientItems, parseIngredientText } from '../../lib/ingredients'
import type { IngredientItem, RecipeFormResult, RecipeInput } from '../../types/recipe'
import { Button } from '../ui/Button'

const inputClass = 'w-full rounded-lg border border-[#ddc1b3] bg-white px-4 py-3 text-base leading-6 text-[#1b1c1c] outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#974400]'
const labelClass = 'px-1 text-sm font-semibold leading-5 text-[#974400]'
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
const servingOptions = Array.from({ length: 12 }, (_value, index) => index + 1)
const difficultyOptions = ['Easy', 'Medium', 'Hard']

const normalizeDifficulty = (value: string) => {
  if (value === '\uc26c\uc6c0') return 'Easy'
  if (value === '\ubcf4\ud1b5') return 'Medium'
  if (value === '\uc5b4\ub824\uc6c0') return 'Hard'
  return value || 'Easy'
}

const ItemRows = ({ items, onChange }: { items: IngredientItem[]; onChange: (items: IngredientItem[]) => void }) => {
  const rows = items.length ? items : [{ name: '', amount: '', unit: '' }]
  const update = (index: number, key: keyof IngredientItem, value: string) =>
    onChange(rows.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)))

  return (
    <div className="space-y-2">
      {rows.map((item, index) => (
        <div key={index} className="grid grid-cols-[1fr_72px_64px_40px] gap-2">
          <input className={inputClass} placeholder="Name" value={item.name} onChange={(event) => update(index, 'name', event.target.value)} />
          <input className={inputClass} placeholder="Qty" value={item.amount} onChange={(event) => update(index, 'amount', event.target.value)} />
          <input className={inputClass} placeholder="Unit" value={item.unit} onChange={(event) => update(index, 'unit', event.target.value)} />
          <button type="button" aria-label="Remove item" className="grid h-12 place-items-center rounded-lg border border-[#ddc1b3] bg-white text-[#564338]" onClick={() => onChange(rows.filter((_item, itemIndex) => itemIndex !== index))}>
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#ffdbc9] px-4 py-2 text-sm font-semibold text-[#974400] transition hover:bg-[#bb5808] hover:text-white" onClick={() => onChange([...rows, { name: '', amount: '', unit: '' }])}>
        <Plus size={17} /> Add item
      </button>
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
    if (nextMode === 'bulk') setBulkText(formatIngredientItems(items))
    setMode(nextMode)
  }

  return (
    <section className="space-y-4 rounded-xl border border-[#e4e2e1] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[22px] font-semibold leading-7 text-[#1b1c1c]">
          <ShoppingBasket size={22} className="text-[#974400]" />
          {label}
        </h3>
        <div className="grid grid-cols-2 rounded-lg bg-[#f0eded] p-1 text-xs font-semibold">
          <button type="button" className={`rounded-md px-2 py-1.5 ${mode === 'bulk' ? 'bg-white text-[#974400] shadow-sm' : 'text-[#564338]'}`} onClick={() => switchMode('bulk')}>
            Bulk
          </button>
          <button type="button" className={`rounded-md px-2 py-1.5 ${mode === 'rows' ? 'bg-white text-[#974400] shadow-sm' : 'text-[#564338]'}`} onClick={() => switchMode('rows')}>
            Rows
          </button>
        </div>
      </div>
      {mode === 'bulk' ? (
        <textarea
          className="w-full rounded-lg border-none bg-[#f6f3f2] p-4 text-base leading-6 text-[#1b1c1c] outline-none transition focus:ring-2 focus:ring-[#974400]"
          rows={label === 'Ingredients' ? 4 : 3}
          placeholder={label === 'Ingredients' ? 'Fresh spinach 2 cups\nCherry tomatoes 10 pcs\nFeta cheese 50g' : 'Olive oil\nSea salt\nBlack pepper'}
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
  actionLayout = 'inline',
}: {
  initialValue: RecipeInput
  submitLabel: string
  onSubmit: (result: RecipeFormResult) => Promise<void>
  loading?: boolean
  actionLayout?: 'inline' | 'sticky'
}) => {
  const normalizedInitial = useMemo(() => ({ ...initialValue, difficulty: normalizeDifficulty(initialValue.difficulty) }), [initialValue])
  const [form, setForm] = useState<RecipeInput>(normalizedInitial)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imageError, setImageError] = useState('')
  const [removeImage, setRemoveImage] = useState(false)
  const [stepImageFiles, setStepImageFiles] = useState<Record<number, File>>({})
  const [stepImagePreviews, setStepImagePreviews] = useState<Record<number, string>>({})
  const stepImagePreviewsRef = useRef<Record<number, string>>({})
  const [removeStepImageIndexes, setRemoveStepImageIndexes] = useState<number[]>([])
  const previewUrl = useMemo(() => (imageFile ? URL.createObjectURL(imageFile) : ''), [imageFile])
  const visibleImage = previewUrl || (!removeImage ? form.image_url : '')
  const steps = form.steps_text.split('\n').map((step) => step.trim()).filter(Boolean)
  const stepRows = steps.length ? steps : ['']
  const isImported = form.source_type === 'imported'

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  useEffect(() => {
    return () => {
      Object.values(stepImagePreviewsRef.current).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [])

  useEffect(() => {
    stepImagePreviewsRef.current = stepImagePreviews
  }, [stepImagePreviews])

  const setField = <K extends keyof RecipeInput>(key: K, value: RecipeInput[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  const handleFile = async (file: File | null) => {
    setImageError('')
    if (!file) return
    if (!allowedTypes.includes(file.type)) {
      setImageError('Only jpg, jpeg, png, and webp images can be uploaded.')
      return
    }
    try {
      setImageFile(await compressRecipeImage(file))
      setRemoveImage(false)
    } catch (nextError) {
      setImageError(nextError instanceof Error ? nextError.message : 'Image compression failed.')
    }
  }

  const handleStepFile = async (stepIndex: number, file: File | null) => {
    setImageError('')
    if (!file) return
    if (!allowedTypes.includes(file.type)) {
      setImageError('Step photos must be jpg, jpeg, png, or webp.')
      return
    }
    try {
      const compressed = await compressRecipeImage(file)
      setStepImageFiles((prev) => ({ ...prev, [stepIndex]: compressed }))
      setStepImagePreviews((prev) => {
        if (prev[stepIndex]) URL.revokeObjectURL(prev[stepIndex])
        return { ...prev, [stepIndex]: URL.createObjectURL(compressed) }
      })
      setRemoveStepImageIndexes((prev) => prev.filter((index) => index !== stepIndex))
    } catch (nextError) {
      setImageError(nextError instanceof Error ? nextError.message : 'Step photo compression failed.')
    }
  }

  const removeStepImage = (stepIndex: number) => {
    setStepImageFiles((prev) => {
      const next = { ...prev }
      delete next[stepIndex]
      return next
    })
    setStepImagePreviews((prev) => {
      if (prev[stepIndex]) URL.revokeObjectURL(prev[stepIndex])
      const next = { ...prev }
      delete next[stepIndex]
      return next
    })
    setRemoveStepImageIndexes((prev) => Array.from(new Set([...prev, stepIndex])))
  }

  const updateStep = (index: number, value: string) => {
    const next = [...stepRows]
    next[index] = value
    setField('steps_text', next.join('\n'))
  }

  const addStep = () => setField('steps_text', [...stepRows, ''].join('\n'))

  const handleSubmit = async () => {
    if (imageError) return
    const normalizedSteps = form.steps_text.split('\n').map((step) => step.trim()).filter(Boolean)
    await onSubmit({
      imageFile,
      removeImage,
      stepImageFiles,
      removeStepImageIndexes,
      recipe: {
        ...form,
        title: form.title.trim(),
        difficulty: normalizeDifficulty(form.difficulty),
        ingredients: cleanIngredientItems(form.ingredients),
        seasonings: cleanIngredientItems(form.seasonings),
        steps_text: normalizedSteps.join('\n'),
        step_images: form.step_images.slice(0, normalizedSteps.length),
        memo: form.memo.trim(),
        source_type: isImported ? 'imported' : 'manual',
        source_url: isImported ? initialValue.source_url : form.source_url.trim(),
      },
    })
  }

  const actionButtons = (
    <>
      {actionLayout === 'sticky' ? (
        <button type="button" className="h-12 flex-1 rounded-xl bg-[#e4e2e1] px-4 text-sm font-semibold text-[#564338] transition hover:opacity-80" onClick={() => window.history.back()}>
          Discard
        </button>
      ) : null}
      <button
        type="button"
        className={`${actionLayout === 'sticky' ? 'h-12 flex-[2] rounded-xl text-[22px] font-semibold leading-7 shadow-lg shadow-[#974400]/20' : 'min-h-12 w-full rounded-lg text-sm font-bold'} bg-[#974400] px-4 py-2 text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60`}
        disabled={loading || !form.title.trim()}
        onClick={handleSubmit}
      >
        {loading ? 'Saving...' : submitLabel}
      </button>
    </>
  )

  return (
    <div className={actionLayout === 'sticky' ? 'space-y-6 pb-24' : 'space-y-6'}>
      <section className="group relative grid aspect-[3/2] w-full cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed border-[#ddc1b3] bg-[#eae8e7] transition hover:border-[#974400]">
        {visibleImage ? <img src={visibleImage} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45 transition group-hover:opacity-55" /> : null}
        <label className="relative z-10 flex cursor-pointer flex-col items-center gap-2 text-[#974400]">
          <Camera size={48} />
          <span className="text-sm font-semibold">{visibleImage ? 'Change Recipe Cover' : 'Add Recipe Cover'}</span>
          <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleFile(event.target.files?.[0] || null)} />
        </label>
        {visibleImage ? (
          <button type="button" aria-label="Remove cover photo" className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-[#564338] shadow-sm" onClick={() => { setImageFile(null); setRemoveImage(true) }}>
            <X size={18} />
          </button>
        ) : null}
      </section>
      {imageError ? <p className="rounded-lg bg-[#ffdad6] p-3 text-sm font-medium text-[#93000a]">{imageError}</p> : null}

      <section className="space-y-4">
        <div className="space-y-1">
          <label className={labelClass}>Recipe Title</label>
          <input className={inputClass} value={form.title} onChange={(event) => setField('title', event.target.value)} placeholder="e.g., Summer Garden Salad" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className={labelClass}>Servings</label>
            <div className="flex h-11 items-center rounded-lg border border-[#ddc1b3] bg-white px-2">
              <button type="button" aria-label="Decrease servings" className="grid h-9 w-9 place-items-center rounded-full text-[#564338] active:scale-90" onClick={() => setField('servings', Math.max((form.servings || 1) - 1, 1))}>
                <Minus size={18} />
              </button>
              <input className="w-full border-none bg-transparent text-center text-base leading-6 text-[#1b1c1c] focus:ring-0" type="number" min={1} max={12} value={form.servings ?? ''} onChange={(event) => setField('servings', Number(event.target.value) || null)} />
              <button type="button" aria-label="Increase servings" className="grid h-9 w-9 place-items-center rounded-full text-[#564338] active:scale-90" onClick={() => setField('servings', Math.min((form.servings || 1) + 1, servingOptions.length))}>
                <Plus size={18} />
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <label className={labelClass}>Difficulty</label>
            <div className="relative">
              <select className={`${inputClass} h-11 appearance-none py-0`} value={normalizeDifficulty(form.difficulty)} onChange={(event) => setField('difficulty', event.target.value)}>
                {difficultyOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
              <ChevronDown size={20} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#564338]" />
            </div>
          </div>
        </div>
      </section>

      <IngredientEditor label="Ingredients" items={form.ingredients} onChange={(items) => setField('ingredients', items)} />
      <IngredientEditor label="Seasonings" items={form.seasonings} onChange={(items) => setField('seasonings', items)} />

      <section className="space-y-4">
        <h3 className="flex items-center gap-2 text-[22px] font-semibold leading-7 text-[#1b1c1c]">
          <Utensils size={22} className="text-[#974400]" />
          Cooking Steps
        </h3>

        <div className="space-y-6">
          {stepRows.map((step, index) => {
            const imageUrl = stepImagePreviews[index] || (!removeStepImageIndexes.includes(index) ? form.step_images[index] : '')
            return (
              <div key={index} className="flex gap-4">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#974400] text-sm font-bold text-white">{index + 1}</div>
                <div className="min-w-0 flex-1 space-y-3">
                  <textarea className={inputClass} rows={2} placeholder="Step description..." value={step} onChange={(event) => updateStep(index, event.target.value)} />
                  <div className="overflow-hidden rounded-lg border border-[#ddc1b3] bg-white">
                    {imageUrl ? (
                      <div className="relative">
                        <img src={imageUrl} alt="" className="h-36 w-full object-cover" />
                        <button type="button" aria-label="Remove step photo" className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[#564338]" onClick={() => removeStepImage(index)}>
                          <X size={16} />
                        </button>
                      </div>
                    ) : null}
                    <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 bg-[#f6f3f2] text-sm font-semibold text-[#974400]">
                      <ImagePlus size={17} />
                      {imageUrl ? 'Change Step Photo' : 'Add Step Photo'}
                      <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => void handleStepFile(index, event.target.files?.[0] || null)} />
                    </label>
                  </div>
                </div>
              </div>
            )
          })}

          <button type="button" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#ddc1b3] px-4 py-3 text-sm font-semibold text-[#564338] transition hover:bg-[#f0eded]" onClick={addStep}>
            <Plus size={18} />
            Add Another Step
          </button>
        </div>
      </section>

      <section className="space-y-1">
        <label className={labelClass}>Chef's Memo</label>
        <textarea className={inputClass} rows={3} value={form.memo} onChange={(event) => setField('memo', event.target.value)} placeholder="Add notes about this recipe..." />
      </section>

      {isImported ? (
        <section className="space-y-2 rounded-xl border border-[#e4e2e1] bg-white p-4 shadow-sm">
          <label className={labelClass}>Source URL</label>
          <input className={`${inputClass} bg-[#f6f3f2] text-[#564338]`} value={initialValue.source_url} readOnly />
          {initialValue.source_url ? (
            <a href={initialValue.source_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#ddc1b3] bg-white px-4 py-2 text-sm font-semibold text-[#1b1c1c]">
              <ExternalLink size={17} /> View Original Recipe
            </a>
          ) : null}
        </section>
      ) : null}

      {actionLayout === 'sticky' ? (
        <footer className="fixed bottom-0 left-0 z-50 flex w-full items-center gap-4 border-t border-[#ddc1b3] bg-white p-4">
          <div className="mx-auto flex w-full max-w-2xl gap-4">{actionButtons}</div>
        </footer>
      ) : (
        <Button type="button" className="w-full bg-[#974400] text-white" disabled={loading || !form.title.trim()} onClick={handleSubmit}>
          {loading ? 'Saving...' : submitLabel}
        </Button>
      )}
    </div>
  )
}
