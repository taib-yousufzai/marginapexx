import WebSocket from 'ws';

const ws = new WebSocket('wss://marginapexx-production.up.railway.app');

ws.on('open', () => {
  console.log('WS Open. Subscribing to MCX:SILVER26JULFUT and MCX:GOLD26AUGFUT...');
  ws.send(JSON.stringify({
    action: 'subscribe',
    symbols: ['MCX:SILVER26JULFUT', 'MCX:GOLD26AUGFUT']
  }));
});

ws.on('message', (data) => {
  console.log('Received message:');
  console.log(data.toString());
  ws.close();
});

ws.on('error', (err) => {
  console.error('WS Error:', err);
});
