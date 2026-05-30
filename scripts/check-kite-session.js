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
  const masterId = env.ZERODHA_SUPABASE_USER_ID;
  
  if (!url || !key) {
    console.error("Missing credentials in env");
    return;
  }
  
  console.log("Supabase URL:", url);
  console.log("Master Zerodha User ID (env):", masterId);
  
  const sb = createClient(url, key);
  
  const { data, error } = await sb
    .from('kite_sessions')
    .select('*');
    
  if (error) {
    console.error("Error fetching sessions:", error);
    return;
  }
  
  console.log("Found sessions:", data.length);
  for (const row of data) {
    console.log(`- User ID: ${row.user_id}`);
    console.log(`  Kite User ID: ${row.kite_user_id}`);
    console.log(`  Expires At: ${row.expires_at}`);
    console.log(`  Current Time: ${new Date().toISOString()}`);
    console.log(`  Expired? ${new Date(row.expires_at) <= new Date()}`);
  }
}

run();
