// Cliente Supabase para AUTH apenas.
// Queries de dados (rest/v1) sao feitas via lib/db.ts com fetch direto,
// pra escapar do bug de lock/refresh que pendurava queries pos-signIn.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e/ou VITE_SUPABASE_PUBLISHABLE_KEY no .env.local',
  );
}

export const SUPABASE_URL = url;
export const SUPABASE_KEY = key;

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storage: window.localStorage,
    flowType: 'pkce',
  },
});

export const MEDIA_BUCKET = 'media';
