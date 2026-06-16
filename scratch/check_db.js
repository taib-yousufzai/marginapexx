const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function main() {
  const { data: positions, error: pErr } = await supabase
    .from('positions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (pErr) console.error('Positions error:', pErr);
  else console.log('Latest Positions:', JSON.stringify(positions, null, 2));

  const { data: orders, error: oErr } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (oErr) console.error('Orders error:', oErr);
  else console.log('Latest Orders:', JSON.stringify(orders, null, 2));
}

main().catch(console.error);
