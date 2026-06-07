import type { RecipeInput } from '../types/recipe'

type ApiError = { error?: { message?: string } }

const postJson = async <T>(path: string, body: unknown, accessToken?: string): Promise<T> => {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  })

  const data = (await response.json().catch(() => ({}))) as T & ApiError
  if (!response.ok) {
    throw new Error(data.error?.message || '요청 처리 중 문제가 발생했습니다.')
  }
  return data
}

export const importRecipeFromUrl = (url: string) =>
  postJson<Partial<RecipeInput> & { source_url: string }>('/api/import-recipe', { url })
