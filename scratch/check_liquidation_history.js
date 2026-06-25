const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLiquidationHistory() {
  const userIds = [
    '1e42e0ce-ea16-4735-9ee1-580ccb793536', // Siddharth
    'ad75e8f2-57a9-4b40-8f9d-dcee10ce4ca9'  // Adki sandyarani
  ];

  const { data, error } = await supabase
    .from('positions')
    .select('id, user_id, symbol, status, exit_price, exit_time, pnl')
    .in('user_id', userIds)
    .order('exit_time', { ascending: false })
    .limit(10);

  if (error) {
    console.error(error);
    return;
  }

  for (const pos of data) {
    console.log(`Position: ${pos.symbol} | User: ${pos.user_id} | Status: ${pos.status} | PnL: ₹${pos.pnl} | Exit Time: ${pos.exit_time}`);
  }
}

checkLiquidationHistory();
