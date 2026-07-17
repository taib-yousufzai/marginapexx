import { getAdminClient } from './lib/adminClient.ts';

async function run() {
  const admin = getAdminClient();
  const { data } = await admin
    .from('instruments')
    .select('id, instrument_token, tradingsymbol, exchange, segment')
    .ilike('tradingsymbol', '%GOLD%PE')
    .limit(5);
  console.log(data);
}

run();
