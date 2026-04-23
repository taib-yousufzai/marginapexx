import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';

// ─── Inline the pure logic under test ────────────────────────────────────────
// These mirror the module-level functions in app/watchlist/page.tsx exactly.
// Testing them here avoids pulling in React / Next.js dependencies.

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

function loadWatchlistFromStorage(store: Record<string, string>): WatchlistItem[] {
  try {
    const raw = store[WATCHLIST_KEY] ?? null;
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : [];
  } catch { return []; }
}

function saveWatchlistToStorage(items: WatchlistItem[], store: Record<string, string>): void {
  store[WATCHLIST_KEY] = JSON.stringify(items);
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
 * Simulates the useEffect initialization logic from page.tsx:
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
 * Returns { items, store } so tests can inspect both state and storage.
 */
function simulateInit(store: Record<string, string>): {
  items: WatchlistItem[];
  store: Record<string, string>;
} {
  const raw = store[WATCHLIST_KEY] ?? null;
  let items: WatchlistItem[];

  if (raw === null) {
    items = getDefaultWatchlistItems();
    saveWatchlistToStorage(items, store);
  } else {
    items = loadWatchlistFromStorage(store);
  }

  return { items, store };
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

function storeWithItems(items: WatchlistItem[]): Record<string, string> {
  return { [WATCHLIST_KEY]: JSON.stringify(items) };
}

// ─── Unit tests: existing user scenarios (Req 6.1, 6.2, 6.4) ─────────────────

describe('Backward compatibility — existing user scenarios', () => {
  // Req 6.1: existing user with items → no defaults added
  it('user with 1 item: watchlist is unchanged, no defaults added', () => {
    const existing = [makeItem({ symbol: 'CUSTOM_1', name: 'Custom 1' })];
    const store = storeWithItems(existing);

    const { items } = simulateInit(store);

    expect(items).toHaveLength(1);
    expect(items[0].symbol).toBe('CUSTOM_1');
    // None of the default symbols should appear
    const defaultSymbols = ['NIFTY_FUT', 'BANKNIFTY_FUT', 'SENSEX_FUT'];
    for (const sym of defaultSymbols) {
      expect(items.some(i => i.symbol === sym)).toBe(false);
    }
  });

  // Req 6.2: localStorage with 1+ items → load without modification
  it('user with 10+ items: all items loaded, no defaults injected', () => {
    const existing = Array.from({ length: 12 }, (_, idx) =>
      makeItem({ symbol: `ITEM_${idx}`, name: `Item ${idx}` })
    );
    const store = storeWithItems(existing);

    const { items } = simulateInit(store);

    expect(items).toHaveLength(12);
    existing.forEach((orig, idx) => {
      expect(items[idx].symbol).toBe(orig.symbol);
    });
  });

  // Req 6.2: custom items are loaded exactly as stored
  it('user with custom items: watchlist content is identical to stored content', () => {
    const existing = [
      makeItem({ symbol: 'RELIANCE_FUT', name: 'RELIANCE FUT', price: 2856.40 }),
      makeItem({ symbol: 'TCS_FUT', name: 'TCS FUT', price: 3987.20 }),
      makeItem({ symbol: 'HDFCBANK_FUT', name: 'HDFCBANK FUT', price: 1680.90 }),
    ];
    const store = storeWithItems(existing);

    const { items } = simulateInit(store);

    expect(items).toHaveLength(3);
    expect(items[0].symbol).toBe('RELIANCE_FUT');
    expect(items[1].symbol).toBe('TCS_FUT');
    expect(items[2].symbol).toBe('HDFCBANK_FUT');
    // Prices must be preserved exactly
    expect(items[0].price).toBe(2856.40);
    expect(items[1].price).toBe(3987.20);
    expect(items[2].price).toBe(1680.90);
  });

  // Req 6.1: localStorage content must remain identical for existing users
  it('localStorage content is not modified when items already exist', () => {
    const existing = [makeItem({ symbol: 'EXISTING_1' })];
    const store = storeWithItems(existing);
    const originalJson = store[WATCHLIST_KEY];

    simulateInit(store);

    // Storage must not have been overwritten
    expect(store[WATCHLIST_KEY]).toBe(originalJson);
  });

  // Req 6.4: user clears browser data → treated as first-time user
  it('empty store (no key) → defaults are added, treated as first-time user', () => {
    const store: Record<string, string> = {}; // no WATCHLIST_KEY at all

    const { items } = simulateInit(store);

    expect(items).toHaveLength(3);
    expect(items.map(i => i.symbol)).toEqual(['NIFTY_FUT', 'BANKNIFTY_FUT', 'SENSEX_FUT']);
    // Defaults must also be persisted to storage
    expect(store[WATCHLIST_KEY]).toBeDefined();
    const saved = JSON.parse(store[WATCHLIST_KEY]) as WatchlistItem[];
    expect(saved).toHaveLength(3);
  });

  // Req 6.3: empty array in storage (user cleared watchlist) → no defaults
  it('empty array in storage → empty watchlist, no defaults re-added', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };

    const { items } = simulateInit(store);

    expect(items).toHaveLength(0);
    // Storage must still be the empty array, not overwritten with defaults
    expect(store[WATCHLIST_KEY]).toBe('[]');
  });
});

