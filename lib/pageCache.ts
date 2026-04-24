/**
 * Simple in-memory page data cache.
 * Stores the last fetched data for each page so switching back to a page
 * shows the previous data instantly while fresh data loads in the background.
 *
 * Usage:
 *   // On mount, load from cache first:
 *   const cached = pageCache.get<MyData>('orders');
 *   if (cached) setData(cached);
 *
 *   // After fetch, update cache:
 *   pageCache.set('orders', freshData);
 */

type CacheEntry<T> = { data: T; timestamp: number };

class PageCache {
  private store = new Map<string, CacheEntry<unknown>>();

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    return entry ? (entry.data as T) : null;
  }

  set<T>(key: string, data: T): void {
    this.store.set(key, { data, timestamp: Date.now() });
  }

  clear(key: string): void {
    this.store.delete(key);
  }
}

export const pageCache = new PageCache();
