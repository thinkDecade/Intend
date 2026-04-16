import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Server-side Supabase client (service role key — never exposed to browser)
let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;

  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!url || !key) {
    throw new Error(
      '[supabase] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
    );
  }

  _supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _supabase;
}
