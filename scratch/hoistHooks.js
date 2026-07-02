const fs = require('fs');
let file = 'app/watchlist/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Find the block to move
const match = content.match(/\n  const marketSymbols = useMemo\(\(\) => {[\s\S]*?const { quotes: comexQuotes } = useComexQuotes\(comexSymbols, 1000\);/);
if (match) {
  const block = match[0];
  content = content.replace(block, ''); // remove it

  // insert it before `const isCrypto = !!(selectedItem?.binanceSymbol);`
  content = content.replace(
    '  // ── Detail sheet: resolve live quote from correct source',
    block + '\n\n  // ── Detail sheet: resolve live quote from correct source'
  );
  
  fs.writeFileSync(file, content);
}
