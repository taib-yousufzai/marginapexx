import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { getAdminClient } = await import('./lib/adminClient.ts');
  const admin = getAdminClient();
  
  // Query positions
  const { data: positions } = await admin
    .from('positions')
    .select('*')
    .in('symbol', ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'])
    .eq('status', 'open');

  console.log('Open positions details:');
  positions?.forEach(p => {
    console.log(`- ${p.symbol}: ID=${p.id}, stop_loss=${p.stop_loss}, target=${p.target}, qty=${p.qty_open}`);
  });

  // Query latest orders
  const { data: orders } = await admin
    .from('orders')
    .select('*')
    .in('symbol', ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'])
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Latest 5 orders details:');
  orders?.forEach(o => {
    console.log(`- [${o.created_at}] ${o.symbol} ${o.side}: ID=${o.id}, status=${o.status}, order_type=${o.order_type}, stop_loss=${o.stop_loss}, target=${o.target}`);
  });
}

main();
