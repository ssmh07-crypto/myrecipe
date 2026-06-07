interface Env {
  OPENAI_API_KEY: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })

const error = (message: string, status = 400) => json({ error: { message } }, status)

const sanitizeText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000)

const getMetaContent = (html: string, property: string) => {
  const pattern = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i')
  return html.match(pattern)?.[1] || ''
}

const getOembedText = async (url: URL) => {
  const target = url.toString()
  const providers = url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')
    ? [`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(target)}`]
    : []

  for (const provider of providers) {
    const response = await fetch(provider).catch(() => null)
    if (!response?.ok) continue
    const data = (await response.json()) as { title?: string; author_name?: string }
    return [data.title, data.author_name].filter(Boolean).join('\n')
  }
  return ''
}

const recipeSchema = {
  name: 'recipe_import',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      servings: { type: 'number' },
      difficulty: { type: 'string', enum: ['쉬움', '보통', '어려움'] },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            amount: { type: 'string' },
            unit: { type: 'string' },
          },
          required: ['name', 'amount', 'unit'],
        },
      },
      seasonings: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string' },
            amount: { type: 'string' },
            unit: { type: 'string' },
          },
          required: ['name', 'amount', 'unit'],
        },
      },
      steps_text: { type: 'string' },
      step_images: { type: 'array', items: { type: 'string' } },
      memo: { type: 'string' },
    },
    required: ['title', 'servings', 'difficulty', 'ingredients', 'seasonings', 'steps_text', 'step_images', 'memo'],
  },
}

const structureRecipe = async (apiKey: string, text: string) => {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'You create a concise Korean recipe draft from URL text. Do not copy the source verbatim. Return only fields in schema. If information is unknown, use empty strings, empty arrays, or 0.',
        },
        { role: 'user', content: `다음 URL 텍스트를 모바일 레시피 노트 초안으로 구조화해줘:\n\n${text}` },
      ],
      text: { format: { type: 'json_schema', ...recipeSchema } },
    }),
  })

  if (!response.ok) throw new Error('AI가 레시피를 정리하지 못했습니다.')
  const data = (await response.json()) as { output_text?: string }
  return JSON.parse(data.output_text || '{}')
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (request.method !== 'POST') return error('POST 요청만 지원합니다.', 405)
  if (!env.OPENAI_API_KEY) return error('서버 OpenAI API Key가 설정되지 않았습니다.', 500)

  try {
    const body = (await request.json()) as { url?: string }
    if (!body.url || body.url.length > 2000) return error('유효한 URL을 입력해 주세요.')
    const url = new URL(body.url)
    if (!['http:', 'https:'].includes(url.protocol)) return error('http 또는 https URL만 사용할 수 있습니다.')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'MyRecipeNoteBot/1.0' },
    })
    clearTimeout(timeout)

    if (!response.ok) return error('해당 링크를 가져올 수 없습니다.', 502)
    const html = await response.text()
    const oembedText = await getOembedText(url)
    const metaText = [getMetaContent(html, 'og:title'), getMetaContent(html, 'og:description'), getMetaContent(html, 'description')].filter(Boolean).join('\n')
    const pageText = sanitizeText(html)
    const text = [oembedText, metaText, pageText].filter(Boolean).join('\n\n').slice(0, 12000)

    if (text.length < 40) return error('레시피로 정리할 텍스트를 찾지 못했습니다.')

    const recipe = await structureRecipe(env.OPENAI_API_KEY, text)
    return json({ ...recipe, source_url: url.toString(), source_type: 'imported' })
  } catch (nextError) {
    const message = nextError instanceof Error && nextError.name === 'AbortError' ? '외부 링크 응답 시간이 초과되었습니다.' : '레시피 가져오기에 실패했습니다.'
    return error(message, 500)
  }
}
