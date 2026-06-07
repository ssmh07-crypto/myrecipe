import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { hasSupabaseEnv, supabase } from '../lib/supabaseClient'

export const useAuth = () => {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(hasSupabaseEnv)

  useEffect(() => {
    if (!hasSupabaseEnv) {
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setUser(data.session?.user ?? null)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setUser(nextSession?.user ?? null)
    })

    return () => data.subscription.unsubscribe()
  }, [])

  return { session, user, loading, isConfigured: hasSupabaseEnv }
}
