import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  const symbol = 'NIFTY';
  const today = new Date().toISOString().split('T')[0];
  
  console.time('fetchExpiries (RPC)');
  let expiriesQuery = supabase.rpc('get_option_expiries', { 
    p_symbol: symbol, 
    p_min_date: today 
  });
  const rpcRes = await expiriesQuery;
  console.timeEnd('fetchExpiries (RPC)');
  console.log('RPC Error:', rpcRes.error?.message);
  
  console.time('fallbackExpiries');
  const fbRes = await supabase
    .from('instruments')
    .select('expiry')
    .eq('underlying_symbol', symbol)
    .not('expiry', 'is', null)
    .gte('expiry', today)
    .order('expiry', { ascending: true });
  console.timeEnd('fallbackExpiries');
  
  console.time('optionsPromise');
  const optRes = await supabase
    .from('instruments')
    .select('id, instrument_token, tradingsymbol, strike_price, option_type, exchange')
    .eq('underlying_symbol', symbol)
    .eq('expiry', '2026-06-12') // example date
    .in('option_type', ['CE', 'PE'])
    .order('strike_price', { ascending: true });
  console.timeEnd('optionsPromise');
}

run().catch(console.error);
