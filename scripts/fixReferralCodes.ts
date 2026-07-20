import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local if present
const envLocal = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf-8');
const supabaseUrl = envLocal.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim() || '';
const supabaseKey = envLocal.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)?.[1]?.trim() || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: profiles, error } = await supabase.from('profiles').select('id, referral_code');
  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }
  
  for (const p of profiles) {
    if (!p.referral_code) {
      const code = p.id.replace(/-/g, '').substring(0, 8).toUpperCase();
      console.log(`Setting referral_code ${code} for ${p.id}`);
      await supabase.from('profiles').update({ referral_code: code }).eq('id', p.id);
    }
  }
  console.log('Done!');
}
main();
