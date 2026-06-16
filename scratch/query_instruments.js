const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

// Load env vars
const envFile = fs.readFileSync('.env.local');
const envConfig = dotenv.parse(envFile);

const supabase = createClient(
  envConfig.NEXT_PUBLIC_SUPABASE_URL,
  envConfig.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  console.log('--- COMEX ---');
  const { count: comexCount, error: err1 } = await supabase
    .from('instruments')
    .select('*', { count: 'exact', head: true })
    .eq('segment', 'COMEX');
  console.log('COMEX instruments count:', comexCount, err1 || '');

  console.log('--- INDEX-FUT ---');
  // Check NIFTY, BANKNIFTY, etc.
  const { count: indexFutsCount, error: err2 } = await supabase
    .from('instruments')
    .select('*', { count: 'exact', head: true })
    .in('name', ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'])
    .in('instrument_type', ['FUTIDX', 'FUT', 'MAPPED_FUT']);
  console.log('Index Futures count:', indexFutsCount, err2 || '');

  // Let's also see what distinct names are in instruments
  const { data: names, error: err3 } = await supabase
    .from('instruments')
    .select('name')
    .limit(10);
  console.log('Sample names:', names, err3 || '');

  console.log('--- STOCK-OPT ---');
  const { count: stockOptsCount, error: err4 } = await supabase
    .from('instruments')
    .select('*', { count: 'exact', head: true })
    .eq('segment', 'NFO-OPT');
  console.log('NFO-OPT segment instruments count:', stockOptsCount, err4 || '');

  const { count: nfoCount, error: err5 } = await supabase
    .from('instruments')
    .select('*', { count: 'exact', head: true })
    .eq('exchange', 'NFO');
  console.log('NFO exchange count:', nfoCount, err5 || '');

  const { data: distinctSegments, error: err6 } = await supabase
    .from('instruments')
    .select('segment')
    .limit(100);
  const uniqueSegs = [...new Set(distinctSegments?.map(s => s.segment))];
  console.log('Distinct segments in database:', uniqueSegs, err6 || '');
  
  const { data: distinctTypes, error: err7 } = await supabase
    .from('instruments')
    .select('instrument_type')
    .limit(100);
  const uniqueTypes = [...new Set(distinctTypes?.map(s => s.instrument_type))];
  console.log('Distinct types in database:', uniqueTypes, err7 || '');
}

run();
