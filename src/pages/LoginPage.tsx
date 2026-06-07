import { ChefHat } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { Button } from '../components/ui/Button'
import { ErrorState } from '../components/ui/State'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'

export const LoginPage = () => {
  const { user, isConfigured } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const from = (location.state as { from?: string } | null)?.from || '/recipes'

  if (user) return <Navigate to={from} replace />

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setNotice('')

    if (!isConfigured) {
      setError('Supabase 환경변수 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 설정해야 로그인할 수 있습니다.')
      return
    }

    setLoading(true)
    const result =
      mode === 'login'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setLoading(false)

    if (result.error) {
      setError(result.error.message)
      return
    }
    if (mode === 'signup' && result.data.session) {
      navigate('/recipes', { replace: true })
      return
    }
    if (mode === 'signup') setNotice('가입 요청이 완료되었습니다. 이메일 확인 후 로그인할 수 있습니다.')
  }

  return (
    <AppLayout requireAuth={false}>
      <section className="space-y-5">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <div className="grid h-14 w-14 place-items-center rounded-xl bg-amber-700 text-white">
            <ChefHat size={28} />
          </div>
          <h1 className="mt-4 text-2xl font-bold text-stone-950">인터넷 레시피를 내 입맛에 맞게</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            My Recipe Note는 직접 쓴 레시피, 웹 URL, 유튜브 설명과 자막을 AI가 나만의 조리 노트로 정리해주는 모바일 레시피북입니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-amber-100 bg-white p-5">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-amber-50 p-1">
            <button type="button" onClick={() => setMode('login')} className={`rounded-md py-2 text-sm font-semibold ${mode === 'login' ? 'bg-white text-amber-900 shadow-sm' : 'text-stone-500'}`}>
              로그인
            </button>
            <button type="button" onClick={() => setMode('signup')} className={`rounded-md py-2 text-sm font-semibold ${mode === 'signup' ? 'bg-white text-amber-900 shadow-sm' : 'text-stone-500'}`}>
              회원가입
            </button>
          </div>
          <input className="w-full rounded-lg border border-amber-100 px-3 py-3 text-sm outline-none focus:border-amber-500" type="email" required placeholder="이메일" value={email} onChange={(event) => setEmail(event.target.value)} />
          <input className="w-full rounded-lg border border-amber-100 px-3 py-3 text-sm outline-none focus:border-amber-500" type="password" required minLength={6} placeholder="비밀번호" value={password} onChange={(event) => setPassword(event.target.value)} />
          {error ? <ErrorState message={error} /> : null}
          {notice ? <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}
          <Button className="w-full" disabled={loading}>{mode === 'login' ? '로그인' : '회원가입'}</Button>
        </form>
      </section>
    </AppLayout>
  )
}
