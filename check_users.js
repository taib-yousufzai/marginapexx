const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkUsers() {
  console.log("--- Fetching profiles table ---");
  const { data: profiles, error: pError } = await supabase
    .from('profiles')
    .select('id, client_id, email, full_name, role, parent_id, active');
  
  if (pError) {
    console.error("Error fetching profiles:", pError);
    return;
  }

  for (const p of profiles) {
    console.log(`Profile: email=${p.email}, id=${p.id}, client_id=${p.client_id}, name=${p.full_name}, role=${p.role}, parent_id=${p.parent_id}, active=${p.active}`);
  }

  console.log("\n--- Fetching Auth users ---");
  const { data: { users }, error: uError } = await supabase.auth.admin.listUsers();
  if (uError) {
    console.error("Error listing auth users:", uError);
    return;
  }

  for (const u of users) {
    console.log(`Auth User: email=${u.email}, id=${u.id}, role_metadata=${u.user_metadata?.role}`);
  }
}

checkUsers();
