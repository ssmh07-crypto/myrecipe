interface R2ObjectBody {
  body: ReadableStream<Uint8Array>
  httpMetadata?: { contentType?: string }
}

interface R2BucketBinding {
  put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
  get(key: string): Promise<R2ObjectBody | null>
  delete(keys: string | string[]): Promise<void>
}

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  R2_SIGNING_SECRET: string
  RECIPE_IMAGES: R2BucketBinding
}

const maxImageBytes = 10 * 1024 * 1024
const signedUrlLifetimeSeconds = 15 * 60
const allowedTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/heic', 'heic'],
  ['image/heif', 'heif'],
])

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Content-Type': 'application/json; charset=utf-8',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: jsonHeaders })
const error = (message: string, status = 400) => json({ error: { message } }, status)

const getBearerToken = (request: Request) =>
  (request.headers.get('Authorization') || '').match(/^Bearer\s+([^\s]{20,4096})$/i)?.[1] || ''

const getUserId = async (env: Env, request: Request) => {
  const token = getBearerToken(request)
  if (!token) return null
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!response?.ok) return null
  return ((await response.json()) as { id?: string }).id || null
}

const consumeQuota = async (
  env: Env,
  userId: string,
  action: 'image_sign' | 'image_upload' | 'image_delete',
  windowSeconds: number,
  limit: number,
) => {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/consume_api_quota`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_user_id: userId,
      p_action: action,
      p_window_seconds: windowSeconds,
      p_limit: limit,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!response?.ok) return 'error'
  return await response.json().catch(() => 'error') as string
}

const quotaError = (result: string, message: string) =>
  result === 'limit' ? error(message, 429) : error('이미지 요청 한도를 확인하지 못했습니다.', 503)

const encodeBase64Url = (bytes: ArrayBuffer) => {
  const value = String.fromCharCode(...new Uint8Array(bytes))
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

const sign = async (secret: string, path: string, expires: number) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return encodeBase64Url(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${path}\n${expires}`)))
}

const signaturesMatch = (left: string, right: string) => {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  return difference === 0
}

const createSignedUrl = async (request: Request, env: Env, path: string) => {
  const expires = Math.floor(Date.now() / 1_000) + signedUrlLifetimeSeconds
  const signature = await sign(env.R2_SIGNING_SECRET, path, expires)
  const url = new URL('/api/images', request.url)
  url.searchParams.set('path', path)
  url.searchParams.set('expires', String(expires))
  url.searchParams.set('signature', signature)
  return url.toString()
}

const createSignedUrls = async (request: Request, env: Env, userId: string) => {
  const body = await request.json().catch(() => null) as { paths?: unknown } | null
  const paths = Array.isArray(body?.paths)
    ? [...new Set(body.paths.filter((path): path is string => typeof path === 'string'))]
    : []
  if (!paths.length || paths.length > 100 || paths.some((path) => !isOwnedPath(path, userId))) {
    return error('유효하지 않은 이미지 경로입니다.')
  }
  const urls = await Promise.all(paths.map(async (path) => [path, await createSignedUrl(request, env, path)] as const))
  return json({ urls: Object.fromEntries(urls) })
}

const isOwnedPath = (path: string, userId: string) =>
  path.startsWith(`${userId}/`) && path.length <= 1_000 && !path.includes('..') && !path.includes('\\')

const hasValidImageSignature = (bytes: ArrayBuffer, contentType: string) => {
  const view = new Uint8Array(bytes.slice(0, 16))
  if (contentType === 'image/jpeg') return view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff
  if (contentType === 'image/png') return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => view[index] === value)
  if (contentType === 'image/webp') {
    return String.fromCharCode(...view.slice(0, 4)) === 'RIFF' && String.fromCharCode(...view.slice(8, 12)) === 'WEBP'
  }
  if (contentType === 'image/heic' || contentType === 'image/heif') {
    const box = String.fromCharCode(...view.slice(4, 12))
    return box.startsWith('ftyp') && ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(box.slice(4, 8))
  }
  return false
}

