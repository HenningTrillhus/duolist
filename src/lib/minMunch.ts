import { createClient } from '@supabase/supabase-js'

// Read-only connection to the separate Min Munch recipe book (its own
// Supabase project), used to link recipes into dinner plans.
const url = import.meta.env.VITE_MINMUNCH_SUPABASE_URL
const anonKey = import.meta.env.VITE_MINMUNCH_SUPABASE_ANON_KEY

export const minMunch = createClient(url, anonKey)
