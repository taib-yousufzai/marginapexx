const fs = require('fs');
let code = fs.readFileSync('d:/Desktop/Daksh/Sidharth/marginapexx/web/app/api/market/instruments/library/route.ts', 'utf8');

code = code.replace(
  /\.select\('tradingsymbol, name, exchange, instrument_type, segment, expiry'\)/g, 
  ".select('tradingsymbol, name, exchange, instrument_type, segment, expiry, lot_size')"
);
code = code.replace(
  /\.select\('tradingsymbol, name, exchange, instrument_type, strike_price, option_type, expiry, underlying_symbol'\)/g,
  ".select('tradingsymbol, name, exchange, instrument_type, strike_price, option_type, expiry, underlying_symbol, lot_size')"
);
code = code.replace(
  /\.select\('tradingsymbol, name, exchange, expiry'\)/g,
  ".select('tradingsymbol, name, exchange, expiry, lot_size')"
);
code = code.replace(
  /close: 0(?=\s*\})/g,
  "close: 0, lotSize: i.lot_size"
);

fs.writeFileSync('d:/Desktop/Daksh/Sidharth/marginapexx/web/app/api/market/instruments/library/route.ts', code);
console.log('Replaced library/route.ts');