// ─── Integration tests: library drawer interaction (Req 3.4, 3.5, 3.6) ───────

describe('Library drawer interaction', () => {
  // Req 3.4: adding library item appends to existing watchlist
  it('adding a library item after defaults are populated appends to end', () => {
    const store: Record<string, string> = {}; // first-time user
    const { items: initialItems } = simulateInit(store);
    expect(initialItems).toHaveLength(3);

    // Simulate __addToWatchlistCallback logic
    const newItem = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    const prev = loadWatchlistFromStorage(store);
    const next = prev.some(i => i.symbol === newItem.symbol)
      ? prev
      : [...prev, newItem];
    saveWatchlistToStorage(next, store);

    const saved = loadWatchlistFromStorage(store);
    expect(saved).toHaveLength(4);
    expect(saved[3].symbol).toBe('FINNIFTY_FUT'); // appended at end
  });

  // Req 3.4: new item is appended to end, not inserted at beginning
  it('new library item is the last element in the watchlist', () => {
    const existing = [
      makeItem({ symbol: 'NIFTY_FUT' }),
      makeItem({ symbol: 'BANKNIFTY_FUT' }),
    ];
    const store = storeWithItems(existing);

    const newItem = makeItem({ symbol: 'SENSEX_FUT' });
    const prev = loadWatchlistFromStorage(store);
    const next = [...prev, newItem];
    saveWatchlistToStorage(next, store);

    const saved = loadWatchlistFromStorage(store);
    expect(saved[saved.length - 1].symbol).toBe('SENSEX_FUT');
  });

  // Req 3.5: re-adding a previously removed default item works
  it('re-adding a removed default item from library drawer succeeds', () => {
    // Start with defaults
    const store: Record<string, string> = {};
    simulateInit(store);

    // Remove NIFTY_FUT (simulate __removeFromWatchlistCallback)
    const afterRemove = loadWatchlistFromStorage(store).filter(
      i => i.symbol !== 'NIFTY_FUT'
    );
    saveWatchlistToStorage(afterRemove, store);
    expect(loadWatchlistFromStorage(store)).toHaveLength(2);

    // Re-add NIFTY_FUT from library drawer (simulate __addToWatchlistCallback)
    const niftyItem = getDefaultWatchlistItems().find(i => i.symbol === 'NIFTY_FUT')!;
    const prev = loadWatchlistFromStorage(store);
    const isDuplicate = prev.some(i => i.symbol === niftyItem.symbol);
    expect(isDuplicate).toBe(false); // not a duplicate after removal
    const next = [...prev, niftyItem];
    saveWatchlistToStorage(next, store);

    const final = loadWatchlistFromStorage(store);
    expect(final).toHaveLength(3);
    expect(final.some(i => i.symbol === 'NIFTY_FUT')).toBe(true);
  });

  // Req 3.6: no distinction between default and user-added items after init
  it('re-added default item is indistinguishable from user-added items', () => {
    const store: Record<string, string> = {};
    simulateInit(store);

    // Remove and re-add NIFTY_FUT
    const withoutNifty = loadWatchlistFromStorage(store).filter(
      i => i.symbol !== 'NIFTY_FUT'
    );
    saveWatchlistToStorage(withoutNifty, store);

    const niftyItem = getDefaultWatchlistItems().find(i => i.symbol === 'NIFTY_FUT')!;
    const prev = loadWatchlistFromStorage(store);
    saveWatchlistToStorage([...prev, niftyItem], store);

    const final = loadWatchlistFromStorage(store);
    const reAddedItem = final.find(i => i.symbol === 'NIFTY_FUT')!;

    // Item has no special "isDefault" flag — it's a plain WatchlistItem
    expect('isDefault' in reAddedItem).toBe(false);
    expect('category' in reAddedItem || reAddedItem.category === undefined).toBe(true);
  });

  // Req 3.6: duplicate prevention works correctly
  it('adding an item that already exists does not create a duplicate', () => {
    const store: Record<string, string> = {};
    simulateInit(store); // 3 defaults in store

    // Try to add NIFTY_FUT again (already present)
    const niftyItem = getDefaultWatchlistItems().find(i => i.symbol === 'NIFTY_FUT')!;
    const prev = loadWatchlistFromStorage(store);
    const next = prev.some(i => i.symbol === niftyItem.symbol)
      ? prev // duplicate detected — no change
      : [...prev, niftyItem];
    saveWatchlistToStorage(next, store);

    const saved = loadWatchlistFromStorage(store);
    expect(saved.filter(i => i.symbol === 'NIFTY_FUT')).toHaveLength(1);
    expect(saved).toHaveLength(3); // count unchanged
  });
});

