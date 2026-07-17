const WebSocket = require('ws');

const ws = new WebSocket('wss://marginapexx-production.up.railway.app/market-ws');

ws.on('open', () => {
  console.log('Connected to WS');
  ws.send(JSON.stringify({
    action: 'subscribe',
    symbols: ['BSE:SENSEX', 'MCX:CRUDEOIL26JULFUT', 'NSE:NIFTY 50']
  }));
});

ws.on('message', (data) => {
  console.log('Message:', data.toString());
});

setTimeout(() => {
  ws.close();
}, 5000);
