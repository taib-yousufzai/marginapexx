import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function main() {
  console.log('Querying instruments for SILVER...');
  const { data, error } = await supabase
    .from('instruments')
    .select('id, name, tradingsymbol, instrument_token, segment')
    .like('id', 'MCX:SILVER%')
    .limit(50);

  if (error) {
    console.error(error);
    return;
  }

  // Filter to futures
  const futures = data.filter(i => i.id.endsWith('FUT'));
  console.log('Silver Futures contracts in database:');
  console.log(JSON.stringify(futures, null, 2));
}

main();
