const fs = require('fs');
const path = require('path');

// Regex to match emojis (excluding normal punctuation, math symbols like arrows, currency, etc.)
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu;

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        scanDir(fullPath);
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.css')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (emojiRegex.test(content)) {
        console.log(`\nFile: ${fullPath}`);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          emojiRegex.lastIndex = 0;
          if (emojiRegex.test(line)) {
            console.log(`  Line ${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}

console.log('Scanning for emojis...');
scanDir(path.resolve(__dirname, '../app'));
scanDir(path.resolve(__dirname, '../components'));
