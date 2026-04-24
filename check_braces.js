const fs = require('fs');
const lines = fs.readFileSync('app/admin/page.tsx', 'utf8').split('\n');
let d = 0;
// Check depth before line 3028 (PayinOutPageImpl start)
for (let i = 0; i < 3027; i++) {
  for (const c of lines[i]) {
    if (c === '{') d++;
    if (c === '}') d--;
  }
}
console.log('Brace depth before PayinOutPageImpl (line 3028):', d);

// Now scan through PayinOutPageImpl and find where depth returns to same level
const startDepth = d;
for (let i = 3027; i < Math.min(3620, lines.length); i++) {
  for (const c of lines[i]) {
    if (c === '{') d++;
    if (c === '}') d--;
  }
  if (d === startDepth && i > 3027) {
    console.log('PayinOutPageImpl closes at line', i + 1, '(depth back to', d, ')');
    break;
  }
}
console.log('Final depth at line 3615:', d);
