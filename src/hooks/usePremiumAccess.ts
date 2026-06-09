import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import { hasSupabaseEnv, supabase } from '../lib/supabaseClient'

interface PremiumProfile {
  plan: string | null
  premium_expires_at: string | null
}

export const hasActivePremium = (profile: PremiumProfile | null) => {
  if (!profile || profile.plan !== 'premium') return false
  if (!profile.premium_expires_at) return true
  return new Date(profile.premium_expires_at).getTime() > Date.now()
}

export const usePremiumAccess = () => {
  const { user, loading: authLoading } = useAuth()
  const [hasImportAccess, setHasImportAccess] = useState(false)
  const [loading, setLoading] = useState(hasSupabaseEnv)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!hasSupabaseEnv || !user) {
      setHasImportAccess(false)
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    const { data, error: nextError } = await supabase
      .from('profiles')
      .select('plan, premium_expires_at')
      .eq('id', user.id)
      .maybeSingle()

    if (nextError) {
      setError(nextError.message)
      setHasImportAccess(false)
    } else {
      setHasImportAccess(hasActivePremium(data))
    }

    setLoading(false)
  }, [user])

  useEffect(() => {
    if (authLoading) return
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [authLoading, refresh])

  return { hasImportAccess, loading: authLoading || loading, error, refresh }
}
