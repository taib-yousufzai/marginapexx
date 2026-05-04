const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function addFunds() {
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users.users.find(u => u.email === 'user@gmail.com');
  await supabase.from('transactions').insert({
    user_id: user.id, type: 'DEPOSIT', amount: 5000000, status: 'APPROVED', ref_id: 'TEST_BULK_' + Date.now()
  });
  console.log('Added ₹50,00,000 to user@gmail.com — orders should now pass margin check');
}
addFunds();
