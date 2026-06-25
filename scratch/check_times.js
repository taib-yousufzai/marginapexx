const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTimes() {
  const { data, error } = await supabase
    .from('positions')
    .select('id, symbol, status, entry_time, created_at')
    .eq('id', 'a1f8aa58-7b41-4cf8-9e0a-380867ddfd5b')
    .single();

  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
checkTimes();
