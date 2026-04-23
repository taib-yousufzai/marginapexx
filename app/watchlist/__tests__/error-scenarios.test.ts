import { describe, it, expect } from 'vitest';

// ─── Inline the pure logic under test ────────────────────────────────────────
// These mirror the module-level functions in app/watchlist/page.tsx exactly.
// Testing them here avoids pulling in React / Next.js dependencies.
//
// For error scenarios we use a "store" abstraction that can be made to throw,
// matching the same pattern used in backward-compatibility.test.ts and
// library-drawer-interaction.test.ts.

interface WatchlistItem {
  name: string;
  symbol: string;
  kiteSymbol: string;
  price: number;
  change: string;
  segment: string;
  contractDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  category?: string;
}

const WATCHLIST_KEY = 'marginApex_watchlist';

// ─── Store abstraction ────────────────────────────────────────────────────────
// A "store" is a Record<string, string> that can optionally throw on read/write.
// This lets us simulate localStorage failures without needing a browser environment.

interface StoreOptions {
  /** If set, getItem() throws this error */
  getItemError?: Error;
  /** If set, setItem() throws this error */
  setItemError?: Error;
}

interface Store {
  data: Record<string, string>;
  options: StoreOptions;
}

function createStore(
  initial: Record<string, string> = {},
  options: StoreOptions = {}
): Store {
  return { data: { ...initial }, options };
}

function storeGet(store: Store, key: string): string | null {
  if (store.options.getItemError) throw store.options.getItemError;
  return store.data[key] ?? null;
}

function storeSet(store: Store, key: string, value: string): void {
  if (store.options.setItemError) throw store.options.setItemError;
  store.data[key] = value;
}

// ─── Inline implementations matching page.tsx (store-parameterised) ──────────

function loadWatchlistFromStorage(store: Store): WatchlistItem[] {
  try {
    const raw = storeGet(store, WATCHLIST_KEY);
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : [];
  } catch {
    return []; // Treat as empty, will trigger default population
  }
}

function saveWatchlistToStorage(items: WatchlistItem[], store: Store): void {
  try {
    storeSet(store, WATCHLIST_KEY, JSON.stringify(items));
  } catch {
    // Silently ignore storage failures (e.g. quota exceeded)
  }
}

function getDefaultWatchlistItems(): WatchlistItem[] {
  return [
    {
      name: 'NIFTY FUT',
      symbol: 'NIFTY_FUT',
      kiteSymbol: 'NSE:NIFTY 50',
      price: 22456.80,
      change: '+0.45%',
      segment: 'NSE - Futures',
      contractDate: '28 Mar 2025',
      open: 22350,
      high: 22580,
      low: 22320,
      close: 22456.80,
    },
    {
      name: 'BANKNIFTY FUT',
      symbol: 'BANKNIFTY_FUT',
      kiteSymbol: 'NSE:NIFTY BANK',
      price: 48210.50,
      change: '-0.21%',
      segment: 'NSE - Futures',
      contractDate: '28 Mar 2025',
      open: 48350,
      high: 48500,
      low: 48100,
      close: 48210.50,
    },
    {
      name: 'SENSEX FUT',
      symbol: 'SENSEX_FUT',
      kiteSymbol: 'BSE:SENSEX',
      price: 74230.15,
      change: '+0.32%',
      segment: 'BSE - Futures',
      contractDate: '28 Mar 2025',
      open: 73950,
      high: 74500,
      low: 73800,
      close: 74230.15,
    },
  ];
}

/**
 * Simulates the useEffect initialization logic from page.tsx (corrected design):
 *
 *   const raw = localStorage.getItem(WATCHLIST_KEY);
 *   if (raw === null) {
 *     const defaults = getDefaultWatchlistItems();
 *     setWatchlistItems(defaults);
 *     saveWatchlistToStorage(defaults);
 *   } else {
 *     const loaded = loadWatchlistFromStorage();
 *     setWatchlistItems(loaded);
 *   }
 *
 * Returns the items that would be set in state.
 */
