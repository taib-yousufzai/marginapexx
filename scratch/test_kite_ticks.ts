import { getSharedKiteSession } from '../lib/kiteSession.ts';
import { getAdminClient } from '../lib/adminClient.ts';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
// @ts-ignore
import { KiteTicker } from 'kiteconnect';

async function test() {
  const admin = getAdminClient();
  const { data } = await admin.from('instruments')
    .select('instrument_token, tradingsymbol')
    .ilike('tradingsymbol', '%SENSEX%PE')
    .limit(1);
    
  if (!data || data.length === 0) {
    console.error("No SENSEX PE found");
    process.exit(1);
  }
  
  const token = data[0].instrument_token;
  console.log("Found token:", token, data[0].tradingsymbol);

  const session = await getSharedKiteSession();
  const ticker = new KiteTicker({
    api_key: process.env.KITE_API_KEY,
    access_token: session!.accessToken
  });

  const tokens = [Number(token)];
  
  ticker.on('connect', () => {
    ticker.subscribe(tokens);
    ticker.setMode(ticker.modeFull, tokens);
  });

  ticker.on('ticks', (ticks: any) => {
    console.log(JSON.stringify(ticks, null, 2));
    process.exit(0);
  });

  ticker.connect();
}
test();
