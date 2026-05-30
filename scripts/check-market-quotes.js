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
    const key = clean.slice(0, idx).trim();
    const val = clean.slice(idx + 1).trim().replace(/(^["']|["']$)/g, '');
    env[key] = val;
  }
  return env;
}

async function run() {
  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // 1. Check if market_quotes has any recent rows
  const { data: rows, error } = await sb
    .from('market_quotes')
    .select('id, last_price, updated_at')
    .order('updated_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('❌ Error reading market_quotes:', error.message);
    return;
  }

  if (!rows || rows.length === 0) {
    console.log('❌ market_quotes table is EMPTY — ticker daemon is not writing to DB');
    console.log('   → Check Railway logs for upsert errors in ticker-db-writer');
  } else {
    console.log(`✅ market_quotes has ${rows.length} recent rows:`);
    for (const r of rows) {
      const age = Math.round((Date.now() - new Date(r.updated_at).getTime()) / 1000);
      console.log(`   ${r.id}: ₹${r.last_price} (updated ${age}s ago)`);
    }
  }

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