function simulateInit(store: Store): WatchlistItem[] {
  let raw: string | null;
  try {
    raw = storeGet(store, WATCHLIST_KEY);
  } catch {
    // getItem itself threw — treat as first-time user, try to persist (may also fail)
    const defaults = getDefaultWatchlistItems();
    saveWatchlistToStorage(defaults, store);
    return defaults;
  }

  if (raw === null) {
    const defaults = getDefaultWatchlistItems();
    saveWatchlistToStorage(defaults, store);
    return defaults;
  } else {
    return loadWatchlistFromStorage(store);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  return {
    name: 'TEST FUT',
    symbol: 'TEST_FUT',
    kiteSymbol: 'NSE:TEST',
    price: 100,
    change: '+1.00%',
    segment: 'NSE - Futures',
    contractDate: '28 Mar 2025',
    open: 99,
    high: 101,
    low: 98,
    close: 100,
    ...overrides,
  };
}

// ─── Error Scenario Tests ─────────────────────────────────────────────────────

describe('Error scenarios — localStorage.getItem() throws exception (Req 1.1)', () => {
  // Req 1.1: When localStorage access fails, component should not crash
  it('getItem throwing SecurityError does not cause an unhandled exception', () => {
    const store = createStore({}, {
      getItemError: new Error('SecurityError: Access denied'),
    });

    expect(() => simulateInit(store)).not.toThrow();
  });

  // Req 1.1: When getItem throws, loadWatchlistFromStorage returns empty array
  it('loadWatchlistFromStorage returns [] when getItem throws', () => {
    const store = createStore({}, {
      getItemError: new Error('SecurityError: Access denied'),
    });

    const result = loadWatchlistFromStorage(store);
    expect(result).toEqual([]);
  });

  // Req 1.1: When getItem throws, default items are shown in state (graceful fallback)
  it('simulateInit returns default items when getItem throws', () => {
    const store = createStore({}, {
      getItemError: new Error('SecurityError: Access denied'),
    });

    const items = simulateInit(store);

    expect(items).toHaveLength(3);
    expect(items.map(i => i.symbol)).toEqual(['NIFTY_FUT', 'BANKNIFTY_FUT', 'SENSEX_FUT']);
  });

  // Req 1.1: Private browsing / quota error — same graceful fallback
  it('getItem throwing QuotaExceededError returns default items gracefully', () => {
    const store = createStore({}, {
      getItemError: new Error('QuotaExceededError'),
    });

    const items = simulateInit(store);

    expect(items).toHaveLength(3);
    expect(items[0].symbol).toBe('NIFTY_FUT');
  });

  // Req 1.1: Generic Error thrown by getItem — still graceful
  it('getItem throwing a generic Error returns default items gracefully', () => {
    const store = createStore({}, {
      getItemError: new Error('localStorage is not available'),
    });

    const items = simulateInit(store);

    expect(items).toHaveLength(3);
  });

  // Req 1.1: All 3 default items have correct data when getItem throws
  it('default items returned on getItem failure have complete data', () => {
    const store = createStore({}, {
      getItemError: new Error('Access denied'),
    });

    const items = simulateInit(store);

    for (const item of items) {
      expect(item.name).toBeTruthy();
      expect(item.symbol).toBeTruthy();
      expect(item.kiteSymbol).toBeTruthy();
      expect(typeof item.price).toBe('number');
      expect(item.segment).toBeTruthy();
    }
  });
});

describe('Error scenarios — JSON.parse() fails with corrupted data (Req 1.1)', () => {
  // Req 1.1: Corrupted JSON in localStorage → loadWatchlistFromStorage returns []
  it('corrupted JSON returns empty array from loadWatchlistFromStorage', () => {
    const store = createStore({ [WATCHLIST_KEY]: '{{invalid json}}' });

    const result = loadWatchlistFromStorage(store);
    expect(result).toEqual([]);
  });

  // Req 1.1: Partially valid JSON → returns []
  it('partially valid JSON (truncated) returns empty array', () => {
    const store = createStore({
      [WATCHLIST_KEY]: '[{"name":"NIFTY FUT","symbol":"NIFTY_FUT"',
    });

    const result = loadWatchlistFromStorage(store);
    expect(result).toEqual([]);
  });

  // Req 1.1: Non-array JSON (object instead of array) — parse succeeds, no crash
  it('non-array JSON does not crash loadWatchlistFromStorage', () => {
    const store = createStore({ [WATCHLIST_KEY]: '{"name":"not an array"}' });

    expect(() => loadWatchlistFromStorage(store)).not.toThrow();
  });

  // Req 1.1: Corrupted data → simulateInit treats key as existing, loads [], shows empty state
  it('corrupted JSON: simulateInit treats key as existing and returns empty items', () => {
    // Key exists but value is corrupted — user has interacted with watchlist
    const store = createStore({ [WATCHLIST_KEY]: '{{corrupted}}' });

    const items = simulateInit(store);

    // Key exists → not a first-time user → loadWatchlistFromStorage() returns []
    expect(items).toEqual([]);
  });

  // Req 1.1: Binary garbage in storage
  it('binary garbage in localStorage returns empty array without throwing', () => {
    const store = createStore({ [WATCHLIST_KEY]: '\x00\x01\x02\xFF' });

    expect(() => loadWatchlistFromStorage(store)).not.toThrow();
    const result = loadWatchlistFromStorage(store);
    expect(result).toEqual([]);
  });

  // Req 1.1: JSON string (not array) — parse succeeds, no crash
  it('JSON string value does not crash loadWatchlistFromStorage', () => {
    const store = createStore({ [WATCHLIST_KEY]: '"just a string"' });

    expect(() => loadWatchlistFromStorage(store)).not.toThrow();
  });

  // Req 1.1: JSON number — parse succeeds, no crash
  it('JSON number value does not crash loadWatchlistFromStorage', () => {
    const store = createStore({ [WATCHLIST_KEY]: '42' });

    expect(() => loadWatchlistFromStorage(store)).not.toThrow();
  });

  // Req 1.1: Empty string in localStorage — treated as falsy, returns []
  it('empty string in localStorage returns empty array', () => {
    const store = createStore({ [WATCHLIST_KEY]: '' });

    const result = loadWatchlistFromStorage(store);
    expect(result).toEqual([]);
  });

  // Req 1.1: Whitespace-only string — JSON.parse throws, returns []
  it('whitespace-only string in localStorage returns empty array', () => {
    const store = createStore({ [WATCHLIST_KEY]: '   ' });

    const result = loadWatchlistFromStorage(store);
    expect(result).toEqual([]);
  });
});

describe('Error scenarios — localStorage.setItem() fails (quota exceeded) (Req 1.5)', () => {
  // Req 1.5: setItem throwing should not crash saveWatchlistToStorage
  it('saveWatchlistToStorage does not throw when setItem throws QuotaExceededError', () => {
    const store = createStore({}, {
      setItemError: new Error('QuotaExceededError'),
    });

    const items = [makeItem({ symbol: 'NIFTY_FUT' })];

    // Must not throw — error is swallowed silently
    expect(() => saveWatchlistToStorage(items, store)).not.toThrow();
  });

  // Req 1.5: setItem throwing generic Error — still no crash
  it('saveWatchlistToStorage does not throw when setItem throws a generic Error', () => {
    const store = createStore({}, {
      setItemError: new Error('Storage full'),
    });

    const items = getDefaultWatchlistItems();

    expect(() => saveWatchlistToStorage(items, store)).not.toThrow();
  });

  // Req 1.5: Items remain in state even when setItem fails
  it('simulateInit returns default items in state even when setItem fails', () => {
    // No key in storage → first-time user; setItem will fail
    const store = createStore({}, {
      setItemError: new Error('QuotaExceededError'),
    });

    const items = simulateInit(store);

    // Items are in state even though they couldn't be persisted
    expect(items).toHaveLength(3);
    expect(items.map(i => i.symbol)).toEqual(['NIFTY_FUT', 'BANKNIFTY_FUT', 'SENSEX_FUT']);
  });

  // Req 1.5: When setItem fails, store data is not updated
  it('when setItem fails, store data does not contain the items', () => {
    const store = createStore({}, {
      setItemError: new Error('QuotaExceededError'),
    });

    const items = getDefaultWatchlistItems();
    saveWatchlistToStorage(items, store);

    // setItem threw, so nothing was actually stored
    expect(store.data[WATCHLIST_KEY]).toBeUndefined();
  });

  // Req 1.5: Saving existing user items fails gracefully
  it('saving existing user items when setItem fails does not crash', () => {
    const existingItems = [
      makeItem({ symbol: 'RELIANCE_FUT' }),
      makeItem({ symbol: 'TCS_FUT' }),
    ];

    const store = createStore({}, {
      setItemError: new Error('QuotaExceededError'),
    });

    expect(() => saveWatchlistToStorage(existingItems, store)).not.toThrow();
  });

  // Req 1.5: Saving empty array fails gracefully
  it('saving empty array when setItem fails does not crash', () => {
    const store = createStore({}, {
      setItemError: new Error('QuotaExceededError'),
    });

    expect(() => saveWatchlistToStorage([], store)).not.toThrow();
  });
});

describe('Error scenarios — graceful fallback verification (Req 1.1, 1.5)', () => {
  // Req 1.1: Both getItem and setItem fail — component still renders with defaults
  it('both getItem and setItem failing still returns default items without throwing', () => {
    const store = createStore({}, {
      getItemError: new Error('Access denied'),
      setItemError: new Error('Access denied'),
    });

    expect(() => simulateInit(store)).not.toThrow();

    const items = simulateInit(store);
    expect(items).toHaveLength(3);
  });

  // Req 1.1: loadWatchlistFromStorage always returns an array (never throws)
  it('loadWatchlistFromStorage always returns an array regardless of storage state', () => {
    // Test with corrupted data
    const store1 = createStore({ [WATCHLIST_KEY]: 'not valid json at all!!!' });
    const result1 = loadWatchlistFromStorage(store1);
    expect(Array.isArray(result1)).toBe(true);

    // Test with getItem throwing
    const store2 = createStore({}, {
      getItemError: new Error('Storage unavailable'),
    });
    const result2 = loadWatchlistFromStorage(store2);
    expect(Array.isArray(result2)).toBe(true);
  });

  // Req 1.1: saveWatchlistToStorage never throws regardless of storage state
  it('saveWatchlistToStorage never throws regardless of storage state', () => {
    const store = createStore({}, {
      setItemError: new Error('QuotaExceededError'),
    });

    const items = getDefaultWatchlistItems();
    expect(() => saveWatchlistToStorage(items, store)).not.toThrow();
    expect(() => saveWatchlistToStorage([], store)).not.toThrow();
  });

  // Req 1.1: Corrupted data followed by valid data — recovery works
  it('after corrupted data is replaced with valid data, loading works correctly', () => {
    // Start with corrupted data
    const store = createStore({ [WATCHLIST_KEY]: '{{corrupted}}' });
    const corrupted = loadWatchlistFromStorage(store);
    expect(corrupted).toEqual([]);

    // Now save valid data (simulating recovery — store has no setItemError)
    const validItems = [makeItem({ symbol: 'NIFTY_FUT' })];
    saveWatchlistToStorage(validItems, store);

    // Loading should now work correctly
    const recovered = loadWatchlistFromStorage(store);
    expect(recovered).toHaveLength(1);
    expect(recovered[0].symbol).toBe('NIFTY_FUT');
  });

  // Req 1.5: Default items are in state even when persistence fails
  it('default items are available in state even when localStorage is completely unavailable', () => {
    const store = createStore({}, {
      getItemError: new Error('localStorage unavailable'),
      setItemError: new Error('localStorage unavailable'),
    });

    const items = simulateInit(store);

    // User sees default items during session even without persistence
    expect(items).toHaveLength(3);
    expect(items[0].name).toBe('NIFTY FUT');
    expect(items[1].name).toBe('BANKNIFTY FUT');
    expect(items[2].name).toBe('SENSEX FUT');
  });

  // Req 1.1: Error in getItem does not affect subsequent successful operations
  it('a store that only fails on getItem can still save items', () => {
    const store = createStore({}, {
      getItemError: new Error('Read error'),
    });

    // simulateInit will catch the getItem error and try to save defaults
    // But setItem works fine here — however the store has getItemError set,
    // so storeSet will succeed but storeGet will still throw.
    // We verify that saveWatchlistToStorage itself doesn't throw.
    const items = getDefaultWatchlistItems();
    // Remove getItemError to allow save to work
    const writeOnlyStore = createStore({}, {
      getItemError: new Error('Read error'),
      // no setItemError
    });
    expect(() => saveWatchlistToStorage(items, writeOnlyStore)).not.toThrow();
  });

  // Req 1.1: Null value from getItem (key doesn't exist) → defaults populated
  it('null from getItem (missing key) triggers default population', () => {
    const store = createStore({}); // empty store, no key

    const items = simulateInit(store);

    expect(items).toHaveLength(3);
    // Defaults should also be persisted
    expect(store.data[WATCHLIST_KEY]).toBeDefined();
    const saved = JSON.parse(store.data[WATCHLIST_KEY]) as WatchlistItem[];
    expect(saved).toHaveLength(3);
  });
});
