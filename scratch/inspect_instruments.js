const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspectInstruments() {
  const symbols = [
    'NIFTY26JUN23800CE',
    'BTCUSDT',
    'ETH',
    'BTC',
    'SENSEX26JUN76800CE'
  ];

  for (const sym of symbols) {
    const { data, error } = await supabase
      .from('instruments')
      .select('id, name, tradingsymbol, instrument_token, exchange, segment')
      .eq('tradingsymbol', sym);

    if (error) {
      console.error(error);
    } else {
      console.log(`Query for ${sym}:`, JSON.stringify(data, null, 2));
    }
  }
}
inspectInstruments();
