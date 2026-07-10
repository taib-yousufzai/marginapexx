
require('dotenv').config({ path: '.env.local' });

async function main() {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
  const headers = {
    'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
  };
  const res = await fetch(url, { headers });
  const schema = await res.json();
  const paths = Object.keys(schema.paths);
  console.log('RPC Paths:');
  paths.filter(p => p.startsWith('/rpc/')).forEach(p => console.log(p));
}

main().catch(console.error);
