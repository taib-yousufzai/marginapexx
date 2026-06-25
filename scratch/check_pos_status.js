const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPosStatus() {
  const { data, error } = await supabase
    .from('positions')
    .select('id, symbol, qty_open, status, exit_time, pnl, exit_price')
    .eq('id', 'a1f8aa58-7b41-4cf8-9e0a-380867ddfd5b')
    .single();

  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
checkPosStatus();
