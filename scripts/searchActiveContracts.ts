import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getAdminClient } from '../lib/adminClient';

async function main() {
  const admin = getAdminClient();
  
  // Search instruments table for USDINR and NATURALGAS
  const { data: usdinr, error: err1 } = await admin
    .from('instruments')
    .select('id, instrument_token, exchange, tradingsymbol')
    .like('id', 'CDS:USDINR%')
    .limit(10);
    
  const { data: natgas, error: err2 } = await admin
    .from('instruments')
    .select('id, instrument_token, exchange, tradingsymbol')
    .like('id', 'MCX:NATURALGAS%')
    .limit(10);

  console.log('USDINR instruments matching:');
  console.log(JSON.stringify(usdinr, null, 2));
  
  console.log('NATURALGAS instruments matching:');
  console.log(JSON.stringify(natgas, null, 2));
}

main().catch(console.error);
