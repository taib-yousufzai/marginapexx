const Redis = require('ioredis');
const fs = require('fs');
const dotenv = require('dotenv');

// Load env vars
const envFile = fs.readFileSync('.env.local');
const envConfig = dotenv.parse(envFile);

const redis = new Redis(envConfig.REDIS_URL);

async function run() {
  const keys = await redis.keys('auth_user:*');
  console.log('Found keys:', keys);
  for (const key of keys) {
    const val = await redis.get(key);
    console.log(key, '=>', JSON.parse(val).email);
  }
}

run().then(() => process.exit(0));
