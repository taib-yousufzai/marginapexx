import { describe, it, expect } from 'vitest';

// ─── Inline the pure logic under test ────────────────────────────────────────
// These mirror the module-level functions in app/watchlist/page.tsx exactly.
// Testing them here avoids pulling in React / Next.js dependencies.
//
// Integration tests for the empty state → populated transition (Req 4.5).
// We model the full lifecycle: init → empty state → add item → populated state.

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
 * Simulates the useEffect initialization logic from page.tsx.
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

/**
 * Models the renderWatchlist() empty-state decision from the inline script.
 * Returns true when the watchlist should show the empty state UI.
 */
function isEmptyState(items: WatchlistItem[]): boolean {
  return items.length === 0;
}

/**
 * Models the renderWatchlist() populated-state decision.
 * Returns true when watchlist cards should be rendered.
 */
function isPopulatedState(items: WatchlistItem[]): boolean {
  return items.length > 0;
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

// ─── Req 4.5: Adding item from library drawer while viewing empty state ────────

describe('Req 4.5 — adding item from library drawer while viewing empty state', () => {
  it('adding an item while in empty state transitions to populated state', () => {
    // Start with user who cleared their watchlist
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    const { items: initialItems } = simulateInit(store);

    // Verify we are in empty state
    expect(isEmptyState(initialItems)).toBe(true);

    // User opens library drawer and adds an item
    const newItem = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    const updatedItems = simulateAddToWatchlist(newItem, store);

    // Empty state should disappear
    expect(isEmptyState(updatedItems)).toBe(false);
    expect(isPopulatedState(updatedItems)).toBe(true);
  });

  it('watchlist cards render immediately after addition (state updates synchronously)', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    simulateInit(store);

    const newItem = makeItem({ symbol: 'RELIANCE_FUT', name: 'RELIANCE FUT' });
    const updatedItems = simulateAddToWatchlist(newItem, store);

    // Item is immediately available in state — no async delay
    expect(updatedItems).toHaveLength(1);
    expect(updatedItems[0].symbol).toBe('RELIANCE_FUT');
  });

  it('added item has all required fields for card rendering', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    simulateInit(store);

    const newItem = makeItem({
      symbol: 'FINNIFTY_FUT',
      name: 'FINNIFTY FUT',
      kiteSymbol: 'NSE:NIFTY FIN SERVICE',
      price: 21234.90,
      change: '+0.67%',
      segment: 'NSE - Futures',
    });
    const updatedItems = simulateAddToWatchlist(newItem, store);

    const addedItem = updatedItems[0];
    // All fields required for card rendering must be present
    expect(addedItem.name).toBeTruthy();
    expect(addedItem.symbol).toBeTruthy();
    expect(typeof addedItem.price).toBe('number');
    expect(addedItem.change).toBeTruthy();
    expect(addedItem.segment).toBeTruthy();
  });

  it('adding multiple items from library drawer while in empty state works correctly', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    simulateInit(store);

    const item1 = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    const item2 = makeItem({ symbol: 'RELIANCE_FUT', name: 'RELIANCE FUT' });
    const item3 = makeItem({ symbol: 'TCS_FUT', name: 'TCS FUT' });

    simulateAddToWatchlist(item1, store);
    simulateAddToWatchlist(item2, store);
    const finalItems = simulateAddToWatchlist(item3, store);

    expect(finalItems).toHaveLength(3);
    expect(isPopulatedState(finalItems)).toBe(true);
  });
});

// ─── Req 4.5: Watchlist cards render immediately after addition ───────────────

