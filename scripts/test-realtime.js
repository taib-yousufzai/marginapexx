const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = 'd:\\Desktop\\Daksh\\Sidharth\\marginapexx\\web\\.env.local';
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  const env = {};
  for (const line of lines) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    const parts = clean.split('=');
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/(^["']|["']$)/g, '');
    env[key] = val;
  }
  return env;
}

async function run() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    console.error("Missing credentials in env");
    return;
  }
  
  const sb = createClient(url, key);
  
  console.log("Checking publication status for market_quotes...");
  
  // We can run SQL using rpc or query if available, or fetch from postgrest.
  // Because service role client bypasses RLS, we can perform checks.
  // Let's check if we can execute the migration SQL.
  // In Supabase, executing arbitrary SQL is usually done in migrations or via the Dashboard SQL Editor.
  // Let's run a test query to verify if Supabase realtime subscription actually works or has any errors.
  
  const channel = sb.channel('test-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'market_quotes' }, (payload) => {
      console.log('Test received payload:', payload);
    })
    .subscribe((status) => {
      console.log('Subscription status:', status);
      setTimeout(() => {
        sb.removeChannel(channel);
        process.exit(0);
      }, 20000);
    });
}

run();
