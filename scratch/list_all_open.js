const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function listAllOpen() {
  const { data, error } = await supabase
    .from('positions')
    .select('id, symbol, user_id, status, qty_open')
    .eq('status', 'open');

  if (error) console.error(error);
  else {
    console.log("Total Open Positions:", data.length);
    console.log(JSON.stringify(data, null, 2));
  }
}
listAllOpen();
