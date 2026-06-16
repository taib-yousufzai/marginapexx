const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../app/position/page.tsx');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

for (let i = 210; i <= 280; i++) {
  console.log(`${i + 1}: ${lines[i]}`);
}
