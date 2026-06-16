async function test() {
  try {
    const start1 = Date.now();
    const res1 = await fetch('http://localhost:3000/api/market/instruments/library');
    const json1 = await res1.json();
    const time1 = Date.now() - start1;
    console.log(`Request 1: ${time1}ms, status: ${res1.status}`);

    const start2 = Date.now();
    const res2 = await fetch('http://localhost:3000/api/market/instruments/library');
    const json2 = await res2.json();
    const time2 = Date.now() - start2;
    console.log(`Request 2: ${time2}ms, status: ${res2.status}`);
  } catch (err) {
    console.error('Failed to run speed test:', err.message);
  }
}

test();
