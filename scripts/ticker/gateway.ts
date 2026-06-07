import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import pino from 'pino';
import type { TickData } from './dbWriter.ts';

const logger = pino({ name: 'ticker-gateway' });

export interface ClientConnection {
  ws: WebSocket;
  subscribedSymbols: Set<string>;
}

export class WebSocketGateway {
  private wss: WebSocketServer;
  private connections: Set<ClientConnection> = new Set();
  private quoteCache: Map<string, TickData> = new Map();

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ noServer: true });
    
    server.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url || '', `http://${request.headers.host}`).pathname;
      if (pathname === '/market-ws' || pathname === '/') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('Client connected to WebSocket Gateway');
      const connection: ClientConnection = {
        ws,
        subscribedSymbols: new Set(),
      };
      
      this.connections.add(connection);

      ws.on('message', (message: string) => {
        try {
          const payload = JSON.parse(message);
          if (payload.action === 'subscribe' && Array.isArray(payload.symbols)) {
            const initialQuotes: Record<string, TickData> = {};
            for (const sym of payload.symbols) {
              connection.subscribedSymbols.add(sym);
              const cached = this.quoteCache.get(sym);
              if (cached) {
                initialQuotes[sym] = cached;
              }
            }
            // Send initial quotes for the newly subscribed symbols immediately
            if (Object.keys(initialQuotes).length > 0) {
              ws.send(JSON.stringify({ type: 'quotes', data: initialQuotes }));
            }
            logger.info({ symbols: payload.symbols }, 'Client subscribed');
          } else if (payload.action === 'unsubscribe' && Array.isArray(payload.symbols)) {
            for (const sym of payload.symbols) {
              connection.subscribedSymbols.delete(sym);
            }
            logger.info({ symbols: payload.symbols }, 'Client unsubscribed');
          }
        } catch (err) {
          logger.warn({ err, message }, 'Invalid message received from client');
        }
      });

      ws.on('close', () => {
        logger.info('Client disconnected');
        this.connections.delete(connection);
      });

      ws.on('error', (err) => {
        logger.error({ err }, 'WebSocket connection error');
        this.connections.delete(connection);
      });
    });
  }

  public updateQuote(symbol: string, tick: TickData) {
    this.quoteCache.set(symbol, tick);

    // Broadcast to subscribed clients
    const updateMsg = JSON.stringify({
      type: 'update',
      symbol,
      data: tick,
    });

    for (const conn of this.connections) {
      if (conn.subscribedSymbols.has(symbol) && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(updateMsg);
      }
    }
  }

  public getQuote(symbol: string): TickData | undefined {
    return this.quoteCache.get(symbol);
  }

  public getQuotes(symbols: string[]): Record<string, TickData> {
    const res: Record<string, TickData> = {};
    for (const sym of symbols) {
      const q = this.quoteCache.get(sym);
      if (q) res[sym] = q;
    }
    return res;
  }
}
