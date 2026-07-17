import https from 'https';
import readline from 'readline';

https.get('https://api.kite.trade/instruments', (res) => {
  const rl = readline.createInterface({
    input: res,
    crlfDelay: Infinity
  });

  rl.on('line', (line) => {
    if (line.includes(',SENSEX,') && !line.includes('OPT') && !line.includes('FUT')) {
        console.log(line);
    }
    if (line.startsWith('265,')) {
        console.log("FOUND 265: " + line);
    }
  });
});
