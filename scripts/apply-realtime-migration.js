/**
 * Applies the realtime migration directly using Supabase admin REST API.
 * Checks pg_publication_tables and enables realtime on market_quotes.
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

function loadEnv() {
  const lines = fs.readFileSync('d:\\Desktop\\Daksh\\Sidharth\\marginapexx\\web\\.env.local', 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    const idx = clean.indexOf('=');
    if (idx < 0) continue;
    env[clean.slice(0, idx).trim()] = clean.slice(idx + 1).trim().replace(/(^["']|["']$)/g, '');
  }
  return env;
}

async function run() {
  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Check if market_quotes is in the realtime publication via rpc
  const { data, error } = await sb.rpc('check_realtime_enabled');

  if (error) {
    // RPC doesn't exist — check via REST
    console.log('');
    console.log('=== ACTION REQUIRED: Apply Realtime Migration ===');
    console.log('');
    console.log('Open your Supabase Dashboard → SQL Editor and run:');
    console.log('');
    console.log('ALTER TABLE public.market_quotes REPLICA IDENTITY FULL;');
    console.log('');
    console.log('DO $$');
    console.log('BEGIN');
    console.log("  IF NOT EXISTS (");
    console.log("    SELECT 1 FROM pg_publication_tables");
    console.log("    WHERE pubname = 'supabase_realtime'");
    console.log("    AND schemaname = 'public'");
    console.log("    AND tablename = 'market_quotes'");
    console.log("  ) THEN");
    console.log("    ALTER PUBLICATION supabase_realtime ADD TABLE public.market_quotes;");
    console.log("  END IF;");
    console.log('END $$;');
    console.log('');
    console.log('This enables tick-by-tick Supabase Realtime updates in the browser.');
  } else {
    console.log('Realtime check result:', data);
  }

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
