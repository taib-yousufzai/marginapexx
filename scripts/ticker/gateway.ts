import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import pino from 'pino';
import { getRedisClient, createRedisPubSubClient } from '../../lib/redis.ts';
import { telemetry } from '../../lib/metrics.ts';
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
  private pubsubClient: any;
  private activeRedisSubscriptions: Set<string> = new Set();

  constructor(server: http.Server) {
    this.wss = new WebSocketServer({ noServer: true });
    this.pubsubClient = createRedisPubSubClient();

    // Set up Redis Pub/Sub message handler
    this.pubsubClient.on('message', (channel: string, message: string) => {
      telemetry.recordWsMessageReceived();
      const prefix = 'market:ticks:';
      if (channel.startsWith(prefix)) {
        const symbol = channel.substring(prefix.length);
        try {
          const tick = JSON.parse(message) as TickData;
          this.broadcastUpdate(symbol, tick);
        } catch (err) {
          logger.error({ err, channel }, 'Failed to parse tick message from Redis PubSub');
        }
      }
    });

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
      telemetry.recordWsConnectionChange(this.connections.size);

      // ── Keepalive ping/pong ──────────────────────────────────────────────
      // Send a ping every 30s. If two consecutive pings go unanswered the
      // connection is considered dead and forcibly closed.
      let missedPongs = 0;
      const pingInterval = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          clearInterval(pingInterval);
          return;
        }
        missedPongs++;
        if (missedPongs > 1) {
          logger.warn('Client missed 2 pongs — terminating dead connection');
          clearInterval(pingInterval);
          ws.terminate();
          return;
        }
        ws.ping();
      }, 30_000);

      ws.on('pong', () => {
        missedPongs = 0; // client is alive
      });
      // ────────────────────────────────────────────────────────────────────

      ws.on('message', async (message: string) => {
        telemetry.recordWsMessageReceived();
        try {
          const payload = JSON.parse(message);
          if (payload.action === 'subscribe' && Array.isArray(payload.symbols)) {
            const initialQuotes: Record<string, TickData> = {};
            
            // Register symbols locally and subscribe to Pub/Sub
            for (const sym of payload.symbols) {
              connection.subscribedSymbols.add(sym);
              this.subscribeToSymbolChannel(sym);
            }

            // Sync subscription counts
            this.syncTelemetrySubscriptions();

            // Fetch latest quotes from Redis Hash cache
            const redis = getRedisClient();
            try {
              await Promise.all(payload.symbols.map(async (sym) => {
                const cached = await redis.hget('market:quotes', sym);
                if (cached) {
                  initialQuotes[sym] = JSON.parse(cached) as TickData;
                }
              }));
            } catch (cacheErr) {
              logger.error({ err: cacheErr }, 'Error fetching initial quotes from Redis');
            }

            // Send initial quotes for the newly subscribed symbols immediately
            if (Object.keys(initialQuotes).length > 0 && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'quotes', data: initialQuotes }));
              telemetry.recordWsMessageSent();
            }
            logger.info({ symbols: payload.symbols }, 'Client subscribed');
          } else if (payload.action === 'unsubscribe' && Array.isArray(payload.symbols)) {
            for (const sym of payload.symbols) {
              connection.subscribedSymbols.delete(sym);
            }
            this.syncTelemetrySubscriptions();
            logger.info({ symbols: payload.symbols }, 'Client unsubscribed');
          }
        } catch (err) {
          logger.warn({ err, message }, 'Invalid message received from client');
        }
      });

      ws.on('close', () => {
        logger.info('Client disconnected');
        clearInterval(pingInterval);
        this.connections.delete(connection);
        telemetry.recordWsConnectionChange(this.connections.size);
        this.syncTelemetrySubscriptions();
      });

      ws.on('error', (err) => {
        logger.error({ err }, 'WebSocket connection error');
        clearInterval(pingInterval);
        this.connections.delete(connection);
        telemetry.recordWsConnectionChange(this.connections.size);
        this.syncTelemetrySubscriptions();
      });
    });
  }

  private syncTelemetrySubscriptions() {
    let total = 0;
    for (const conn of this.connections) {
      total += conn.subscribedSymbols.size;
    }
    telemetry.recordWsSubscription(total);
  }

  private subscribeToSymbolChannel(symbol: string) {
    const channel = `market:ticks:${symbol}`;
    if (!this.activeRedisSubscriptions.has(channel)) {
      this.activeRedisSubscriptions.add(channel);
      this.pubsubClient.subscribe(channel).catch((err: any) => {
        logger.error({ err, channel }, 'Failed to subscribe to Redis PubSub channel');
        this.activeRedisSubscriptions.delete(channel);
      });
    }
  }

  private broadcastUpdate(symbol: string, tick: TickData) {
    // Update local memory cache so REST API fallback reads are fast
    this.quoteCache.set(symbol, tick);

    // Broadcast to subscribed client connections
    const updateMsg = JSON.stringify({
      type: 'update',
      symbol,
      data: tick,
    });

    for (const conn of this.connections) {
      if (conn.subscribedSymbols.has(symbol) && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(updateMsg);
        telemetry.recordWsMessageSent();
      }
    }
  }

  public updateQuote(symbol: string, tick: TickData) {
    // Backward compatibility: calls write to Redis PubSub now
    const redis = getRedisClient();
    redis.hset('market:quotes', symbol, JSON.stringify(tick)).catch(() => {});
    redis.publish(`market:ticks:${symbol}`, JSON.stringify(tick)).catch(() => {});
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


