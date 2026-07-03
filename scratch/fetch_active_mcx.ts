import Papa from 'papaparse';

async function main() {
  console.log('Fetching active instruments from Zerodha Kite API...');
  const res = await fetch('https://api.kite.trade/instruments');
  if (!res.ok) {
    console.error('Failed to fetch instruments:', res.status);
    return;
  }
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true });
  const data = parsed.data as any[];

  // Only Silver FUT contracts (not options, not mini)
  const silverFut = data.filter(i => 
    i.exchange === 'MCX' && 
    i.tradingsymbol && 
    i.tradingsymbol.match(/^SILVER\d/) &&  // SILVER (big), not SILVERM (mini)
    i.tradingsymbol.endsWith('FUT')
  );
  
  console.log('\n=== Active MCX SILVER (big) FUT contracts ===');
  silverFut.forEach(i => {
    console.log(`  ${i.tradingsymbol}  token=${i.instrument_token}  expiry=${i.expiry}  segment=${i.segment}`);
  });

  // Also show SILVERM (mini) FUT
  const silverMFut = data.filter(i => 
    i.exchange === 'MCX' && 
    i.tradingsymbol && 
    i.tradingsymbol.startsWith('SILVERM') &&
    i.tradingsymbol.endsWith('FUT')
  );
  
  console.log('\n=== Active MCX SILVERM (mini) FUT contracts ===');
  silverMFut.forEach(i => {
    console.log(`  ${i.tradingsymbol}  token=${i.instrument_token}  expiry=${i.expiry}  segment=${i.segment}`);
  });

  // Also check CRUDEOIL and NATURALGAS for completeness
  const crudeOilFut = data.filter(i => 
    i.exchange === 'MCX' && 
    i.tradingsymbol && 
    i.tradingsymbol.startsWith('CRUDEOIL') &&
    i.tradingsymbol.endsWith('FUT')
  );
  console.log('\n=== Active MCX CRUDEOIL FUT contracts ===');
  crudeOilFut.forEach(i => {
    console.log(`  ${i.tradingsymbol}  token=${i.instrument_token}  expiry=${i.expiry}  segment=${i.segment}`);
  });

  const copperFut = data.filter(i => 
    i.exchange === 'MCX' && 
    i.tradingsymbol && 
    i.tradingsymbol.startsWith('COPPER') &&
    i.tradingsymbol.endsWith('FUT')
  );
  console.log('\n=== Active MCX COPPER FUT contracts ===');
  copperFut.forEach(i => {
    console.log(`  ${i.tradingsymbol}  token=${i.instrument_token}  expiry=${i.expiry}  segment=${i.segment}`);
  });
}

main().catch(console.error);
