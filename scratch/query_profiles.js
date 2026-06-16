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
    .from('profiles')
    .select('id, email, role, segments');
  if (error) {
    console.error('Error fetching profiles:', error);
  } else {
    console.log('Profiles list:', JSON.stringify(data, null, 2));
  }
}

run();
