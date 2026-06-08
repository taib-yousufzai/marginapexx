import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'redis-client' });

// Simple In-Memory Mock Redis for graceful fallback
class MockRedis {
  private store: Map<string, any> = new Map();
  private listeners: Map<string, Set<(channel: string, message: string) => void>> = new Map();

  public async get(key: string): Promise<string | null> {
    const val = this.store.get(key);
    return typeof val === 'string' ? val : null;
  }

  public async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  public async hset(key: string, field: string, value: string): Promise<number> {
    if (!this.store.has(key)) {
      this.store.set(key, new Map());
    }
    const hash = this.store.get(key) as Map<string, string>;
    const isNew = !hash.has(field);
    hash.set(field, value);
    return isNew ? 1 : 0;
  }

  public async hget(key: string, field: string): Promise<string | null> {
    const hash = this.store.get(key);
    if (hash instanceof Map) {
      return hash.get(field) || null;
    }
    return null;
  }

  public async hgetall(key: string): Promise<Record<string, string>> {
    const hash = this.store.get(key);
    const result: Record<string, string> = {};
    if (hash instanceof Map) {
      for (const [k, v] of hash.entries()) {
        result[k] = v;
      }
    }
    return result;
  }

  public async publish(channel: string, message: string): Promise<number> {
    const channelListeners = this.listeners.get(channel);
    if (channelListeners) {
      channelListeners.forEach(cb => cb(channel, message));
      return channelListeners.size;
    }
    return 0;
  }

  public async subscribe(channel: string): Promise<'OK'> {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    return 'OK';
  }

  public on(event: string, callback: (...args: any[]) => void) {
    if (event === 'message') {
      // Direct message routing logic
      const messageHandler = (channel: string, msg: string) => {
        callback(channel, msg);
      };
      // Register listener for all current mock channels
      for (const channel of this.listeners.keys()) {
        this.listeners.get(channel)?.add(messageHandler);
      }
    }
  }

  public async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  public quit() {
    this.store.clear();
    this.listeners.clear();
  }

  // To support duplicate() for creating separate subscription connections
  public duplicate() {
    return this;
  }
}

const redisUrl = process.env.REDIS_URL;
let redisClient: any;
let isMock = false;

if (redisUrl) {
  try {
    logger.info('Connecting to Redis instance...');
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          logger.warn('Redis connection failed, switching to in-memory Mock client.');
          redisClient = new MockRedis();
          isMock = true;
          return null; // Stop retrying
        }
        return Math.min(times * 100, 2000);
      }
    });

    redisClient.on('error', (err: any) => {
      logger.error({ err }, 'Redis connection error');
    });
  } catch (err) {
    logger.warn({ err }, 'Could not initialize Redis. Falling back to Mock.');
    redisClient = new MockRedis();
    isMock = true;
  }
} else {
  logger.info('No REDIS_URL configured. Using in-memory MockRedis.');
  redisClient = new MockRedis();
  isMock = true;
}

export function getRedisClient() {
  return redisClient;
}

export function createRedisPubSubClient() {
  if (isMock) {
    return redisClient; // Mock client handles both commands and pub/sub in a single local object
  }
  return new Redis(redisUrl || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}

export function isRedisMock() {
  return isMock;
}
