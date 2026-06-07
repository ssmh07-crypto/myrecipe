import type { IngredientItem } from '../types/recipe'

const unitPattern = /(kg|g|ml|l|L|개|큰술|작은술|스푼|컵|장|쪽|대|알|봉|팩|줌|꼬집|약간)$/

export const parseIngredientText = (input: string): IngredientItem[] =>
  input
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const tokens = part.split(/\s+/)
      const quantity = tokens[tokens.length - 1] || ''
      const match = quantity.match(/^([\d./]+)\s*([^\d\s]+)?$/)
      if (match) {
        const unit = match[2] || ''
        return {
          name: tokens.slice(0, -1).join(' ') || part,
          amount: match[1],
          unit: unitPattern.test(unit) ? unit : unit,
        }
      }
      return { name: part, amount: '', unit: '' }
    })

export const formatIngredientItems = (items: IngredientItem[]) =>
  items
    .filter((item) => item.name.trim())
    .map((item) => [item.name, `${item.amount}${item.unit}`.trim()].filter(Boolean).join(' '))
    .join(', ')

export const cleanIngredientItems = (items: IngredientItem[]) =>
  items
    .map((item) => ({
      name: item.name.trim(),
      amount: item.amount.trim(),
      unit: item.unit.trim(),
    }))
    .filter((item) => item.name)

export const normalizeIngredientItems = (value: unknown): IngredientItem[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return parseIngredientText(item)[0] || { name: item, amount: '', unit: '' }
      if (item && typeof item === 'object') {
        const next = item as Partial<IngredientItem>
        return {
          name: String(next.name || ''),
          amount: String(next.amount || ''),
          unit: String(next.unit || ''),
        }
      }
      return { name: '', amount: '', unit: '' }
    })
    .filter((item) => item.name)
}
