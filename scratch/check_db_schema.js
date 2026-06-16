const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('Fetching script settings...');
  const { data: settings, error } = await supabase
    .from('script_settings')
    .select('*');
  console.log('Script settings:', settings, error);
}

main();
