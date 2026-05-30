const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env.local') });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing SUPABASE env vars. URL:", url, "Key present:", !!key);
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const { data: profiles, error } = await supabase.from('profiles').select('*');
  if (error) {
    console.error("Error fetching profiles:", error);
  } else {
    console.log("Profiles in database:");
    profiles.forEach(p => {
      console.log(`ID: ${p.id}, Email: ${p.email}, Role: ${p.role}, Segments: ${JSON.stringify(p.segments)}`);
    });
  }
}

run();
