import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _client: SupabaseClient | null = null;

function createSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_URL');
  if (!key) throw new Error('Missing env var: NEXT_PUBLIC_SUPABASE_ANON_KEY');

  if (!_client) {
    _client = createClient(url, key, { auth: { persistSession: true } });
  }
  return _client;
}

export const supabase = createSupabaseClient();
