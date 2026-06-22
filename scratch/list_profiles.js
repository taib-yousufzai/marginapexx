const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error('Missing env vars');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);

async function main() {
  const { data, error } = await supabase.from('profiles').select('email, role, client_id');
  if (error) {
    console.error('Error fetching profiles:', error);
  } else {
    console.log('Profiles:');
    console.log(data);
  }
}

main();
