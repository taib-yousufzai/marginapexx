const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  // 1. Try exact id match
  const { data: exactMatch, error: e1 } = await supabase
    .from('instruments')
    .select('id, instrument_token, tradingsymbol, exchange')
    .eq('id', 'GOLD_FUT')
    .limit(5);
  console.log('=== Exact id match for "GOLD_FUT" ===');
  console.log(exactMatch || e1);

  // 2. Try tradingsymbol match
  const { data: tsMatch, error: e2 } = await supabase
    .from('instruments')
    .select('id, instrument_token, tradingsymbol, exchange')
    .eq('tradingsymbol', 'GOLD_FUT')
    .limit(5);
  console.log('\n=== tradingsymbol match for "GOLD_FUT" ===');
  console.log(tsMatch || e2);

  // 3. Try exchange prefix matches
  for (const ex of ['NSE', 'NFO', 'MCX', 'BSE', 'BFO', 'CDS']) {
    const { data } = await supabase
      .from('instruments')
      .select('id, instrument_token, tradingsymbol, exchange')
      .eq('id', `${ex}:GOLD_FUT`)
      .limit(1);
    if (data && data.length > 0) {
      console.log(`\n=== Found with prefix ${ex}: ===`);
      console.log(data);
    }
  }

  // 4. Search for any instrument with "GOLD" in the tradingsymbol
  const { data: goldSearch, error: e3 } = await supabase
    .from('instruments')
    .select('id, instrument_token, tradingsymbol, exchange')
    .ilike('tradingsymbol', '%GOLD%')
    .limit(20);
  console.log('\n=== All instruments containing "GOLD" ===');
  console.log(goldSearch || e3);

  // 5. Also search by id containing GOLD
  const { data: goldIdSearch } = await supabase
    .from('instruments')
    .select('id, instrument_token, tradingsymbol, exchange')
    .ilike('id', '%GOLD%')
    .limit(20);
  console.log('\n=== All ids containing "GOLD" ===');
  console.log(goldIdSearch);
}

check().catch(console.error);
