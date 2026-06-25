const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findEthUser() {
  const { data, error } = await supabase
    .from('positions')
    .select('id, user_id, symbol, qty_open, entry_price, ltp, status')
    .eq('status', 'open')
    .eq('symbol', 'ETH');

  if (error) {
    console.error(error);
    return;
  }

  console.log("Matching open ETH positions:", JSON.stringify(data, null, 2));

  for (const pos of data) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, full_name, balance, auto_sqoff')
      .eq('id', pos.user_id)
      .single();
    console.log("User Profile:", JSON.stringify(profile, null, 2));
  }
}
findEthUser();
