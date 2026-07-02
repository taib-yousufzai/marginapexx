const fs = require('fs');

let wfile = 'app/watchlist/page.tsx';
let wcode = fs.readFileSync(wfile, 'utf8');

wcode = wcode.replace(/setOrderQty\([^)]*\);?/g, '');
wcode = wcode.replace(/setQtyInput\([^)]*\);?/g, '');
wcode = wcode.replace(/setOrderUnit\([^)]*\);?/g, '');
wcode = wcode.replace(/setOrderType\([^)]*\);?/g, '');
wcode = wcode.replace(/setProductType\([^)]*\);?/g, '');
wcode = wcode.replace(/setSlTpOpen\([^)]*\);?/g, '');
wcode = wcode.replace(/setSlPrice\([^)]*\);?/g, '');
wcode = wcode.replace(/setTpPrice\([^)]*\);?/g, '');

fs.writeFileSync(wfile, wcode);
