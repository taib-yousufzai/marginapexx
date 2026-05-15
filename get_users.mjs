import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addFunds() {
  const { data: users, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
    console.error('Error listing users:', listError);
    return;
  }
  const user = users.users.find(u => u.email === 'user@gmail.com');
  if (!user) {
    console.error('User not found');
    return;
  }
  const { error: insertError } = await supabase.from('transactions').insert({
    user_id: user.id, type: 'DEPOSIT', amount: 5000000, status: 'APPROVED', ref_id: 'TEST_BULK_' + Date.now()
  });
  if (insertError) {
    console.error('Error inserting transaction:', insertError);
  } else {
    console.log('Added ₹50,00,000 to user@gmail.com — orders should now pass margin check');
  }
}
addFunds();
