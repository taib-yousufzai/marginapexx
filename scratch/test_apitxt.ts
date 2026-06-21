async function testApitxt() {
  const authkey = '0zKJokjjQjnTymUgm8DppV6OK2bcjrUrN5Z9cY-WEhc';
  
  console.log('Testing APItxt API key...');
  
  // Try checking balance if that endpoint exists
  try {
    const res = await fetch(`https://apitxt.com/api/balance?authkey=${authkey}`);
    const text = await res.text();
    console.log('Balance endpoint response:', text);
  } catch (e: any) {
    console.log('Balance endpoint failed:', e.message);
  }

  // Try sendMsg with missing params to see if auth succeeds
  try {
    const res2 = await fetch(`https://apitxt.com/api/sendMsg?authkey=${authkey}`);
    const text2 = await res2.text();
    console.log('sendMsg endpoint response:', text2);
  } catch (e: any) {
    console.log('sendMsg endpoint failed:', e.message);
  }
}

testApitxt();