const serveSignedImage = async (request: Request, env: Env, url: URL, path: string) => {
  if (!path || path.length > 1_000 || path.includes('..') || path.includes('\\')) return error('유효하지 않은 이미지 주소입니다.', 401)
  const expires = Number(url.searchParams.get('expires') || 0)
  const signature = url.searchParams.get('signature') || ''
  if (!Number.isInteger(expires) || expires <= Math.floor(Date.now() / 1_000)) return error('이미지 주소가 만료되었습니다.', 401)
  if (expires > Math.floor(Date.now() / 1_000) + signedUrlLifetimeSeconds + 60) return error('유효하지 않은 이미지 주소입니다.', 401)
  const expected = await sign(env.R2_SIGNING_SECRET, path, expires)
  if (!signaturesMatch(signature, expected)) return error('유효하지 않은 이미지 주소입니다.', 401)

  const object = await env.RECIPE_IMAGES.get(path)
  if (!object) return error('이미지를 찾을 수 없습니다.', 404)
  return new Response(object.body, {
    headers: {
      'Cache-Control': `private, max-age=${Math.max(0, expires - Math.floor(Date.now() / 1_000))}`,
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

const uploadImage = async (request: Request, env: Env, userId: string) => {
  const contentType = (request.headers.get('Content-Type') || '').toLowerCase().split(';')[0]
  const extension = allowedTypes.get(contentType)
  if (!extension) return error('JPEG, PNG, WebP, HEIC 이미지만 업로드할 수 있습니다.', 415)
  const contentLength = Number(request.headers.get('Content-Length') || 0)
  if (contentLength > maxImageBytes) return error('이미지는 10MB 이하만 업로드할 수 있습니다.', 413)

  const resourceId = request.headers.get('X-Resource-Id') || ''
  const imageFolder = request.headers.get('X-Image-Folder') || ''
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(resourceId) || !/^(cover|steps\/[1-9][0-9]?)$/.test(imageFolder)) {
    return error('유효하지 않은 이미지 경로입니다.')
  }

  const bytes = await request.arrayBuffer()
  if (!bytes.byteLength || bytes.byteLength > maxImageBytes) return error('이미지는 10MB 이하만 업로드할 수 있습니다.', 413)
  if (!hasValidImageSignature(bytes, contentType)) return error('이미지 파일 형식이 올바르지 않습니다.', 415)
  const path = `${userId}/${resourceId}/${imageFolder}/${crypto.randomUUID()}.${extension}`
  await env.RECIPE_IMAGES.put(path, bytes, { httpMetadata: { contentType } })
  return json({ path, url: await createSignedUrl(request, env, path) }, 201)
}

const deleteImages = async (request: Request, env: Env, userId: string) => {
  const body = await request.json().catch(() => null) as { paths?: unknown } | null
  const paths = Array.isArray(body?.paths) ? [...new Set(body.paths.filter((path): path is string => typeof path === 'string'))] : []
  if (paths.length > 100 || paths.some((path) => !isOwnedPath(path, userId))) return error('유효하지 않은 이미지 경로입니다.')
  if (paths.length) await env.RECIPE_IMAGES.delete(paths)
  return json({ deleted: paths.length })
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { Allow: 'GET, POST, DELETE, OPTIONS' } })
  if (!env.RECIPE_IMAGES || !env.R2_SIGNING_SECRET || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return error('이미지 서버 설정이 완료되지 않았습니다.', 500)
  }

  try {
    const url = new URL(request.url)
    const path = url.searchParams.get('path') || ''
    if (request.method === 'GET' && url.searchParams.has('signature')) return serveSignedImage(request, env, url, path)

    const userId = await getUserId(env, request)
    if (!userId) return error('로그인이 필요합니다.', 401)
    if (request.method === 'POST') {
      const contentType = request.headers.get('Content-Type') || ''
      const quotaResult = contentType.toLowerCase().includes('application/json')
        ? await consumeQuota(env, userId, 'image_sign', 3_600, 500)
        : await consumeQuota(env, userId, 'image_upload', 86_400, 50)
      if (quotaResult !== 'ok') return quotaError(quotaResult, '이미지 요청 한도에 도달했습니다.')
      return contentType.toLowerCase().includes('application/json')
        ? createSignedUrls(request, env, userId)
        : uploadImage(request, env, userId)
    }
    if (request.method === 'DELETE') {
      const quotaResult = await consumeQuota(env, userId, 'image_delete', 86_400, 100)
      if (quotaResult !== 'ok') return quotaError(quotaResult, '이미지 삭제 요청 한도에 도달했습니다.')
      return deleteImages(request, env, userId)
    }
    if (request.method === 'GET') {
      const quotaResult = await consumeQuota(env, userId, 'image_sign', 3_600, 500)
      if (quotaResult !== 'ok') return quotaError(quotaResult, '이미지 주소 요청 한도에 도달했습니다.')
      if (!isOwnedPath(path, userId)) return error('유효하지 않은 이미지 경로입니다.')
      return json({ url: await createSignedUrl(request, env, path) })
    }
    return new Response(null, { status: 405, headers: { ...jsonHeaders, Allow: 'GET, POST, DELETE, OPTIONS' } })
  } catch {
    return error('이미지 요청을 처리하지 못했습니다.', 502)
  }
}
