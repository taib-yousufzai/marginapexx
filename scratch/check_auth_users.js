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
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  if (error) {
    console.error('Error listing auth users:', error);
  } else {
    console.log('Auth Users:');
    users.forEach(u => {
      console.log(`- Email: ${u.email}, ID: ${u.id}`);
    });
  }
}

run();
