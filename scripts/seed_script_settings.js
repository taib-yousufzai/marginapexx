const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

const settings = [
  { symbol: 'GOLDM', lot_size: 10 },
  { symbol: 'GOLD', lot_size: 100 },
  { symbol: 'SILVERM', lot_size: 5 },
  { symbol: 'SILVER', lot_size: 30 },
  { symbol: 'CRUDEOIL', lot_size: 100 },
  { symbol: 'NATURALGAS', lot_size: 1250 }
];

async function seed() {
  console.log('Seeding script_settings table...');
  
  for (const item of settings) {
    const { data, error } = await supabase
      .from('script_settings')
      .upsert(item, { onConflict: 'symbol' })
      .select();
      
    if (error) {
      console.error(`Failed to upsert ${item.symbol}:`, error.message);
    } else {
      console.log(`Successfully upserted ${item.symbol} with lot_size ${item.lot_size}`);
    }
  }
  
  console.log('Seeding completed.');
}

seed().catch(err => {
  console.error('Unexpected error during seeding:', err);
});
