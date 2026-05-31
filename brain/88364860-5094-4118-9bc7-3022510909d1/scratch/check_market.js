const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const envPath = 'c:\\Users\\Taib\\Desktop\\Personal\\marginapexx\\.env.local';
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
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

  const { count: mqCount } = await sb.from('market_quotes').select('*', { count: 'exact', head: true });
  const { count: instCount } = await sb.from('instruments').select('*', { count: 'exact', head: true });
  const { count: posCount } = await sb.from('positions').select('*', { count: 'exact', head: true });

  console.log(`market_quotes count: ${mqCount}`);
  console.log(`instruments count: ${instCount}`);
  console.log(`positions count: ${posCount}`);
  
  if (mqCount === 0 || instCount === 0) {
    console.log("No market data or instruments in the database.");
  }
}

run().catch(console.error);
