require('dotenv').config({path:'.env.local'});
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data: inst } = await supabase.from('instruments').select('tradingsymbol, lot_size').eq('tradingsymbol', 'NIFTY2671424100CE').single();
  console.log('Instrument:', inst);
}
check();
