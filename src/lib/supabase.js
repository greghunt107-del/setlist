import { createClient } from '@supabase/supabase-js';

// Browser-safe: the publishable/anon key is meant to ship in the client bundle —
// Row-Level Security (enforced in supabase/migrations/0001_init.sql) is the real guard.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  // Loud in dev so a missing .env.local is obvious instead of a silent auth failure.
  console.error('[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check .env.local');
}

// Defaults keep the session in localStorage, auto-refresh the token, and parse the
// magic-link / OAuth redirect out of the URL on load (detectSessionInUrl).
export const supabase = createClient(url, key);

// Dev-only handle for console-driven testing/debugging. Stripped from prod builds.
if (import.meta.env.DEV) window.__sb = supabase;
