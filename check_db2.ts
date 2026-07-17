import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl!, supabaseKey!);

async function main() {
  console.log("Checking exact BSE:SENSEX...");
  const res1 = await supabase
    .from('instruments')
    .select('*')
    .eq('id', 'BSE:SENSEX');
  console.log(res1.data);

  console.log("Checking MCX futures...");
  const res2 = await supabase
    .from('instruments')
    .select('*')
    .like('id', 'MCX:CRUDEOIL%FUT%')
    .limit(10);
  console.log(res2.data);
}
main();