describe('Req 4.5 — watchlist cards render immediately after addition', () => {
  it('state after add reflects the new item count immediately', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    const { items: before } = simulateInit(store);
    expect(before).toHaveLength(0);

    const newItem = makeItem({ symbol: 'GOLD_FUT', name: 'GOLD FUT' });
    const after = simulateAddToWatchlist(newItem, store);

    expect(after).toHaveLength(1);
  });

  it('localStorage is updated immediately when item is added from empty state', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    simulateInit(store);

    const newItem = makeItem({ symbol: 'GOLD_FUT', name: 'GOLD FUT' });
    simulateAddToWatchlist(newItem, store);

    // Storage must be updated immediately
    const persisted = loadWatchlistFromStorage(store);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].symbol).toBe('GOLD_FUT');
  });

  it('in-memory state matches localStorage after adding item from empty state', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    simulateInit(store);

    const newItem = makeItem({ symbol: 'SILVER_FUT', name: 'SILVER FUT' });
    const stateItems = simulateAddToWatchlist(newItem, store);
    const persistedItems = loadWatchlistFromStorage(store);

    expect(stateItems.map(i => i.symbol)).toEqual(persistedItems.map(i => i.symbol));
  });

  it('item added from empty state is the first element in the watchlist', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    simulateInit(store);

    const newItem = makeItem({ symbol: 'CRUDEOIL_FUT', name: 'CRUDEOIL FUT' });
    const items = simulateAddToWatchlist(newItem, store);

    expect(items[0].symbol).toBe('CRUDEOIL_FUT');
  });
});

// ─── Req 4.5: Empty state disappears when items are added ─────────────────────

describe('Req 4.5 — empty state disappears when items are added', () => {
  it('empty state is false immediately after first item is added', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    const { items: emptyItems } = simulateInit(store);
    expect(isEmptyState(emptyItems)).toBe(true);

    const newItem = makeItem({ symbol: 'NIFTY_FUT', name: 'NIFTY FUT' });
    const updatedItems = simulateAddToWatchlist(newItem, store);

    expect(isEmptyState(updatedItems)).toBe(false);
  });

  it('populated state is true immediately after first item is added', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    simulateInit(store);

    const newItem = makeItem({ symbol: 'BANKNIFTY_FUT', name: 'BANKNIFTY FUT' });
    const updatedItems = simulateAddToWatchlist(newItem, store);

    expect(isPopulatedState(updatedItems)).toBe(true);
  });

  it('empty state returns after removing the only added item', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    simulateInit(store);

    // Add one item
    const newItem = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    simulateAddToWatchlist(newItem, store);

    // Remove it
    const afterRemove = simulateRemoveFromWatchlist('FINNIFTY_FUT', store);

    expect(isEmptyState(afterRemove)).toBe(true);
  });

  it('empty state does not return after adding multiple items and removing some', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    simulateInit(store);

    const item1 = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    const item2 = makeItem({ symbol: 'RELIANCE_FUT', name: 'RELIANCE FUT' });

    simulateAddToWatchlist(item1, store);
    simulateAddToWatchlist(item2, store);

    // Remove only the first item
    const afterRemove = simulateRemoveFromWatchlist('FINNIFTY_FUT', store);

    // Still has one item — not empty state
    expect(isEmptyState(afterRemove)).toBe(false);
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove[0].symbol).toBe('RELIANCE_FUT');
  });

  it('full lifecycle: first-time user → remove all → empty state → add item → populated', () => {
    const store: Record<string, string> = {};

    // Step 1: First-time user gets defaults
    const { items: step1 } = simulateInit(store);
    expect(isPopulatedState(step1)).toBe(true);
    expect(step1).toHaveLength(3);

    // Step 2: User removes all defaults
    simulateRemoveFromWatchlist('NIFTY_FUT', store);
    simulateRemoveFromWatchlist('BANKNIFTY_FUT', store);
    simulateRemoveFromWatchlist('SENSEX_FUT', store);

    // Step 3: Page refresh → empty state (no re-addition of defaults)
    const { items: step3 } = simulateInit(store);
    expect(isEmptyState(step3)).toBe(true);

    // Step 4: User adds item from library drawer
    const newItem = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    const step4 = simulateAddToWatchlist(newItem, store);

    // Step 5: Populated state
    expect(isPopulatedState(step4)).toBe(true);
    expect(step4).toHaveLength(1);
    expect(step4[0].symbol).toBe('FINNIFTY_FUT');
  });

  it('adding a default symbol from library while in empty state works correctly', () => {
    // User cleared watchlist (has "[]" in storage)
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    simulateInit(store);

    // User re-adds NIFTY_FUT from library drawer
    const niftyItem = getDefaultWatchlistItems().find(i => i.symbol === 'NIFTY_FUT')!;
    const updatedItems = simulateAddToWatchlist(niftyItem, store);

    expect(isPopulatedState(updatedItems)).toBe(true);
    expect(updatedItems).toHaveLength(1);
    expect(updatedItems[0].symbol).toBe('NIFTY_FUT');
  });
});
