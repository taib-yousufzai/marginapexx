async function test() {
  const KITE_INSTRUMENTS_ROW1 = [
    'NSE:NIFTY 50',
    'BSE:SENSEX',
    'NSE:NIFTY BANK',
    'CDS:USDINR26JUNFUT',
  ];
  const KITE_INSTRUMENTS_ROW2 = [
    'MCX:CRUDEOIL26JUNFUT',
    'MCX:GOLD26JUNFUT',
    'MCX:SILVER26JULFUT',
    'MCX:NATURALGAS26JUNFUT',
  ];
  const currentSymbols = [...KITE_INSTRUMENTS_ROW1, ...KITE_INSTRUMENTS_ROW2];
  try {
    const res = await fetch(`https://marginapexx-production.up.railway.app/quotes?symbols=${currentSymbols.join(',')}`);
    const json = await res.json();
    console.log("Railway response:", JSON.stringify(json, null, 2));
  } catch(e) {
    console.log("Railway failed:", e.message);
  }
}
test();
