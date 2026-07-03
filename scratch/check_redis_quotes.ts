import Redis from 'ioredis';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error('Missing REDIS_URL');
  process.exit(1);
}

const redis = new Redis(redisUrl);

async function main() {
  console.log('Querying Redis hash "market:quotes"...');
  const quotes = await redis.hgetall('market:quotes');
  console.log('Total keys in market:quotes:', Object.keys(quotes).length);
  for (const [key, val] of Object.entries(quotes)) {
    if (key.includes('MCX')) {
      console.log(`${key} => ${val}`);
    }
  }
  redis.disconnect();
}

main();
