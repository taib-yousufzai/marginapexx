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

// Mock getRedisClient
const mockRedis = {
  hget: async () => null
};

// Mock filterEngine functions
function applyExpiryFilter(expiries, today) {
  return expiries.filter(e => e >= today).sort();
}
function applyStrikeRangeFilter(opts, atmPrice, range) {
  return opts; // no filter for testing
}

async function testApi() {
  const today = '2026-06-16';
  const segments = [];

  // 1. Index-FUT
  const { data: indexFuts, error: err1 } = await supabase
    .from('instruments')
    .select('tradingsymbol, name, exchange, instrument_type, segment, expiry')
    .in('name', ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'])
    .in('instrument_type', ['FUTIDX', 'FUT', 'MAPPED_FUT'])
    .gte('expiry', today)
    .order('expiry', { ascending: true })
    .limit(30);

  console.log('Index futs returned:', indexFuts ? indexFuts.length : 0, err1 || '');

  if (indexFuts && indexFuts.length > 0) {
    const earliestExpiries = new Map();
    indexFuts.forEach(f => {
      if (!earliestExpiries.has(f.name) || f.expiry < earliestExpiries.get(f.name).expiry) {
        earliestExpiries.set(f.name, f);
      }
    });
    segments.push({
      name: 'INDEX-FUT',
      icon: 'fa-chart-line',
      instruments: Array.from(earliestExpiries.values()).map(i => ({
        name: i.tradingsymbol, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`,
        price: 0, change: '0%', segment: `${i.exchange === 'NFO' ? 'NSE' : i.exchange === 'BFO' ? 'BSE' : i.exchange} - Futures`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0
      }))
    });
  }

  // 2. Index-OPT
  // ...

  // Let's run and print segments name
  console.log('Segments generated:', segments);
}

testApi();
