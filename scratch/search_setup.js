const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../supabase/setup.sql');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('balance')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
