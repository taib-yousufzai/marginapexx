import dotenv from 'dotenv';
import path from 'path';
import http from 'http';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// @ts-ignore
import { KiteTicker } from 'kiteconnect';
import pino from 'pino';
import { getSharedKiteSession } from '../../lib/kiteSession.ts';
import { SubscriptionManager } from './subscriptionManager.ts';
import { DbBatchWriter } from './dbWriter.ts';
import { TickProcessor } from './processor.ts';
import { BinanceTicker } from './binance.ts';

const logger = pino({ name: 'ticker-daemon', level: process.env.LOG_LEVEL || 'info' });

class TickerDaemon {
  private ticker: any = null;
  private subscriptionManager: SubscriptionManager;
  private dbWriter: DbBatchWriter;
  private processor: TickProcessor;
  private binanceTicker: BinanceTicker;
  
  private subscriptionTimer: NodeJS.Timeout | null = null;
  private isReconnecting = false;
  private isStopping = false;

  constructor() {
    this.subscriptionManager = new SubscriptionManager();
    // Flush to DB once per second
    this.dbWriter = new DbBatchWriter(1000);
    this.processor = new TickProcessor(this.subscriptionManager, this.dbWriter);
    this.binanceTicker = new BinanceTicker(this.dbWriter);
  }

  private async initKite() {
    if (this.ticker || this.isReconnecting) return;

    try {
      const session = await getSharedKiteSession();
      if (!session || !session.accessToken) {
        logger.warn('No active Kite session found in database. Kite ticker will retry once session is active.');
        return;
      }

      const apiKey = process.env.KITE_API_KEY;
      if (!apiKey) {
        logger.error('KITE_API_KEY not configured in env.');
        return;
      }

      logger.info({ user: session.kiteUserId }, 'Found active Kite session. Connecting Kite Ticker...');

      this.ticker = new KiteTicker({
        api_key: apiKey,
        access_token: session.accessToken,
      });

      this.setupTickerCallbacks();
      this.ticker.connect();
    } catch (err) {
      logger.error({ err }, 'Failed to initialize Kite Ticker');
    }
  }

  public async start() {
    logger.info('Initializing Ticker Daemon...');
    
    // 1. Start database batch writer
    this.dbWriter.start();

    // 2. Start Binance WebSocket Ticker
    this.binanceTicker.start();

    // 3. Try to initialize Kite Ticker
    await this.initKite();

    // 4. Setup periodic subscription checker and Kite session checker (every 10 seconds)
    this.subscriptionTimer = setInterval(async () => {
      if (!this.ticker && !this.isReconnecting) {
        await this.initKite();
      }
      await this.syncSubscriptions();
    }, 10000);

    // 5. Register process shutdown handlers
    this.setupGracefulShutdown();

    // 6. Start dummy HTTP server for Railway health checks
    const port = process.env.PORT || 8080;
    http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    }).listen(port, () => {
      logger.info(`Health check server listening on port ${port}`);
    });
  }

  private setupTickerCallbacks() {
    // Configure auto-reconnect (tries up to 10 times, space 5 seconds apart)
    this.ticker.autoReconnect(true, 10, 5);

    this.ticker.on('connect', () => {
      logger.info('Connected to Kite WebSocket.');
      this.isReconnecting = false;
      this.syncSubscriptions(true); // Force full sync on connect
    });

    this.ticker.on('ticks', (ticks: any[]) => {
      this.processor.processTicks(ticks);
    });

    this.ticker.on('disconnect', (error: any) => {
      logger.warn({ err: error }, 'Kite WebSocket disconnected.');
    });

    this.ticker.on('reconnecting', (interval: number, attempt: number) => {
      logger.info({ attempt, interval }, 'Reconnecting to Kite...');
      this.isReconnecting = true;
    });

    this.ticker.on('noreconnect', () => {
      logger.error('Auto-reconnect failed. Retries exhausted.');
      this.reconnectFromScratch();
    });

    this.ticker.on('error', (error: any) => {
      logger.error({ err: error }, 'Kite Ticker encountered error.');
    });
  }

  /**
   * Syncs active trading instruments in database with active WebSocket subscriptions.
   * Compares the delta to minimize subscribe/unsubscribe messages to Zerodha.
   */
  private async syncSubscriptions(forceSubscribe = false) {
    if (this.isReconnecting || this.isStopping || !this.ticker) return;

    logger.debug('Syncing active instruments with ticker...');
    
    // Fetch latest instruments to track from positions/orders/watchlists
    const activeInstruments = await this.subscriptionManager.getActiveInstruments();
    const activeTokens = activeInstruments.map(item => item.token);

    if (activeTokens.length === 0) {
      logger.debug('No active instruments to subscribe to.');
      return;
    }

    const { toSubscribe, toUnsubscribe } = this.subscriptionManager.calculateSubscriptionDelta(activeTokens);

    try {
      // 1. Process Unsubscriptions
      if (toUnsubscribe.length > 0 && !forceSubscribe) {
        logger.info({ tokens: toUnsubscribe }, 'Unsubscribing from tokens');
        this.ticker.unsubscribe(toUnsubscribe);
      }

      // 2. Process New Subscriptions or Force All on initial connection
      const subscribeList = forceSubscribe ? activeTokens : toSubscribe;
      if (subscribeList.length > 0) {
        logger.info({ count: subscribeList.length }, 'Subscribing to instrument tokens');
        this.ticker.subscribe(subscribeList);
        // Set modeFull to get quotes, volume, open interest, and depth data
        this.ticker.setMode(this.ticker.modeFull, subscribeList);
      }
    } catch (err) {
      logger.error({ err }, 'Error applying subscriptions on ticker');
    }
  }

  private handleCriticalFailure() {
    // Exit process so that container/process manager (PM2/Docker) can restart it with clean state.
    logger.fatal('Critical failure detected. Exiting process...');
    process.exit(1);
  }

  private async reconnectFromScratch() {
    if (this.isStopping) return;

    logger.warn('Attempting a full connection reset in 1 minute to keep process alive...');
    this.isReconnecting = true;

    // 1. Cleanly disconnect existing ticker instance if present
    if (this.ticker) {
      try {
        this.ticker.disconnect();
      } catch (e) {
        // Ignore errors during disconnect
      }
      this.ticker = null;
    }

    // 2. Schedule reconnection after 1 minute (to avoid spamming during market-closed/offline periods)
    setTimeout(async () => {
      if (this.isStopping) return;
      logger.info('Re-initializing KiteTicker connection...');
      this.isReconnecting = false;
      await this.initKite();
    }, 60000);
  }

  private setupGracefulShutdown() {
    const shutdown = async (signal: string) => {
      if (this.isStopping) return;
      this.isStopping = true;
      
      logger.info({ signal }, 'Graceful shutdown initiated...');

      if (this.subscriptionTimer) {
        clearInterval(this.subscriptionTimer);
      }

      try {
        if (this.ticker) {
          logger.info('Disconnecting ticker WebSocket...');
          this.ticker.disconnect();
        }

        // Stop Binance WebSocket Ticker
        logger.info('Stopping Binance WebSocket Ticker...');
        this.binanceTicker.stop();

        // Flush remaining cache to database and stop timer
        await this.dbWriter.stop();
        logger.info('Graceful cleanup completed. Exiting.');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during graceful cleanup. Forcing exit.');
        process.exit(1);
      }
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }
}

// Start the daemon
new TickerDaemon().start().catch((err) => {
  logger.error({ err }, 'Failed to start Ticker Daemon');
  process.exit(1);
});
