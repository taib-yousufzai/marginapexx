const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('instruments')
    .select('name, expiry, option_type, tradingsymbol, strike_price')
    .eq('name', 'NIFTY')
    .limit(10);
  console.log('Results:', data, 'Error:', error);
}
check();
