const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  const { data: txs } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', 'dfa9b057-9187-4054-9ae6-9179c620666e')
    .order('created_at', { ascending: false })
    .limit(10);
  console.log('User transactions:', txs);
}

main();
