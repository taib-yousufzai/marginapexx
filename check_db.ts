import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function main() {
  const { getAdminClient } = await import('./lib/adminClient.ts');
  const admin = getAdminClient();
  
  // Query positions
  const { data: positions } = await admin
    .from('positions')
    .select('*')
    .eq('status', 'open');

  console.log('Open positions details:');
  positions?.forEach(p => {
    console.log(`- ${p.symbol}: ID=${p.id}, stop_loss=${p.stop_loss}, target=${p.target}, qty=${p.qty_open}`);
  });

  // Query latest orders
  const { data: orders } = await admin
    .from('orders')
    .select('*')
    .in('symbol', ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ETH', 'SOL'])
    .order('created_at', { ascending: false })
    .limit(5);

  console.log('Latest 5 orders details:');
  orders?.forEach(o => {
    console.log(`- [${o.created_at}] ${o.symbol} ${o.side}: ID=${o.id}, status=${o.status}, order_type=${o.order_type}, price=${o.price}, ltp_at_entry=${o.ltp_at_entry}, stop_loss=${o.stop_loss}, target=${o.target}, is_exit=${o.is_exit}`);
  });

  // Query pending orders
  const { data: pending } = await admin
    .from('orders')
    .select('*')
    .eq('status', 'PENDING');

  console.log('Pending orders details:');
  pending?.forEach(o => {
    console.log(`- [${o.created_at}] ${o.symbol} ${o.side}: ID=${o.id}, status=${o.status}, order_type=${o.order_type}, price=${o.price}, ltp_at_entry=${o.ltp_at_entry}, stop_loss=${o.stop_loss}, target=${o.target}, is_exit=${o.is_exit}`);
  });

  // Query market quotes
  const { data: quotes } = await admin
    .from('market_quotes')
    .select('*')
    .in('id', ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ETH', 'BTC'])
    .order('updated_at', { ascending: false });

  console.log('Latest market quotes in DB:');
  quotes?.forEach(q => {
    console.log(`- ${q.id}: Price=${q.last_price}, UpdatedAt=${q.updated_at}`);
  });
}

main();
