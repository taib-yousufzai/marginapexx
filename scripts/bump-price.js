const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envPath = '.env.local';
const lines = fs.readFileSync(envPath, 'utf8').split('\n');
const env = {};
for (const line of lines) {
  const clean = line.trim();
  if (!clean || clean.startsWith('#')) continue;
  const parts = clean.split('=');
  const key = parts[0].trim();
  env[key] = parts.slice(1).join('=').trim().replace(/(^["']|["']$)/g, '');
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function bump() {
  const { data } = await sb.from('market_quotes').select('*').eq('id', 'NSE:NIFTY 50').single();
  if (data) {
    const newPrice = data.last_price + 10;
    console.log('Bumping NSE:NIFTY 50 to', newPrice);
    await sb.from('market_quotes').update({ last_price: newPrice, updated_at: new Date().toISOString() }).eq('id', 'NSE:NIFTY 50');
  }
}
bump();
