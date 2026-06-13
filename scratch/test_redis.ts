import { getRedisClient } from './lib/redis';

async function run() {
  const redis = getRedisClient();
  const res = await redis.hgetall('market:quotes');
  console.log('Keys in redis:', Object.keys(res));
  
  const nifty = await redis.hget('market:quotes', 'NSE:NIFTY 50');
  console.log('NIFTY:', nifty);
  
  process.exit(0);
}
run();
