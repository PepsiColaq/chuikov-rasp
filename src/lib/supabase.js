import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || ''
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabaseConfigured = Boolean(url && anon && !url.includes('YOUR_'))

export const supabase = supabaseConfigured
  ? createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null

export function rpcErrorMessage(err) {
  if (!err) return 'Ошибка сети'
  const m = err.message || String(err)
  // PostgREST wraps raise exception
  const tip = m.replace(/^.*error:\s*/i, '').split('\n')[0]
  return tip || m
}
