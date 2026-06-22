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
  const { data, error } = await supabase
    .from('act_logs')
    .select('id, type, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching logs:', error);
  } else {
    console.log('Last 20 Activity Logs:');
    console.log(JSON.stringify(data, null, 2));
  }
}

main();
