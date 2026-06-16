import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log('Fetching columns info from Supabase...');
  const { data, error } = await supabase.from('positions').select('qty_open, qty_total').limit(1);
  if (error) {
    console.error('Positions fetch error:', error);
  } else {
    console.log('Positions samples:', data, 'types:', data?.map(d => ({ qty_open: typeof d.qty_open, qty_total: typeof d.qty_total })));
  }
  
  const { data: ordData, error: err2 } = await supabase.from('orders').select('qty, lots').limit(1);
  if (err2) {
    console.error('Orders fetch error:', err2);
  } else {
    console.log('Orders samples:', ordData, 'types:', ordData?.map(d => ({ qty: typeof d.qty, lots: typeof d.lots })));
  }
}

run().catch(console.error);
