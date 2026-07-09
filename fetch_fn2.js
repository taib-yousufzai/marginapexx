require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const client = new Client({ connectionString: process.env.DATABASE_URL });
async function run() {
  await client.connect();
  const res = await client.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'place_order';");
  console.log(res.rows[0].pg_get_functiondef);
  await client.end();
}
run();
