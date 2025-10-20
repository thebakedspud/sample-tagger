/// <reference types="vite/client" />
// @ts-check
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Supabase client will be a noop.'
  )
}

export const supabase = createClient(url ?? '', anonKey ?? '')
