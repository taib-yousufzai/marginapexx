const fs = require('fs');
const dotenv = require('dotenv');

const envFile = fs.readFileSync('.env.local');
const envConfig = dotenv.parse(envFile);

console.log('REDIS_URL present:', !!envConfig.REDIS_URL);
if (envConfig.REDIS_URL) {
  console.log('REDIS_URL starts with:', envConfig.REDIS_URL.substring(0, 15));
}
