const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const BROKER_ID = '7e6428e3-8b8a-44e9-bba9-8b2e8801e13a'; // broker@gmail.com
const USER_IDS = [
  '5a0b8f18-9b8d-44d9-becb-abce8e5b5e6a', // Kaushal
  'ad75e8f2-57a9-4b40-8f9d-dcee10ce4ca9', // Adki sandyarani
  '926dedd4-2475-4ebd-85ac-8c26a9b0aac7', // Deom
  '188f6c59-f0f1-4cbc-bc3a-a6fe377ad9f5'  // Luck
];

async function updateParents() {
  console.log(`Setting parent_id to ${BROKER_ID} for users:`, USER_IDS);
  
  const { data, error } = await supabase
    .from('profiles')
    .update({ parent_id: BROKER_ID })
    .in('id', USER_IDS)
    .select('id, email, parent_id');

  if (error) {
    console.error("Error updating parent IDs:", error);
    return;
  }

  console.log("Successfully updated profiles:", data);
}

updateParents();
