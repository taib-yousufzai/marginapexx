import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing keys");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log("Checking for Sensex...");
  const res1 = await supabase
    .from('instruments')
    .select('id, instrument_token, name, expiry, exchange')
    .like('id', '%SENSEX%')
    .limit(10);
  console.log(res1.data);

  console.log("Checking for Crudeoil...");
  const res2 = await supabase
    .from('instruments')
    .select('id, instrument_token, name, expiry, exchange')
    .like('id', '%CRUDEOIL%')
    .limit(10);
  console.log(res2.data);
}
main();
