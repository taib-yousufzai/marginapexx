const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const dotenv = require('dotenv');

// Load env vars
const envFile = fs.readFileSync('.env.local');
const envConfig = dotenv.parse(envFile);

const supabase = createClient(
  envConfig.NEXT_PUBLIC_SUPABASE_URL,
  envConfig.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('instruments')
    .select('*')
    .limit(1);
  if (error) {
    console.error(error);
  } else if (data && data.length > 0) {
    console.log('Columns in instruments table:', Object.keys(data[0]));
  } else {
    console.log('No data found in instruments');
  }
}

run();
