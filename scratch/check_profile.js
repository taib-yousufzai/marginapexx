const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

async function main() {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', 'dfa9b057-9187-4054-9ae6-9179c620666e')
    .single();

  if (error) console.error(error);
  else console.log('Profile:', JSON.stringify(profile, null, 2));
}

main().catch(console.error);
