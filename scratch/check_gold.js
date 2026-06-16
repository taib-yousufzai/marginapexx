const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', 'dfa9b057-9187-4054-9ae6-9179c620666e')
    .eq('symbol', 'GOLD_FUT')
    .order('created_at', { ascending: false });
  console.log('GOLD_FUT orders:', orders);

  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', 'dfa9b057-9187-4054-9ae6-9179c620666e')
    .eq('symbol', 'GOLD_FUT');
  console.log('GOLD_FUT positions:', positions);
}

main();
