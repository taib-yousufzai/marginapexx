const WebSocket = require('ws');
const ws = new WebSocket('wss://stream.binance.com:443/stream?streams=btcusdt@ticker/ethusdt@ticker');
ws.on('open', () => console.log('connected'));
ws.on('message', (data) => {
  console.log(JSON.parse(data.toString()).data.e);
  process.exit(0);
});
