const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const symbol = 'BANKNIFTY';
  
  console.log(`Checking instruments for underlying_symbol: ${symbol}`);
  
  const { data: instruments, error } = await supabase
    .from('instruments')
    .select('id, tradingsymbol, instrument_token, exchange, underlying_symbol, expiry, strike_price, option_type')
    .eq('underlying_symbol', symbol)
    .limit(5);

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('Sample Instruments:', JSON.stringify(instruments, null, 2));

  const { data: expiries } = await supabase
    .from('instruments')
    .select('expiry')
    .eq('underlying_symbol', symbol)
    .not('expiry', 'is', null)
    .order('expiry', { ascending: true });

  const uniqueExpiries = Array.from(new Set(expiries?.map(e => e.expiry)));
  console.log('Unique Expiries:', uniqueExpiries);
  
  // Check spot index
  const { data: spot } = await supabase
    .from('instruments')
    .select('*')
    .eq('id', 'NSE:NIFTY BANK');
  console.log('Spot Index Instrument:', JSON.stringify(spot, null, 2));
}

check();
