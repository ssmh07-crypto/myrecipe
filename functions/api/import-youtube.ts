interface Env {
  OPENAI_API_KEY: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } })
const error = (message: string, status = 400) => json({ error: { message } }, status)

const extractVideoId = (value: string) => {
  const url = new URL(value)
  if (url.hostname.includes('youtu.be')) return url.pathname.slice(1)
  if (url.hostname.includes('youtube.com')) return url.searchParams.get('v') || url.pathname.split('/').filter(Boolean).pop() || ''
  return ''
}

const schema = {
  name: 'youtube_recipe_import',
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

const getOembedText = async (url: string) => {
  const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`)
  if (!response.ok) return ''
  const data = (await response.json()) as { title?: string; author_name?: string }
  return [data.title, data.author_name].filter(Boolean).join('\n')
}

const structureRecipe = async (apiKey: string, text: string) => {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      input: [
        { role: 'system', content: 'You convert video descriptions or pasted captions into a Korean personal recipe note. Do not invent unknown details.' },
        { role: 'user', content: `다음 유튜브 제목/설명/자막 텍스트를 레시피로 구조화해줘:\n\n${text.slice(0, 12000)}` },
      ],
      text: { format: { type: 'json_schema', ...schema } },
    }),
  })
  if (!response.ok) throw new Error('AI 변환에 실패했습니다.')
  const data = (await response.json()) as { output_text?: string }
  return JSON.parse(data.output_text || '{}')
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (request.method !== 'POST') return error('POST 요청만 지원합니다.', 405)
  if (!env.OPENAI_API_KEY) return error('서버 OpenAI API Key가 설정되지 않았습니다.', 500)

  try {
    const body = (await request.json()) as { youtubeUrl?: string; transcriptText?: string }
    if (!body.youtubeUrl || body.youtubeUrl.length > 2000) return error('유튜브 URL을 입력해 주세요.')
    const videoId = extractVideoId(body.youtubeUrl)
    if (!videoId) return error('유효한 유튜브 링크가 아닙니다.')

    const sourceText = [await getOembedText(body.youtubeUrl), body.transcriptText || ''].filter(Boolean).join('\n\n').trim()
    if (sourceText.length < 80) {
      return json({
        needs_manual_text: true,
        message: '이 영상에서는 자막을 가져올 수 없습니다. 영상 설명이나 자막 텍스트를 직접 붙여넣어 주세요.',
        youtube_video_id: videoId,
        source_url: body.youtubeUrl,
      })
    }

    const recipe = await structureRecipe(env.OPENAI_API_KEY, sourceText)
    return json({ ...recipe, source_url: body.youtubeUrl, youtube_video_id: videoId })
  } catch {
    return error('유튜브 레시피 변환에 실패했습니다.', 500)
  }
}
