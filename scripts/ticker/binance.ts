import WebSocket from 'ws';
import pino from 'pino';
import { DbBatchWriter } from './dbWriter.ts';
import type { TickData } from './dbWriter.ts';
import { getAdminClient } from '../../lib/adminClient.ts';

const BINANCE_WS_URL =
  'wss://stream.binance.com:443/stream?streams=' +
  'btcusdt@ticker/ethusdt@ticker/bnbusdt@ticker/solusdt@ticker/xrpusdt@ticker/dogeusdt@ticker/adausdt@ticker/maticusdt@ticker';

const HEARTBEAT_INTERVAL_MS = 30_000; // 30 seconds — detect stale connections
const STABLE_CONNECTION_MS  = 60_000; // Reset attempt counter after 60s stable

const logger = pino({ name: 'binance-ticker' });

/**
 * Parses a raw Binance combined-stream message string.
 * Returns `{ symbol, tickData }` for valid `24hrTicker` events, or `null` otherwise.
 * Exported as a pure function so it can be property-tested independently.
 */
export function parseBinanceTicker(raw: string): { symbol: string; tickData: TickData } | null {
  const payload = JSON.parse(raw);

  // Only handle 24hrTicker events from the combined stream
  if (payload.data?.e !== '24hrTicker') {
    return null;
  }

  const data = payload.data;
  const symbol: string = data.s;

  const tickData: TickData = {
    last_price: parseFloat(data.c),
    ohlc: {
      open:  parseFloat(data.o),
      high:  parseFloat(data.h),
      low:   parseFloat(data.l),
      close: parseFloat(data.x),
    },
    volume:    Math.round(parseFloat(data.v)),
    timestamp: new Date(),
  };

  return { symbol, tickData };
}

export class BinanceTicker {
  private dbWriter: DbBatchWriter;
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private stableTimer: NodeJS.Timeout | null = null;
  private attempt = 0;
  private stopping = false;
  private isConnected = false;

  constructor(dbWriter: DbBatchWriter) {
    this.dbWriter = dbWriter;
  }

  public start(): void {
    if (!this.ws) {
      this.ensureInstrumentsExist()
        .catch((err) => {
          logger.warn({ err }, 'ensureInstrumentsExist failed — proceeding to connect anyway');
        })
        .finally(() => {
          this.connect();
        });
    }
  }

  /** Exposed for health endpoint reporting */
  public get connected(): boolean {
    return this.isConnected;
  }

  private async ensureInstrumentsExist(): Promise<void> {
    const admin = getAdminClient();
    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'MATICUSDT', 'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'MATIC'];
    const rows = symbols.map(sym => ({
      id: sym,
      instrument_token: 0,
      tradingsymbol: sym,
      exchange: 'CRYPTO',
      instrument_type: 'CRYPTO',
      segment: 'CRYPTO',
      updated_at: new Date().toISOString()
    }));

    try {
      const { error } = await admin
        .from('instruments')
        .upsert(rows, { onConflict: 'id' });
      if (error) {
        logger.error({ error }, 'Failed to upsert crypto instruments');
      } else {
        logger.info('Ensured crypto instruments exist in instruments table');
      }
    } catch (err) {
      logger.error({ err }, 'Error checking/upserting crypto instruments');
    }
  }

  public stop(): void {
    this.stopping = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }

  private clearTimers(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer);  this.reconnectTimer = null; }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.stableTimer)    { clearTimeout(this.stableTimer);     this.stableTimer    = null; }
  }

  private connect(): void {
    this.ws = new WebSocket(BINANCE_WS_URL);

    this.ws.on('open', () => {
      this.isConnected = true;
      logger.info('Connected to Binance WebSocket');

      // Reset attempt counter after a stable 60-second connection.
      // Prevents slow reconnects after the connection has been healthy for a while.
      this.stableTimer = setTimeout(() => {
        this.attempt = 0;
        logger.debug('Binance connection stable — reset reconnect attempt counter');
      }, STABLE_CONNECTION_MS);

      // Heartbeat: send a ping every 30s. If the server doesn't pong back
      // before the next ping, the connection is considered dead and terminated.
      let pongReceived = true;
      this.heartbeatTimer = setInterval(() => {
        if (!pongReceived) {
          logger.warn('Binance WebSocket missed pong — terminating stale connection');
          this.ws?.terminate(); // triggers 'close', which schedules reconnect
          return;
        }
        pongReceived = false;
        this.ws?.ping();
      }, HEARTBEAT_INTERVAL_MS);

      this.ws!.on('pong', () => {
        pongReceived = true;
      });
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('error', (err) => {
      logger.error({ err }, 'Binance WebSocket error');
    });

    this.ws.on('close', () => {
      this.isConnected = false;
      this.clearTimers();
      if (!this.stopping) {
        logger.warn('Disconnected from Binance — scheduling reconnect');
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.stopping) return;
    this.attempt++;
    const delay = Math.min(this.attempt * 1000, 30_000); // cap at 30s
    logger.info({ delay, attempt: this.attempt }, 'Scheduling Binance WebSocket reconnect');
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleMessage(raw: string): void {
    try {
      const result = parseBinanceTicker(raw);
      if (result === null) return;

      // Upsert standard symbol (e.g. SOLUSDT)
      this.dbWriter.addTick(result.symbol, result.tickData);

      // Also upsert short symbol (e.g. SOL) so orders using abbreviated symbols match
      const shortSymbol = result.symbol.replace('USDT', '');
      this.dbWriter.addTick(shortSymbol, result.tickData);
    } catch (err) {
      logger.warn({ err, raw }, 'Failed to parse Binance stream message');
    }
  }
}