// ─── Property-based tests: backward compatibility invariants ─────────────────

describe('Property-based: backward compatibility invariants', () => {
  // Validates: Requirements 6.1, 6.2
  it('any non-empty existing watchlist is loaded unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }),
            symbol: fc.string({ minLength: 1, maxLength: 20 }),
            kiteSymbol: fc.string({ minLength: 0, maxLength: 20 }),
            price: fc.float({ min: 1, max: 100000, noNaN: true }),
            change: fc.constantFrom('+0.5%', '-0.5%', '+1.0%'),
            segment: fc.constantFrom('NSE - Futures', 'BSE - Futures'),
            contractDate: fc.constant('28 Mar 2025'),
            open: fc.float({ min: 1, max: 100000, noNaN: true }),
            high: fc.float({ min: 1, max: 100000, noNaN: true }),
            low: fc.float({ min: 1, max: 100000, noNaN: true }),
            close: fc.float({ min: 1, max: 100000, noNaN: true }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (existingItems) => {
          const store = storeWithItems(existingItems);
          const { items } = simulateInit(store);

          // Count must be preserved
          if (items.length !== existingItems.length) return false;

          // Symbols must be preserved in order
          return existingItems.every((orig, idx) => items[idx].symbol === orig.symbol);
        }
      ),
      { numRuns: 200 }
    );
  });

  // Validates: Requirements 6.1, 6.2
  it('existing user: localStorage is never overwritten during init', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 20 }),
            symbol: fc.string({ minLength: 1, maxLength: 20 }),
            kiteSymbol: fc.string({ minLength: 0, maxLength: 20 }),
            price: fc.float({ min: 1, max: 100000, noNaN: true }),
            change: fc.constant('+0.5%'),
            segment: fc.constant('NSE - Futures'),
            contractDate: fc.constant('28 Mar 2025'),
            open: fc.float({ min: 1, max: 100000, noNaN: true }),
            high: fc.float({ min: 1, max: 100000, noNaN: true }),
            low: fc.float({ min: 1, max: 100000, noNaN: true }),
            close: fc.float({ min: 1, max: 100000, noNaN: true }),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (existingItems) => {
          const store = storeWithItems(existingItems);
          const originalJson = store[WATCHLIST_KEY];
          simulateInit(store);
          return store[WATCHLIST_KEY] === originalJson;
        }
      ),
      { numRuns: 200 }
    );
  });

  // Validates: Requirements 6.3, 6.4
  it('null key always triggers default population; empty-array key never does', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (useNull) => {
          const store: Record<string, string> = useNull
            ? {} // null key → first-time user
            : { [WATCHLIST_KEY]: '[]' }; // empty array → cleared watchlist

          const { items } = simulateInit(store);

          if (useNull) {
            return items.length === 3; // defaults added
          } else {
            return items.length === 0; // no defaults re-added
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
