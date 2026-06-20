import { supabase } from './supabaseClient'

interface PremiumProfile {
  plan: string | null
  premium_expires_at: string | null
}

export const hasActivePremium = (profile: PremiumProfile | null) => {
  if (!profile || profile.plan !== 'premium') return false
  if (!profile.premium_expires_at) return true
  return new Date(profile.premium_expires_at).getTime() > Date.now()
}

export const getPremiumAccess = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('plan, premium_expires_at')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return hasActivePremium(data)
}
