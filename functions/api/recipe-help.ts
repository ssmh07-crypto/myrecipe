interface Env {
  OPENAI_API_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  VITE_SUPABASE_URL: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' } })
const error = (message: string, status = 400) => json({ error: { message } }, status)

const schema = {
  name: 'recipe_help',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      updated_recipe: { type: 'object', additionalProperties: true },
      shopping_list: { type: 'array', items: { type: 'string' } },
      notes: { type: 'array', items: { type: 'string' } },
    },
    required: ['summary', 'updated_recipe', 'shopping_list', 'notes'],
  },
}

const supabaseFetch = async (env: Env, path: string, init?: RequestInit) =>
  fetch(`${env.VITE_SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })

const getUserId = async (env: Env, token: string) => {
  const response = await fetch(`${env.VITE_SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_SERVICE_ROLE_KEY },
  })
  if (!response.ok) return ''
  const data = (await response.json()) as { id?: string }
  return data.id || ''
}

export const onRequest = async ({ request, env }: { request: Request; env: Env }) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (request.method !== 'POST') return error('POST 요청만 지원합니다.', 405)
  if (!env.OPENAI_API_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.VITE_SUPABASE_URL) return error('서버 환경변수가 설정되지 않았습니다.', 500)

  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '') || ''
    const userId = token ? await getUserId(env, token) : ''
    if (!userId) return error('로그인이 필요합니다.', 401)

    const body = (await request.json()) as { recipeId?: string; userRequest?: string }
    if (!body.recipeId || !body.userRequest || body.userRequest.length > 1000) return error('요청 내용을 확인해 주세요.')

    const recipeResponse = await supabaseFetch(env, `recipes?id=eq.${encodeURIComponent(body.recipeId)}&user_id=eq.${userId}&select=*`)
    const recipes = (await recipeResponse.json()) as unknown[]
    const recipe = recipes[0]
    if (!recipe) return error('레시피를 찾을 수 없습니다.', 404)

    const aiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [
          { role: 'system', content: 'You suggest recipe improvements in Korean. Do not directly mutate data; return a suggestion object only.' },
          { role: 'user', content: `레시피:\n${JSON.stringify(recipe)}\n\n사용자 요청: ${body.userRequest}` },
        ],
        text: { format: { type: 'json_schema', ...schema } },
      }),
    })
    if (!aiResponse.ok) return error('AI 제안 생성에 실패했습니다.', 502)
    const aiData = (await aiResponse.json()) as { output_text?: string }
    const suggestion = JSON.parse(aiData.output_text || '{}')

    await supabaseFetch(env, 'ai_suggestions', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, recipe_id: body.recipeId, request_text: body.userRequest, suggestion }),
    })

    return json(suggestion)
  } catch {
    return error('AI 도움 요청 처리에 실패했습니다.', 500)
  }
}
