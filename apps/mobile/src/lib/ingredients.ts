import type { IngredientItem } from '../types/recipe'

const maxIngredientItems = 100
const maxNameLength = 200
const maxValueLength = 50

const clean = (value: unknown, maxLength: number) => String(value || '').trim().slice(0, maxLength)

export const parseIngredientText = (input: string): IngredientItem[] =>
  input
    .slice(0, 20_000)
    .split(/[,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, maxIngredientItems)
    .map((part) => {
      const match = part.match(/^(.*?)\s*(\d+(?:[./~-]\d+)?)\s*([^\d\s].*)?$/)
      if (match) {
        return {
          name: clean(match[1].trim() || part, maxNameLength),
          amount: clean(match[2], maxValueLength),
          unit: clean(match[3], maxValueLength),
        }
      }
      return { name: clean(part, maxNameLength), amount: '', unit: '' }
    })

export const formatIngredientItems = (items: IngredientItem[]) =>
  items
    .filter((item) => item.name.trim())
    .map((item) => [item.name, `${item.amount}${item.unit}`.trim()].filter(Boolean).join(' '))
    .join(', ')

export const normalizeIngredientItems = (value: unknown): IngredientItem[] => {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, maxIngredientItems)
    .map((item) => {
      if (typeof item === 'string') return parseIngredientText(item)[0] || { name: item, amount: '', unit: '' }
      if (item && typeof item === 'object') {
        const next = item as Partial<IngredientItem>
        return {
          name: clean(next.name, maxNameLength),
          amount: clean(next.amount, maxValueLength),
          unit: clean(next.unit, maxValueLength),
        }
      }
      return { name: '', amount: '', unit: '' }
    })
    .filter((item) => item.name)
}
