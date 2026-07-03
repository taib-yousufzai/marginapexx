/**
 * seed-silver-sep.mjs
 *
 * One-shot: upserts the September 2026 Silver MCX futures instrument
 * into the `instruments` table after the July contract expired.
 *
 * Run once:  node scripts/seed-silver-sep.mjs
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const instruments = [
  // Silver (big) September contract — replaces expired July contract
  { id: 'MCX:SILVER26SEPFUT', instrument_token: 120761607, tradingsymbol: 'SILVER26SEPFUT', exchange: 'MCX', expiry: '2026-09-04', instrument_type: 'FUT', segment: 'MCX-FUT' },
];

async function main() {
  const rows = instruments.map(i => ({
    id: i.id,
    instrument_token: i.instrument_token,
    tradingsymbol: i.tradingsymbol,
    exchange: i.exchange,
    expiry: i.expiry,
    instrument_type: i.instrument_type,
    segment: i.segment,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('instruments')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('Upsert failed:', error.message);
    process.exit(1);
  }

  console.log(`✓ Upserted ${rows.length} instrument rows:`);
  rows.forEach(r => console.log(`  ${r.id}  token=${r.instrument_token}  expiry=${r.expiry}`));
}

main();
