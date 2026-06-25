const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkNatgas() {
  const { data, error } = await supabase
    .from('instruments')
    .select('tradingsymbol, expiry, name, exchange')
    .eq('tradingsymbol', 'NATGASMINI26JUNFUT');

  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
checkNatgas();
