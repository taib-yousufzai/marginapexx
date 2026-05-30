import { getAdminClient } from '../../lib/adminClient.ts';
import { processPendingOrdersAndPositions } from '../../lib/orderMatching.ts';
import pino from 'pino';

const logger = pino({ name: 'ticker-db-writer' });

export interface TickData {
  instrument_token: number;
  last_price: number;
  ohlc?: {
    open?: number;
    high?: number;
    low?: number;
    close?: number;
  };
  volume?: number;
  timestamp?: string | Date;
}

export class DbBatchWriter {
  private buffer: Map<string, TickData> = new Map();
  /** Tracks the last price written to DB for each symbol — avoids no-op upserts */
  private lastWrittenPrices: Map<string, number> = new Map();
  private isProcessing = false;
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(intervalMs = 1000) {
    this.intervalMs = intervalMs;
  }

  /**
   * Buffers an incoming tick in memory, overwriting any older tick for the same instrument.
   */
  public addTick(symbolKey: string, tick: TickData) {
    this.buffer.set(symbolKey, tick);
  }

  /**
   * Starts the periodic database write worker.
   */
  public start() {
    logger.info({ intervalMs: this.intervalMs }, 'Starting database batch writer...');
    this.timer = setInterval(() => this.flush(), this.intervalMs);
  }

  /**
   * Stops the database writer and flushes any remaining buffered ticks.
   */
  public async stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await this.flush();
    logger.info('Database batch writer stopped.');
  }

  /**
   * Flushes buffered ticks to public.market_quotes and triggers order matching.
   */
  private async flush() {
    if (this.buffer.size === 0 || this.isProcessing) return;

    this.isProcessing = true;
    const admin = getAdminClient();
    const snapshot = Array.from(this.buffer.entries());
    this.buffer.clear(); // Clear immediately to allow incoming ticks to queue

    try {
      const allQuotes = snapshot.map(([symbolKey, tick]) => {
        const timestamp = tick.timestamp 
          ? (typeof tick.timestamp === 'string' ? tick.timestamp : tick.timestamp.toISOString())
          : new Date().toISOString();

        return {
          id: symbolKey,
          last_price: tick.last_price,
          open: tick.ohlc?.open || null,
          high: tick.ohlc?.high || null,
          low: tick.ohlc?.low || null,
          close: tick.ohlc?.close || null,
          volume: tick.volume || null,
          quote_timestamp: timestamp,
          updated_at: new Date().toISOString(),
        };
      });

      // Upsert all quotes to ensure realtime updates even if price unchanged.
      // This keeps UI timestamp fresh and allows downstream listeners to react.
      const changedQuotes = allQuotes; // retain variable name for later use

      logger.debug({ total: allQuotes.length }, 'Flushing full tick batch to Supabase');

      // 1. Bulk Upsert into Supabase market_quotes table (on conflict id)
      const { error: upsertError } = await admin
        .from('market_quotes')
        .upsert(changedQuotes, { onConflict: 'id' });

      if (upsertError) {
        logger.error({ err: upsertError }, 'Failed to upsert market quotes to database');
        // Put quotes back in buffer to avoid losing data
        for (const [symbolKey, tick] of snapshot) {
          if (!this.buffer.has(symbolKey)) {
            this.buffer.set(symbolKey, tick);
          }
        }
        return;
      }

      // Update last-written price cache on success (even if unchanged)
      for (const q of changedQuotes) {
        this.lastWrittenPrices.set(q.id, q.last_price);
      }

      // 2. Trigger order matching engine (SL/Target + Limit triggers)
      const matchingQuotes = allQuotes.map(q => ({
        id: q.id,
        last_price: q.last_price,
      }));

      try {
        await processPendingOrdersAndPositions(matchingQuotes);
      } catch (err) {
        logger.error({ err }, 'Error executing pending order/position matching engine');
      }

    } catch (err) {
      logger.error({ err }, 'Unexpected error in database batch flush');
    } finally {
      this.isProcessing = false;
    }
  }
}
