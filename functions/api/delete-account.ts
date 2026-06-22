interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  RECIPE_IMAGES: {
    list(options: { prefix: string; cursor?: string }): Promise<{ objects: Array<{ key: string }>; truncated: boolean; cursor?: string }>
    delete(keys: string[]): Promise<void>
  }
}

const headers = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers })

const fetchWithTimeout = async (input: string, init: RequestInit) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const getBearerToken = (request: Request) => {
  const match = (request.headers.get('Authorization') || '').match(/^Bearer\s+([^\s]{20,4096})$/i)
  return match?.[1] || ''
}

const getUserId = async (env: Env, token: string) => {
  if (!token) return null
  const response = await fetchWithTimeout(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  const user = await response.json() as { id?: string }
  return user.id || null
}

const getImagePaths = async (env: Env, userId: string) => {
  const response = await fetchWithTimeout(
    `${env.SUPABASE_URL}/rest/v1/recipes?user_id=eq.${encodeURIComponent(userId)}&select=image_path,step_image_paths`,
    { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } },
  )
  if (!response.ok) throw new Error('image_lookup_failed')
  const recipes = await response.json() as Array<{ image_path?: string | null; step_image_paths?: unknown }>
  return [...new Set(recipes.flatMap((recipe) => [
    recipe.image_path,
    ...(Array.isArray(recipe.step_image_paths) ? recipe.step_image_paths : []),
  ]).filter((path): path is string => typeof path === 'string' && !path.startsWith('r2:') && path.startsWith(`${userId}/`)))]
}

const deleteImages = async (env: Env, paths: string[]) => {
  if (!paths.length) return
  const response = await fetchWithTimeout(`${env.SUPABASE_URL}/storage/v1/object/recipe-images`, {
    method: 'DELETE',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prefixes: paths }),
  })
  if (!response.ok) throw new Error('image_delete_failed')
}

const deleteR2Images = async (env: Env, userId: string) => {
  let cursor: string | undefined
  do {
    const result = await env.RECIPE_IMAGES.list({ prefix: `${userId}/`, ...(cursor ? { cursor } : {}) })
    const keys = result.objects.map((object) => object.key)
    if (keys.length) await env.RECIPE_IMAGES.delete(keys)
    cursor = result.truncated ? result.cursor : undefined
  } while (cursor)
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'DELETE, OPTIONS' } })
  if (request.method !== 'DELETE') return new Response(JSON.stringify({ error: { message: 'DELETE 요청만 지원합니다.' } }), { status: 405, headers: { ...headers, Allow: 'DELETE, OPTIONS' } })
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.RECIPE_IMAGES) return json({ error: { message: '서버 설정이 완료되지 않았습니다.' } }, 500)

  try {
    const userId = await getUserId(env, getBearerToken(request))
    if (!userId) return json({ error: { message: '로그인이 필요합니다.' } }, 401)

    await Promise.all([deleteImages(env, await getImagePaths(env, userId)), deleteR2Images(env, userId)])
    const response = await fetchWithTimeout(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    })
    if (!response.ok) throw new Error('user_delete_failed')
    return json({ deleted: true })
  } catch {
    return json({ error: { message: '계정을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.' } }, 502)
  }
}
