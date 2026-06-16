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
  const today = '2026-06-16'; // current simulated local date is June 16, 2026
  console.log('Using today =', today);

  // 1. Check Index Futures
  const { data: indexFuts, error: err1 } = await supabase
    .from('instruments')
    .select('tradingsymbol, name, exchange, instrument_type, segment, expiry')
    .in('name', ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'])
    .in('instrument_type', ['FUTIDX', 'FUT', 'MAPPED_FUT'])
    .order('expiry', { ascending: true });
  console.log('All Index Futures in DB:', indexFuts);

  // 2. Check COMEX instruments
  const { data: comexInstruments, error: err2 } = await supabase
    .from('instruments')
    .select('tradingsymbol, name, exchange, instrument_type, segment, expiry')
    .eq('segment', 'COMEX');
  console.log('COMEX Instruments in DB (any expiry):', comexInstruments);

  // 3. Check Stock Options expiries
  const topStocks = ['RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY'];
  const { data: stockOpts, error: err3 } = await supabase
    .from('instruments')
    .select('tradingsymbol, name, exchange, instrument_type, segment, expiry, underlying_symbol')
    .in('underlying_symbol', topStocks)
    .order('expiry', { ascending: true })
    .limit(10);
  console.log('Stock options sample:', stockOpts);

  // 4. Distinct segments in DB
  const { data: allSegs, error: err4 } = await supabase
    .from('instruments')
    .select('segment');
  const segs = [...new Set(allSegs.map(s => s.segment))];
  console.log('All distinct segments in DB:', segs);

  // 5. Check total rows in instruments table
  const { count, error: err5 } = await supabase
    .from('instruments')
    .select('*', { count: 'exact', head: true });
  console.log('Total instruments in DB:', count);
}

run();
