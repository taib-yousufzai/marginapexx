import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials in env.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: orders, error: oError } = await supabase
    .from('orders')
    .select('*')
    .eq('symbol', 'NIFTY2660223500CE')
    .order('created_at', { ascending: false });

  if (oError) console.error("Orders Error:", oError);
  else console.log("Recent Orders:", JSON.stringify(orders, null, 2));

  const { data: positions, error: pError } = await supabase
    .from('positions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);

  if (pError) console.error("Positions Error:", pError);
  else console.log("Recent Positions:", JSON.stringify(positions, null, 2));
}

main();
