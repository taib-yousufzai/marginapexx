const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  // 1. Get access token from DB (simulate what the API does)
  const { data: session } = await supabase
    .from('kite_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!session) {
    console.error('No Kite session found in DB');
    return;
  }

  const accessToken = session.access_token;
  const apiKey = process.env.KITE_API_KEY;

  console.log('Using Access Token:', accessToken.substring(0, 10) + '...');

  // 2. Try to fetch BANKEX quotes
  const instruments = ['BSE:BANKEX', 'BFO:BANKEX26MAY49600PE'];
  const params = new URLSearchParams();
  instruments.forEach(i => params.append('i', i));

  const url = `https://api.kite.trade/quote?${params.toString()}`;
  console.log('Requesting:', url);

  const res = await fetch(url, {
    headers: {
      'X-Kite-Version': '3',
      'Authorization': `token ${apiKey}:${accessToken}`,
    }
  });

  console.log('Status:', res.status);
  const json = await res.json();
  console.log('Response:', JSON.stringify(json, null, 2));
}

test();
