const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Simple parser for .env.local
function loadEnv() {
  const envPath = path.resolve(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error(`Env file not found at: ${envPath}`);
    process.exit(1);
  }
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.substring(0, idx).trim();
    const val = trimmed.substring(idx + 1).trim().replace(/^['"]|['"]$/g, ''); // strip optional quotes
    process.env[key] = val;
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function clearTable(tableName) {
  console.log(`Clearing table: ${tableName}...`);
  // Using a range/match filter that matches all rows
  let query = supabase.from(tableName).delete();
  
  query = query.neq('id', '00000000-0000-0000-0000-000000000000');

  const { data, error, count } = await query;

  if (error) {
    console.error(`- Error clearing ${tableName}:`, error.message);
  } else {
    console.log(`- Successfully cleared ${tableName}.`);
  }
}

async function main() {
  // Order of deletion to respect foreign key constraints
  const tablesToClear = [
    'notifications',
    'positions',
    'orders',
    'transactions',
    'watchlists',
    'act_logs',
    'dashboard_cache'
  ];

  for (const table of tablesToClear) {
    await clearTable(table);
  }

  // Reset profiles balance to 0
  console.log("Resetting profile balances to 0...");
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ balance: 0 })
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Matches all profiles

  if (profileError) {
    console.error("- Error resetting balances:", profileError.message);
  } else {
    console.log("- Successfully reset all user balances to 0.");
  }

  console.log("Database reset complete!");
}

main();
