import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getAdminClient } from '../lib/adminClient';

const TARGETS = [
  'NSE:NIFTY 50',
  'BSE:SENSEX',
  'NSE:NIFTY BANK',
  'CDS:USDINR26JUNFUT',
  'MCX:CRUDEOIL26JUNFUT',
  'MCX:GOLD26JUNFUT',
  'MCX:SILVER26JULFUT',
  'MCX:NATURALGAS26JUNFUT',
];

async function main() {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from('market_quotes')
    .select('*')
    .in('id', TARGETS);
  
  if (error) {
    console.error('Error fetching market_quotes:', error);
  } else {
    console.log('Target market_quotes status:');
    console.log(JSON.stringify(data, null, 2));
  }
}

main().catch(console.error);
