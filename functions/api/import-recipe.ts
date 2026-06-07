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

const extractText = (html: string) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000)

const recipeSchema = {
  name: 'recipe_import',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      ingredients: { type: 'array', items: { type: 'string' } },
      seasonings: { type: 'array', items: { type: 'string' } },
      steps: { type: 'array', items: { type: 'string' } },
      cooking_time: { type: 'string' },
      servings: { type: 'number' },
      tips: { type: 'array', items: { type: 'string' } },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['title', 'description', 'ingredients', 'seasonings', 'steps', 'cooking_time', 'servings', 'tips', 'tags'],
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
            'You structure recipe content into a personal recipe note in Korean. Do not copy the source verbatim. If information is unknown, use empty strings, empty arrays, or 0.',
        },
        { role: 'user', content: `다음 웹문서 내용을 개인 레시피로 요약/구조화해줘:\n\n${text}` },
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
    const page = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'MyRecipeNoteBot/1.0' },
    })
    clearTimeout(timeout)

    if (!page.ok) return error('해당 페이지를 가져올 수 없습니다.', 502)
    const html = await page.text()
    const text = extractText(html)
    if (text.length < 100) return error('레시피로 정리할 본문을 찾지 못했습니다.')

    const recipe = await structureRecipe(env.OPENAI_API_KEY, text)
    return json({ ...recipe, source_url: url.toString() })
  } catch (nextError) {
    const message = nextError instanceof Error && nextError.name === 'AbortError' ? '외부 페이지 응답 시간이 초과되었습니다.' : '레시피 가져오기에 실패했습니다.'
    return error(message, 500)
  }
}
