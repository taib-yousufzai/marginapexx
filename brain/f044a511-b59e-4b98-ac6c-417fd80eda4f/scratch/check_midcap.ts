import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  // Check position's stored ltp and compare with live ticker
  const { data: pos } = await supabase
    .from('positions')
    .select('id, symbol, settlement, status, ltp, entry_price, updated_at')
    .eq('status', 'open');

  console.log("Position in DB:", JSON.stringify(pos, null, 2));

  // Check what the positions API returns
  // Use a dummy token for admin access
  const tickerUrl = 'https://marginapexx-production.up.railway.app';
  const res = await fetch(`${tickerUrl}/quotes?symbols=NFO:MIDCPNIFTY26JUL14875CE`);
  const json = await res.json();
  console.log("Live quote from ticker:", JSON.stringify(json, null, 2));
}

check();
