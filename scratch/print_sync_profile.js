const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../supabase/setup.sql');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

for (let i = 3539; i <= 3629; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
