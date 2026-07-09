import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await admin.rpc('exec_sql', { query: "SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'place_order';" });
  if (error) console.error("Error:", error);
  else console.log(data);
}
run();
