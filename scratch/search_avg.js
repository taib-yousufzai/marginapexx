const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules') {
        searchDir(fullPath);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.includes('avg_price') || content.includes('avgPrice')) {
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.includes('avg_price') || line.includes('avgPrice')) {
            console.log(`${fullPath}:${idx+1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

searchDir(path.resolve(__dirname, '../app'));
searchDir(path.resolve(__dirname, '../components'));
