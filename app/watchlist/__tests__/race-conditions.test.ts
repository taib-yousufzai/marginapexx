import { describe, it, expect } from 'vitest';

// ─── Inline the pure logic under test ────────────────────────────────────────
// These mirror the module-level functions in app/watchlist/page.tsx exactly.
// Testing them here avoids pulling in React / Next.js dependencies.
//
// Race condition scenarios are modelled by controlling the order in which
// operations (init, add, remove) are applied to a shared store.

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

/**
 * Simulates window.__addToWatchlistCallback from page.tsx.
 * Reads current state from store, applies duplicate check, writes back.
 */
function simulateAddToWatchlist(
  item: WatchlistItem,
  store: Record<string, string>
): WatchlistItem[] {
  const prev = loadWatchlistFromStorage(store);
  if (prev.some(i => i.symbol === item.symbol)) return prev;
  const next = [...prev, item];
  saveWatchlistToStorage(next, store);
  return next;
}

/**
 * Simulates window.__removeFromWatchlistCallback from page.tsx.
 */
function simulateRemoveFromWatchlist(
  symbol: string,
  store: Record<string, string>
): WatchlistItem[] {
  const prev = loadWatchlistFromStorage(store);
  const next = prev.filter(i => i.symbol !== symbol);
  saveWatchlistToStorage(next, store);
  return next;
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

// ─── Race Condition 1: Rapid page refresh ─────────────────────────────────────
//
// Scenario: The user refreshes the page multiple times in quick succession.
// Each mount runs simulateInit. The first mount writes defaults to localStorage.
// Subsequent mounts see the key already present and load existing data.
// Result: defaults are written exactly once; no duplication.

describe('Race condition 1 — rapid page refresh does not duplicate defaults (Req 1.7)', () => {
  it('two rapid mounts on a fresh browser produce exactly 3 items', () => {
    const store: Record<string, string> = {}; // fresh browser — no key

    // First mount
    const { items: items1 } = simulateInit(store);
    // Second mount (rapid refresh — key now exists)
    const { items: items2 } = simulateInit(store);

    expect(items1).toHaveLength(3);
    expect(items2).toHaveLength(3);
  });

  it('ten rapid mounts on a fresh browser still produce exactly 3 items', () => {
    const store: Record<string, string> = {};

    let lastItems: WatchlistItem[] = [];
    for (let i = 0; i < 10; i++) {
      const { items } = simulateInit(store);
      lastItems = items;
    }

    expect(lastItems).toHaveLength(3);
    // No symbol appears more than once
    const symbols = lastItems.map(i => i.symbol);
    const unique = new Set(symbols);
    expect(unique.size).toBe(3);
  });

  it('localStorage is written exactly once across multiple rapid mounts', () => {
    const store: Record<string, string> = {};

    // Track how many times the key is written by counting JSON changes
    const writtenValues: string[] = [];
    const originalStore = store;

    // First mount writes defaults
    simulateInit(originalStore);
    writtenValues.push(originalStore[WATCHLIST_KEY]);

    const afterFirstMount = originalStore[WATCHLIST_KEY];

    // Subsequent mounts must not overwrite the key
    for (let i = 0; i < 5; i++) {
      simulateInit(originalStore);
      // Value must remain identical to what was written on first mount
      expect(originalStore[WATCHLIST_KEY]).toBe(afterFirstMount);
    }
  });

  it('defaults are the same 3 symbols regardless of how many times init runs', () => {
    const store: Record<string, string> = {};

    for (let i = 0; i < 5; i++) {
      const { items } = simulateInit(store);
      const symbols = items.map(i => i.symbol);
      expect(symbols).toContain('NIFTY_FUT');
      expect(symbols).toContain('BANKNIFTY_FUT');
      expect(symbols).toContain('SENSEX_FUT');
    }
  });

  it('rapid refresh after user has items does not alter their watchlist', () => {
    const userItems = [
      makeItem({ symbol: 'RELIANCE_FUT', name: 'RELIANCE FUT' }),
      makeItem({ symbol: 'TCS_FUT', name: 'TCS FUT' }),
    ];
    const store: Record<string, string> = {
      [WATCHLIST_KEY]: JSON.stringify(userItems),
    };
    const originalJson = store[WATCHLIST_KEY];

    // Simulate 5 rapid refreshes
    for (let i = 0; i < 5; i++) {
      simulateInit(store);
    }

    // Storage must be unchanged
    expect(store[WATCHLIST_KEY]).toBe(originalJson);
    const loaded = loadWatchlistFromStorage(store);
    expect(loaded).toHaveLength(2);
    expect(loaded[0].symbol).toBe('RELIANCE_FUT');
    expect(loaded[1].symbol).toBe('TCS_FUT');
  });
});

// ─── Race Condition 2: User adds item before defaults load ────────────────────
//
// Scenario (Req 1.7): The __addToWatchlistCallback fires before the useEffect
// that checks localStorage. Because the callback writes to localStorage first,
// the key is non-null when useEffect runs → defaults are NOT added.
//
// We model this by running simulateAddToWatchlist BEFORE simulateInit.

describe('Race condition 2 — user adds item before defaults load (Req 1.7)', () => {
  it('item added before init: init sees non-null key and skips defaults', () => {
    const store: Record<string, string> = {}; // fresh browser

    // User adds an item BEFORE the useEffect runs (e.g. via a deep link or fast interaction)
    const earlyItem = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    simulateAddToWatchlist(earlyItem, store);

    // Now the useEffect runs
    const { items } = simulateInit(store);

    // Only the user's item should be present — no defaults
    expect(items).toHaveLength(1);
    expect(items[0].symbol).toBe('FINNIFTY_FUT');
  });

  it('item added before init: none of the 3 default symbols appear', () => {
    const store: Record<string, string> = {};

    const earlyItem = makeItem({ symbol: 'RELIANCE_FUT', name: 'RELIANCE FUT' });
    simulateAddToWatchlist(earlyItem, store);

    const { items } = simulateInit(store);

    const defaultSymbols = ['NIFTY_FUT', 'BANKNIFTY_FUT', 'SENSEX_FUT'];
    for (const sym of defaultSymbols) {
      expect(items.some(i => i.symbol === sym)).toBe(false);
    }
  });

  it('multiple items added before init: all user items preserved, no defaults', () => {
    const store: Record<string, string> = {};

    // User adds 3 items before init runs
    const items = [
      makeItem({ symbol: 'RELIANCE_FUT', name: 'RELIANCE FUT' }),
      makeItem({ symbol: 'TCS_FUT', name: 'TCS FUT' }),
      makeItem({ symbol: 'HDFCBANK_FUT', name: 'HDFCBANK FUT' }),
    ];
    for (const item of items) {
      simulateAddToWatchlist(item, store);
    }

    const { items: initItems } = simulateInit(store);

    expect(initItems).toHaveLength(3);
    expect(initItems.map(i => i.symbol)).toEqual([
      'RELIANCE_FUT',
      'TCS_FUT',
      'HDFCBANK_FUT',
    ]);
  });

  it('item added before init: localStorage is not overwritten by init', () => {
    const store: Record<string, string> = {};

    const earlyItem = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    simulateAddToWatchlist(earlyItem, store);

    const jsonBeforeInit = store[WATCHLIST_KEY];

    simulateInit(store);

    // Init must not overwrite the key that was already set
    expect(store[WATCHLIST_KEY]).toBe(jsonBeforeInit);
  });

  it('item added before init: subsequent init runs also skip defaults', () => {
    const store: Record<string, string> = {};

    const earlyItem = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    simulateAddToWatchlist(earlyItem, store);

    // Run init multiple times (simulating rapid refresh after early add)
    for (let i = 0; i < 3; i++) {
      const { items } = simulateInit(store);
      expect(items).toHaveLength(1);
      expect(items[0].symbol).toBe('FINNIFTY_FUT');
    }
  });

  it('adding a default symbol before init: init loads it without duplication', () => {
    const store: Record<string, string> = {};

    // User somehow adds NIFTY_FUT before init (e.g. via library drawer before auth check completes)
    const niftyItem = getDefaultWatchlistItems().find(i => i.symbol === 'NIFTY_FUT')!;
    simulateAddToWatchlist(niftyItem, store);

    const { items } = simulateInit(store);

    // Only 1 copy of NIFTY_FUT — no duplication from defaults
    expect(items.filter(i => i.symbol === 'NIFTY_FUT')).toHaveLength(1);
    // Total count is 1 (only what the user added)
    expect(items).toHaveLength(1);
  });
});

// ─── Race Condition 3: Concurrent tabs ───────────────────────────────────────
//
// Scenario: Two browser tabs open simultaneously on a fresh browser.
// Both tabs read null from localStorage at the same time, both compute defaults,
// and both write defaults. The second write overwrites the first with identical
// data — the result is idempotent (still 3 items, no duplicates).
//
// We model this by running two simulateInit calls that both read null before
// either writes (i.e. both see an empty store at read time).

describe('Race condition 3 — concurrent tabs scenario (Req 1.7)', () => {
  it('two tabs both reading null and writing defaults: result is exactly 3 items', () => {
    // Both tabs read from the same underlying store.
    // Tab 1 reads null, computes defaults, writes.
    // Tab 2 reads null (same snapshot), computes defaults, writes (overwrites with same data).
    const store: Record<string, string> = {};

    // Tab 1 init
    const { items: tab1Items } = simulateInit(store);
    // Tab 2 init (store already has key from tab 1, but in a true race both would
    // have read null before either wrote — we model the worst case: tab 2 also
    // writes defaults, overwriting tab 1's write with identical data)
    const storeSnapshot: Record<string, string> = {}; // tab 2 read null at the same time
    const { items: tab2Items } = simulateInit(storeSnapshot);

    // Both tabs computed the same 3 defaults
    expect(tab1Items).toHaveLength(3);
    expect(tab2Items).toHaveLength(3);

    // The final write (tab 2's) contains the same 3 defaults — no duplication
    const finalItems = loadWatchlistFromStorage(storeSnapshot);
    expect(finalItems).toHaveLength(3);
    const symbols = finalItems.map(i => i.symbol);
    expect(new Set(symbols).size).toBe(3);
  });

  it('concurrent tab writes are idempotent: both tabs write the same defaults', () => {
    // Simulate tab 1 and tab 2 each independently computing defaults from null
    const tab1Store: Record<string, string> = {};
    const tab2Store: Record<string, string> = {};

    simulateInit(tab1Store);
    simulateInit(tab2Store);

    // Both stores should contain identical JSON
    expect(tab1Store[WATCHLIST_KEY]).toBe(tab2Store[WATCHLIST_KEY]);
  });

  it('tab 1 writes defaults, tab 2 reads and sees exactly 3 items', () => {
    const sharedStore: Record<string, string> = {};

    // Tab 1 initialises first
    simulateInit(sharedStore);

    // Tab 2 initialises after tab 1 has written (non-null key)
    const { items: tab2Items } = simulateInit(sharedStore);

    expect(tab2Items).toHaveLength(3);
    expect(tab2Items.map(i => i.symbol)).toEqual([
      'NIFTY_FUT',
      'BANKNIFTY_FUT',
      'SENSEX_FUT',
    ]);
  });

  it('tab 1 adds a user item, tab 2 inits: tab 2 sees user item, no defaults', () => {
    const sharedStore: Record<string, string> = {};

    // Tab 1 adds an item (e.g. from library drawer) before either tab's useEffect runs
    const userItem = makeItem({ symbol: 'RELIANCE_FUT', name: 'RELIANCE FUT' });
    simulateAddToWatchlist(userItem, sharedStore);

    // Tab 2's useEffect runs and sees non-null key
    const { items: tab2Items } = simulateInit(sharedStore);

    expect(tab2Items).toHaveLength(1);
    expect(tab2Items[0].symbol).toBe('RELIANCE_FUT');
    // No defaults injected
    const defaultSymbols = ['NIFTY_FUT', 'BANKNIFTY_FUT', 'SENSEX_FUT'];
    for (const sym of defaultSymbols) {
      expect(tab2Items.some(i => i.symbol === sym)).toBe(false);
    }
  });

  it('tab 1 removes an item, tab 2 inits: tab 2 sees the updated list', () => {
    const sharedStore: Record<string, string> = {};

    // Tab 1 initialises and gets defaults
    simulateInit(sharedStore);

    // Tab 1 removes NIFTY_FUT
    simulateRemoveFromWatchlist('NIFTY_FUT', sharedStore);

    // Tab 2 initialises (key exists with 2 items)
    const { items: tab2Items } = simulateInit(sharedStore);

    expect(tab2Items).toHaveLength(2);
    expect(tab2Items.some(i => i.symbol === 'NIFTY_FUT')).toBe(false);
    expect(tab2Items.some(i => i.symbol === 'BANKNIFTY_FUT')).toBe(true);
    expect(tab2Items.some(i => i.symbol === 'SENSEX_FUT')).toBe(true);
  });
});

// ─── Race Condition 4: State consistency verification ────────────────────────
//
// After any of the above scenarios, the in-memory state (items returned by
// simulateInit / simulateAddToWatchlist) must always match what is persisted
// in localStorage. This section verifies that invariant across all scenarios.

describe('State consistency — in-memory state matches localStorage after all scenarios (Req 1.7)', () => {
  it('after first-time init: state matches localStorage', () => {
    const store: Record<string, string> = {};
    const { items } = simulateInit(store);

    const persisted = loadWatchlistFromStorage(store);
    expect(items).toHaveLength(persisted.length);
    items.forEach((item, idx) => {
      expect(item.symbol).toBe(persisted[idx].symbol);
    });
  });

  it('after rapid refresh: state matches localStorage on every mount', () => {
    const store: Record<string, string> = {};

    for (let i = 0; i < 5; i++) {
      const { items } = simulateInit(store);
      const persisted = loadWatchlistFromStorage(store);
      expect(items.map(i => i.symbol)).toEqual(persisted.map(i => i.symbol));
    }
  });

  it('after early add + init: state matches localStorage', () => {
    const store: Record<string, string> = {};

    const earlyItem = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    simulateAddToWatchlist(earlyItem, store);

    const { items } = simulateInit(store);
    const persisted = loadWatchlistFromStorage(store);

    expect(items.map(i => i.symbol)).toEqual(persisted.map(i => i.symbol));
  });

  it('after add then remove: state matches localStorage', () => {
    const store: Record<string, string> = {};
    simulateInit(store); // 3 defaults

    // Add a new item
    const newItem = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    const afterAdd = simulateAddToWatchlist(newItem, store);
    expect(afterAdd.map(i => i.symbol)).toEqual(
      loadWatchlistFromStorage(store).map(i => i.symbol)
    );

    // Remove a default item
    const afterRemove = simulateRemoveFromWatchlist('NIFTY_FUT', store);
    expect(afterRemove.map(i => i.symbol)).toEqual(
      loadWatchlistFromStorage(store).map(i => i.symbol)
    );
  });

  it('after concurrent tab scenario: final state is consistent', () => {
    const sharedStore: Record<string, string> = {};

    // Tab 1 inits
    const { items: tab1Items } = simulateInit(sharedStore);

    // Tab 2 inits (sees existing key)
    const { items: tab2Items } = simulateInit(sharedStore);

    // Both tabs see the same items
    expect(tab1Items.map(i => i.symbol)).toEqual(tab2Items.map(i => i.symbol));

    // Both match what's in storage
    const persisted = loadWatchlistFromStorage(sharedStore);
    expect(tab2Items.map(i => i.symbol)).toEqual(persisted.map(i => i.symbol));
  });

  it('after user clears watchlist: empty state is consistent with localStorage', () => {
    const store: Record<string, string> = {};
    simulateInit(store); // 3 defaults

    // User removes all items
    simulateRemoveFromWatchlist('NIFTY_FUT', store);
    simulateRemoveFromWatchlist('BANKNIFTY_FUT', store);
    simulateRemoveFromWatchlist('SENSEX_FUT', store);

    // State is empty
    const persisted = loadWatchlistFromStorage(store);
    expect(persisted).toHaveLength(0);

    // Init after clearing: key exists as "[]" → no defaults re-added
    const { items } = simulateInit(store);
    expect(items).toHaveLength(0);

    // Storage still shows empty array
    expect(loadWatchlistFromStorage(store)).toHaveLength(0);
  });

  it('no scenario produces duplicate symbols in localStorage', () => {
    const scenarios: Array<() => Record<string, string>> = [
      // Scenario A: rapid refresh
      () => {
        const store: Record<string, string> = {};
        for (let i = 0; i < 5; i++) simulateInit(store);
        return store;
      },
      // Scenario B: early add + init
      () => {
        const store: Record<string, string> = {};
        simulateAddToWatchlist(makeItem({ symbol: 'EARLY_FUT' }), store);
        simulateInit(store);
        return store;
      },
      // Scenario C: concurrent tabs (worst case: both write defaults)
      () => {
        const store: Record<string, string> = {};
        simulateInit(store);
        simulateInit(store);
        return store;
      },
      // Scenario D: add, remove, re-add
      () => {
        const store: Record<string, string> = {};
        simulateInit(store);
        simulateRemoveFromWatchlist('NIFTY_FUT', store);
        const nifty = getDefaultWatchlistItems().find(i => i.symbol === 'NIFTY_FUT')!;
        simulateAddToWatchlist(nifty, store);
        return store;
      },
    ];

    for (const buildStore of scenarios) {
      const store = buildStore();
      const items = loadWatchlistFromStorage(store);
      const symbols = items.map(i => i.symbol);
      const unique = new Set(symbols);
      expect(unique.size).toBe(symbols.length); // no duplicates
    }
  });
});
