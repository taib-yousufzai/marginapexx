async function main() {
  const url = 'https://marginapex.online/api/market/comex?symbols=GC=F,SI=F,HG=F,CL=F';
  console.log('Fetching COMEX proxy from:', url);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error('HTTP error:', res.status);
      return;
    }
    const json = await res.json();
    console.log('COMEX Response:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

main();
