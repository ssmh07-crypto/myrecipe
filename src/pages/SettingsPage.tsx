import { LogOut } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabaseClient'

export const SettingsPage = () => {
  const { user } = useAuth()

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold text-stone-950">설정</h1>
      <div className="rounded-xl border border-amber-100 bg-white p-4">
        <p className="text-sm text-stone-500">로그인 계정</p>
        <p className="mt-1 font-semibold text-stone-950">{user?.email}</p>
      </div>
      <Button variant="secondary" className="w-full" onClick={() => supabase.auth.signOut()}>
        <LogOut size={18} /> 로그아웃
      </Button>
    </section>
  )
}
