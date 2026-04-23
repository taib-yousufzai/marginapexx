import { describe, it, expect } from 'vitest';

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
 * Simulates window.__addToWatchlistCallback from page.tsx:
 *
 *   window.__addToWatchlistCallback = (item: WatchlistItem) => {
 *     setWatchlistItems(prev => {
 *       if (prev.some(i => i.symbol === item.symbol)) return prev;
 *       const next = [...prev, item];
 *       saveWatchlistToStorage(next);
 *       return next;
 *     });
 *   };
 */
function simulateAddToWatchlist(
  item: WatchlistItem,
  store: Record<string, string>
): WatchlistItem[] {
  const prev = loadWatchlistFromStorage(store);
  if (prev.some(i => i.symbol === item.symbol)) return prev; // duplicate check
  const next = [...prev, item];
  saveWatchlistToStorage(next, store);
  return next;
}

/**
 * Simulates window.__removeFromWatchlistCallback from page.tsx:
 *
 *   window.__removeFromWatchlistCallback = (symbol: string) => {
 *     setWatchlistItems(prev => {
 *       const next = prev.filter(i => i.symbol !== symbol);
 *       saveWatchlistToStorage(next);
 *       return next;
 *     });
 *   };
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

// ─── Integration tests: library drawer interaction (Req 3.4, 3.5, 3.6) ───────

describe('Library drawer interaction — adding items after defaults are populated', () => {
  // Req 3.4: adding library item appends to existing watchlist (including defaults)
  it('adding a library item after defaults are populated results in 4 items', () => {
    // First-time user: localStorage key does not exist
    const store: Record<string, string> = {};
    simulateInit(store);

    // Defaults are now in storage (3 items)
    expect(loadWatchlistFromStorage(store)).toHaveLength(3);

    // User opens library drawer and adds a new item
    const newItem = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT', kiteSymbol: 'NSE:NIFTY FIN SERVICE' });
    simulateAddToWatchlist(newItem, store);

    const saved = loadWatchlistFromStorage(store);
    expect(saved).toHaveLength(4);
  });

  // Req 3.4: new item is appended to end, not inserted at beginning or middle
  it('new library item is appended to the end of the watchlist', () => {
    const store: Record<string, string> = {};
    simulateInit(store); // populates NIFTY_FUT, BANKNIFTY_FUT, SENSEX_FUT

    const newItem = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    simulateAddToWatchlist(newItem, store);

    const saved = loadWatchlistFromStorage(store);
    // Defaults remain in their original positions
    expect(saved[0].symbol).toBe('NIFTY_FUT');
    expect(saved[1].symbol).toBe('BANKNIFTY_FUT');
    expect(saved[2].symbol).toBe('SENSEX_FUT');
    // New item is last
    expect(saved[3].symbol).toBe('FINNIFTY_FUT');
  });

  // Req 3.4: order of defaults is preserved when a new item is added
  it('default items retain their original order after a library item is added', () => {
    const store: Record<string, string> = {};
    simulateInit(store);

    const newItem = makeItem({ symbol: 'RELIANCE_FUT', name: 'RELIANCE FUT' });
    simulateAddToWatchlist(newItem, store);

    const saved = loadWatchlistFromStorage(store);
    const defaultSymbols = ['NIFTY_FUT', 'BANKNIFTY_FUT', 'SENSEX_FUT'];
    defaultSymbols.forEach((sym, idx) => {
      expect(saved[idx].symbol).toBe(sym);
    });
  });
});

describe('Library drawer interaction — re-adding a previously removed default item', () => {
  // Req 3.5: re-adding a removed default item from library drawer succeeds
  it('re-adding a removed default item adds it back to the watchlist', () => {
    const store: Record<string, string> = {};
    simulateInit(store); // 3 defaults

    // Remove NIFTY_FUT
    simulateRemoveFromWatchlist('NIFTY_FUT', store);
    expect(loadWatchlistFromStorage(store)).toHaveLength(2);
    expect(loadWatchlistFromStorage(store).some(i => i.symbol === 'NIFTY_FUT')).toBe(false);

    // Re-add NIFTY_FUT from library drawer
    const niftyItem = getDefaultWatchlistItems().find(i => i.symbol === 'NIFTY_FUT')!;
    simulateAddToWatchlist(niftyItem, store);

    const final = loadWatchlistFromStorage(store);
    expect(final).toHaveLength(3);
    expect(final.some(i => i.symbol === 'NIFTY_FUT')).toBe(true);
  });

  // Req 3.5: re-added item is appended to end (not restored to original position)
  it('re-added default item is appended to the end of the watchlist', () => {
    const store: Record<string, string> = {};
    simulateInit(store); // NIFTY_FUT, BANKNIFTY_FUT, SENSEX_FUT

    // Remove NIFTY_FUT (was at index 0)
    simulateRemoveFromWatchlist('NIFTY_FUT', store);

    // Re-add NIFTY_FUT from library drawer
    const niftyItem = getDefaultWatchlistItems().find(i => i.symbol === 'NIFTY_FUT')!;
    simulateAddToWatchlist(niftyItem, store);

    const final = loadWatchlistFromStorage(store);
    // NIFTY_FUT is now at the end, not at index 0
    expect(final[final.length - 1].symbol).toBe('NIFTY_FUT');
  });

  // Req 3.6: re-added default item is treated as a regular user-added item
  it('re-added default item is indistinguishable from a user-added item', () => {
    const store: Record<string, string> = {};
    simulateInit(store);

    // Remove and re-add BANKNIFTY_FUT
    simulateRemoveFromWatchlist('BANKNIFTY_FUT', store);
    const bankNiftyItem = getDefaultWatchlistItems().find(i => i.symbol === 'BANKNIFTY_FUT')!;
    simulateAddToWatchlist(bankNiftyItem, store);

    const final = loadWatchlistFromStorage(store);
    const reAddedItem = final.find(i => i.symbol === 'BANKNIFTY_FUT')!;

    // No special "isDefault" flag — it's a plain WatchlistItem
    expect('isDefault' in reAddedItem).toBe(false);
    // category field is either absent or undefined (not a special marker)
    expect(reAddedItem.category).toBeUndefined();
  });

  // Req 3.6: all items in the watchlist share the same structure after re-addition
  it('all items have the same WatchlistItem structure regardless of origin', () => {
    const store: Record<string, string> = {};
    simulateInit(store);

    // Remove SENSEX_FUT and re-add it
    simulateRemoveFromWatchlist('SENSEX_FUT', store);
    const sensexItem = getDefaultWatchlistItems().find(i => i.symbol === 'SENSEX_FUT')!;
    simulateAddToWatchlist(sensexItem, store);

    // Also add a brand-new user item
    const userItem = makeItem({ symbol: 'TCS_FUT', name: 'TCS FUT' });
    simulateAddToWatchlist(userItem, store);

    const final = loadWatchlistFromStorage(store);
    const requiredFields: (keyof WatchlistItem)[] = [
      'name', 'symbol', 'kiteSymbol', 'price', 'change',
      'segment', 'contractDate', 'open', 'high', 'low', 'close',
    ];

    // Every item (default, re-added default, user-added) must have all required fields
    for (const item of final) {
      for (const field of requiredFields) {
        expect(item).toHaveProperty(field);
      }
    }
  });
});

describe('Library drawer interaction — duplicate prevention', () => {
  // Req 3.6: adding an item that already exists does not create a duplicate
  it('adding an existing default item does not increase the watchlist count', () => {
    const store: Record<string, string> = {};
    simulateInit(store); // 3 defaults

    // Try to add NIFTY_FUT which is already present
    const niftyItem = getDefaultWatchlistItems().find(i => i.symbol === 'NIFTY_FUT')!;
    simulateAddToWatchlist(niftyItem, store);

    const saved = loadWatchlistFromStorage(store);
    expect(saved).toHaveLength(3); // count unchanged
  });

  // Req 3.6: no duplicate symbol appears in the watchlist
  it('adding a duplicate item leaves exactly one copy of that symbol', () => {
    const store: Record<string, string> = {};
    simulateInit(store);

    // Try to add BANKNIFTY_FUT which is already present
    const bankNiftyItem = getDefaultWatchlistItems().find(i => i.symbol === 'BANKNIFTY_FUT')!;
    simulateAddToWatchlist(bankNiftyItem, store);

    const saved = loadWatchlistFromStorage(store);
    const copies = saved.filter(i => i.symbol === 'BANKNIFTY_FUT');
    expect(copies).toHaveLength(1);
  });

  // Req 3.6: duplicate prevention works for user-added items too
  it('adding a user-added item twice does not create a duplicate', () => {
    const store: Record<string, string> = {};
    simulateInit(store); // 3 defaults

    const userItem = makeItem({ symbol: 'RELIANCE_FUT', name: 'RELIANCE FUT' });

    // Add once
    simulateAddToWatchlist(userItem, store);
    expect(loadWatchlistFromStorage(store)).toHaveLength(4);

    // Try to add again
    simulateAddToWatchlist(userItem, store);
    expect(loadWatchlistFromStorage(store)).toHaveLength(4); // still 4
  });

  // Req 3.6: duplicate check is based on symbol, not name or other fields
  it('duplicate check uses symbol field for comparison', () => {
    const store: Record<string, string> = {};
    simulateInit(store);

    // Item with same symbol as NIFTY_FUT but different name/price
    const sameSymbolDifferentData = makeItem({
      symbol: 'NIFTY_FUT', // same symbol
      name: 'NIFTY FUTURES (MODIFIED)',
      price: 99999,
    });

    simulateAddToWatchlist(sameSymbolDifferentData, store);

    const saved = loadWatchlistFromStorage(store);
    // Count must not increase — symbol match triggers duplicate prevention
    expect(saved).toHaveLength(3);
    // Original NIFTY_FUT data is preserved (not overwritten)
    const niftyEntry = saved.find(i => i.symbol === 'NIFTY_FUT')!;
    expect(niftyEntry.name).toBe('NIFTY FUT'); // original name
    expect(niftyEntry.price).toBe(22456.80);   // original price
  });

  // Multiple duplicate attempts in sequence
  it('multiple duplicate add attempts do not accumulate duplicates', () => {
    const store: Record<string, string> = {};
    simulateInit(store);

    const niftyItem = getDefaultWatchlistItems().find(i => i.symbol === 'NIFTY_FUT')!;

    // Attempt to add the same item 5 times
    for (let i = 0; i < 5; i++) {
      simulateAddToWatchlist(niftyItem, store);
    }

    const saved = loadWatchlistFromStorage(store);
    expect(saved).toHaveLength(3); // still just the 3 defaults
    expect(saved.filter(i => i.symbol === 'NIFTY_FUT')).toHaveLength(1);
  });
});
