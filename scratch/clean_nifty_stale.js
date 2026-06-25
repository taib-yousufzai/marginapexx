const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function cleanStale() {
  const { data, error } = await supabase
    .from('positions')
    .select('id, user_id, symbol, ltp')
    .eq('status', 'open')
    .eq('symbol', 'NIFTY22500CE');

  if (error) {
    console.error(error);
    return;
  }

  for (const pos of data) {
    console.log(`Found stale position: ${JSON.stringify(pos)}`);
    const ltp = Number(pos.ltp ?? 0);
    const { data: pnl, error: rpcErr } = await supabase.rpc('close_position', {
      p_position_id: pos.id,
      p_user_id: pos.user_id,
      p_ltp: ltp,
      p_exit_price: ltp,
      p_closed_by: 'EXPIRED_CLEANUP',
      p_brokerage: 0
    });
    if (rpcErr) console.error(rpcErr);
    else console.log(`Closed successfully: PnL = ₹${pnl}`);
  }
}
cleanStale();
