import WebSocket from 'ws';
import pino from 'pino';
import { DbBatchWriter } from './dbWriter.ts';
import type { TickData } from './dbWriter.ts';
import { getAdminClient } from '../../lib/adminClient.ts';

const BINANCE_WS_URL =
  'wss://stream.binance.com:9443/stream?streams=' +
  'btcusdt@ticker/ethusdt@ticker/bnbusdt@ticker/solusdt@ticker';

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
  private attempt = 0;
  private stopping = false;

  constructor(dbWriter: DbBatchWriter) {
    this.dbWriter = dbWriter;
  }

  public start(): void {
    if (!this.ws) {
      this.ensureInstrumentsExist().then(() => {
        this.connect();
      });
    }
  }

  private async ensureInstrumentsExist(): Promise<void> {
    const admin = getAdminClient();
    const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'BTC', 'ETH', 'BNB', 'SOL'];
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private connect(): void {
    this.ws = new WebSocket(BINANCE_WS_URL);

    this.ws.on('open', () => {
      this.attempt = 0;
      logger.info('Connected to Binance WebSocket');
    });

    this.ws.on('message', (data) => {
      this.handleMessage(data.toString());
    });

    this.ws.on('error', (err) => {
      logger.error({ err }, 'WebSocket error');
    });

    this.ws.on('close', () => {
      if (!this.stopping) {
        logger.warn('Disconnected');
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.stopping) return;
    this.attempt++;
    const delay = Math.min(this.attempt * 1000, 30000);
    logger.info({ delay }, 'Scheduling Binance WebSocket reconnect');
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
      
      // Also upsert short symbol (e.g. SOL)
      const shortSymbol = result.symbol.replace('USDT', '');
      this.dbWriter.addTick(shortSymbol, result.tickData);
    } catch (err) {
      logger.warn({ err, raw }, 'Failed to parse Binance stream message');
    }
  }
}
