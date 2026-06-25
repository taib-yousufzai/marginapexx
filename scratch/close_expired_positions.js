const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function closeExpiredPositions() {
  console.log("=== STARTING EXPIRED POSITIONS CLEANUP ===\n");

  const { data: positions, error: pError } = await supabase
    .from('positions')
    .select('id, user_id, symbol, status, qty_open, entry_price, ltp')
    .eq('status', 'open');

  if (pError) {
    console.error("Error fetching open positions:", pError);
    return;
  }

  const today = new Date().toISOString().split('T')[0];
  console.log(`Current Date: ${today}`);
  console.log(`Total Open Positions: ${positions.length}\n`);

  let closedCount = 0;

  for (const pos of positions) {
    // We search the instruments table to check the expiry of the symbol
    const { data: inst, error: iError } = await supabase
      .from('instruments')
      .select('expiry')
      .eq('tradingsymbol', pos.symbol)
      .limit(1); // using limit instead of single/maybeSingle to avoid multiple row errors for futures

    if (iError) {
      console.error(`Error querying instrument for ${pos.symbol}:`, iError);
      continue;
    }

    if (!inst || inst.length === 0) {
      // If the symbol is not in instruments table, let's parse the symbol name
      // e.g. "NIFTY22500CE" might be old. Let's see if we want to skip it or handle it.
      console.log(`Symbol ${pos.symbol} not found in instruments table.`);
      continue;
    }

    const expiry = inst[0].expiry;
    if (!expiry) {
      continue;
    }

    if (expiry < today) {
      console.log(`[Expired] Position ${pos.symbol} (ID: ${pos.id}, User: ${pos.user_id}) expired on ${expiry}.`);
      
      const ltp = Number(pos.ltp ?? pos.entry_price ?? 0);
      
      // Close at LTP since it has expired (or 0 for expired out-of-the-money options,
      // but closing at the stored LTP is standard fallback for systems to prevent balance drift).
      console.log(`Closing position via RPC close_position at LTP: ₹${ltp}...`);
      
      const { data: pnl, error: rpcErr } = await supabase.rpc('close_position', {
        p_position_id: pos.id,
        p_user_id: pos.user_id,
        p_ltp: ltp,
        p_exit_price: ltp,
        p_closed_by: 'EXPIRED_CLEANUP',
        p_brokerage: 0
      });

      if (rpcErr) {
        console.error(`Failed to close position ${pos.id} via RPC:`, rpcErr.message);
      } else {
        console.log(`Successfully closed position. Realized PnL: ₹${Number(pnl || 0).toFixed(2)}`);
        closedCount++;
      }
    }
  }

  console.log(`\n=== CLEANUP COMPLETE. Closed ${closedCount} expired position(s). ===`);
}

closeExpiredPositions();
