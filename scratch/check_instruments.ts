import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl!, supabaseKey!);

async function main() {
  const symbols = [
    'MCX:CRUDEOIL26JULFUT',
    'MCX:GOLD26AUGFUT',
    'MCX:SILVER26JULFUT',
    'MCX:NATURALGAS26JULFUT',
  ];

  console.log('Querying instruments table for symbols:', symbols);
  const { data, error } = await supabase
    .from('instruments')
    .select('id, name, tradingsymbol, instrument_token')
    .in('id', symbols);

  if (error) {
    console.error('Error querying instruments:', error);
    return;
  }

  console.log('Results:');
  console.log(JSON.stringify(data, null, 2));

  // Let's also check if there are ANY MCX:CRUDEOIL or similar instruments
  const { data: mcxData, error: mcxError } = await supabase
    .from('instruments')
    .select('id, name, tradingsymbol, instrument_token')
    .like('id', 'MCX:%')
    .limit(10);

  if (mcxError) {
    console.error('Error querying MCX instruments:', mcxError);
    return;
  }

  console.log('Sample MCX instruments in database:');
  console.log(JSON.stringify(mcxData, null, 2));
}

main();
