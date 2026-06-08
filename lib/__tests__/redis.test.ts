import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getRedisClient, createRedisPubSubClient, isRedisMock } from '../redis';

describe('Redis Connection & Mock Client', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('provides a client instance', () => {
    const client = getRedisClient();
    expect(client).toBeDefined();
    expect(isRedisMock()).toBe(true); // Should fallback to mock in test env without REDIS_URL
  });

  it('supports basic GET and SET operations', async () => {
    const client = getRedisClient();
    await client.set('test-key', 'test-value');
    const val = await client.get('test-key');
    expect(val).toBe('test-value');
  });

  it('supports HSET and HGET operations', async () => {
    const client = getRedisClient();
    await client.hset('test-hash', 'field-1', 'value-1');
    const val = await client.hget('test-hash', 'field-1');
    expect(val).toBe('value-1');
  });

  it('supports HGETALL operations', async () => {
    const client = getRedisClient();
    await client.hset('test-hash-2', 'f1', 'v1');
    await client.hset('test-hash-2', 'f2', 'v2');
    const all = await client.hgetall('test-hash-2');
    expect(all).toEqual({ f1: 'v1', f2: 'v2' });
  });

  it('supports PubSub publish and subscribe routing', async () => {
    const pubClient = getRedisClient();
    const subClient = createRedisPubSubClient();

    const messagesReceived: string[] = [];
    const callback = (channel: string, message: string) => {
      messagesReceived.push(message);
    };

    await subClient.subscribe('channel-1');
    subClient.on('message', callback);

    await pubClient.publish('channel-1', 'hello world');

    expect(messagesReceived).toContain('hello world');
  });
});
