import WebSocket from 'ws';
import pino from 'pino';
import { DbBatchWriter, TickData } from './dbWriter.ts';

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
    volume:    parseFloat(data.v),
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

  public start(): void {}

  public stop(): void {}

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

  private scheduleReconnect(): void {}

  private handleMessage(raw: string): void {
    try {
      const result = parseBinanceTicker(raw);
      if (result === null) return;
      this.dbWriter.addTick(result.symbol, result.tickData);
    } catch (err) {
      logger.warn({ err, raw }, 'Failed to parse Binance stream message');
    }
  }
}
