fetch('http://localhost:3000/api/market/options?symbol=GOLD').then(res => res.json()).then(data => console.log(JSON.stringify(data.strikes[0], null, 2))).catch(err => console.error(err));
