const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findExpiries() {
  const { data: positions, error: pError } = await supabase
    .from('positions')
    .select('id, user_id, symbol, status, qty_open, entry_price, ltp')
    .eq('status', 'open');

  if (pError) {
    console.error(pError);
    return;
  }

  console.log(`Open Positions count: ${positions.length}`);

  const today = new Date().toISOString().split('T')[0];
  console.log(`Today's date (UTC): ${today}`);

  for (const pos of positions) {
    const { data: inst, error: iError } = await supabase
      .from('instruments')
      .select('tradingsymbol, expiry, name')
      .eq('tradingsymbol', pos.symbol)
      .maybeSingle();

    if (iError) {
      console.error(`Error fetching instrument for ${pos.symbol}:`, iError);
      continue;
    }

    if (!inst) {
      console.log(`Position: ${pos.symbol} - No instrument found in DB`);
      continue;
    }

    const isExpired = inst.expiry && inst.expiry < today;
    console.log(`Position: ${pos.symbol} | Expiry: ${inst.expiry || 'None'} | Expired? ${isExpired ? '🔴 YES' : '🟢 NO'}`);
  }
}

findExpiries();
