import type { RecipeInput } from '../types/recipe'

type ApiError = { error?: { message?: string } }

const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://myrecipe-1im.pages.dev'
const requestTimeoutMs = 30_000

const requestJson = async <T>(path: string, method: 'POST' | 'DELETE', body: unknown, accessToken?: string): Promise<T> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.')
    throw new Error('서버에 연결하지 못했습니다. 네트워크 연결을 확인해주세요.')
  } finally {
    clearTimeout(timeout)
  }

  const data = (await response.json().catch(() => ({}))) as T & ApiError
  if (!response.ok) {
    throw new Error(data.error?.message || '요청 처리 중 문제가 발생했습니다.')
  }
  return data
}

export const importRecipeFromUrl = (url: string, accessToken?: string) =>
  requestJson<Partial<RecipeInput> & { source_url: string }>('/api/import-recipe', 'POST', { url }, accessToken)

export const deleteAccount = (accessToken: string) =>
  requestJson<{ deleted: true }>('/api/delete-account', 'DELETE', undefined, accessToken)
