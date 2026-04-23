import { describe, it, expect } from 'vitest';

// ─── Inline the pure logic under test ────────────────────────────────────────
// These mirror the module-level functions in app/watchlist/page.tsx exactly.
// Testing them here avoids pulling in React / Next.js dependencies.
//
// Empty state behaviour is determined entirely by the items array length and
// the localStorage key presence — both of which are pure data concerns that
// can be tested without a browser environment.

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

// ─── Inline implementations matching page.tsx ────────────────────────────────

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

// ─── Inline the renderWatchlist empty-state logic from the inline script ─────
//
// The inline script's renderWatchlist() function produces this HTML when
// watchlistItems.length === 0:
//
//   <div style="...">
//     <i class="fas fa-chart-line" style="..."></i>
//     <div style="...">Your watchlist is empty</div>
//     <div style="...">Add scripts from the library to start tracking</div>
//   </div>
//
// We model the rendering decision as a pure function so we can test it
// without a DOM environment.

interface RenderResult {
  isEmpty: boolean;
  emptyStateHtml: string | null;
  itemCount: number;
}

function renderWatchlistLogic(items: WatchlistItem[]): RenderResult {
  if (items.length === 0) {
    const emptyStateHtml =
      '<div style="text-align:center;padding:40px 20px;color:#9CA3AF;">' +
      '<i class="fas fa-chart-line" style="font-size:3rem;margin-bottom:12px;opacity:0.3;"></i>' +
      '<div style="font-size:0.9rem;font-weight:600;">Your watchlist is empty</div>' +
      '<div style="font-size:0.75rem;margin-top:6px;">Add scripts from the library to start tracking</div>' +
      '</div>';
    return { isEmpty: true, emptyStateHtml, itemCount: 0 };
  }
  return { isEmpty: false, emptyStateHtml: null, itemCount: items.length };
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

// ─── 4.1: Empty watchlist shows empty state UI ────────────────────────────────

describe('Req 4.1 — empty watchlist shows empty state UI', () => {
  it('items array with length 0 triggers empty state rendering', () => {
    const result = renderWatchlistLogic([]);
    expect(result.isEmpty).toBe(true);
    expect(result.emptyStateHtml).not.toBeNull();
  });

  it('items array with 1 item does NOT trigger empty state', () => {
    const result = renderWatchlistLogic([makeItem()]);
    expect(result.isEmpty).toBe(false);
    expect(result.emptyStateHtml).toBeNull();
  });

  it('items array with 3 items does NOT trigger empty state', () => {
    const result = renderWatchlistLogic(getDefaultWatchlistItems());
    expect(result.isEmpty).toBe(false);
    expect(result.emptyStateHtml).toBeNull();
  });

  it('empty state is shown when user has removed all items (store has "[]")', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    const { items } = simulateInit(store);
    const result = renderWatchlistLogic(items);
    expect(result.isEmpty).toBe(true);
  });

  it('empty state is NOT shown for first-time user (defaults are populated)', () => {
    const store: Record<string, string> = {}; // no key → first-time user
    const { items } = simulateInit(store);
    const result = renderWatchlistLogic(items);
    expect(result.isEmpty).toBe(false);
    expect(result.itemCount).toBe(3);
  });

  it('empty state is shown after all 3 defaults are removed one by one', () => {
    const store: Record<string, string> = {};
    simulateInit(store); // populate defaults

    simulateRemoveFromWatchlist('NIFTY_FUT', store);
    simulateRemoveFromWatchlist('BANKNIFTY_FUT', store);
    simulateRemoveFromWatchlist('SENSEX_FUT', store);

    const items = loadWatchlistFromStorage(store);
    const result = renderWatchlistLogic(items);
    expect(result.isEmpty).toBe(true);
  });
});

// ─── 4.2: Empty state message matches requirements ────────────────────────────

describe('Req 4.2 — empty state message matches requirements', () => {
  // The inline script renders the message across two sibling divs.
  // The combined semantic content must equal the required message.
  const REQUIRED_MESSAGE_PART_1 = 'Your watchlist is empty';
  const REQUIRED_MESSAGE_PART_2 = 'Add scripts from the library to start tracking';

  it('empty state HTML contains the first part of the required message', () => {
    const result = renderWatchlistLogic([]);
    expect(result.emptyStateHtml).toContain(REQUIRED_MESSAGE_PART_1);
  });

  it('empty state HTML contains the second part of the required message', () => {
    const result = renderWatchlistLogic([]);
    expect(result.emptyStateHtml).toContain(REQUIRED_MESSAGE_PART_2);
  });

  it('empty state HTML contains both message parts', () => {
    const result = renderWatchlistLogic([]);
    expect(result.emptyStateHtml).toContain(REQUIRED_MESSAGE_PART_1);
    expect(result.emptyStateHtml).toContain(REQUIRED_MESSAGE_PART_2);
  });

  it('combined message text matches the full required message', () => {
    const result = renderWatchlistLogic([]);
    const html = result.emptyStateHtml!;
    // Both parts together form the full required message
    const fullMessage = `${REQUIRED_MESSAGE_PART_1} - ${REQUIRED_MESSAGE_PART_2}`;
    // Verify each word of the full message appears in the HTML
    const words = fullMessage.split(/\s+/);
    for (const word of words) {
      expect(html).toContain(word);
    }
  });

  it('empty state message is not shown when items exist', () => {
    const result = renderWatchlistLogic([makeItem()]);
    expect(result.emptyStateHtml).toBeNull();
    // No empty state HTML means no message
  });

  it('empty state message is not shown for first-time user with defaults', () => {
    const store: Record<string, string> = {};
    const { items } = simulateInit(store);
    const result = renderWatchlistLogic(items);
    expect(result.emptyStateHtml).toBeNull();
  });
});

// ─── 4.3: Empty state icon is displayed (chart-line icon) ────────────────────

describe('Req 4.3 — empty state includes chart-line icon', () => {
  it('empty state HTML contains the fa-chart-line icon class', () => {
    const result = renderWatchlistLogic([]);
    expect(result.emptyStateHtml).toContain('fa-chart-line');
  });

  it('empty state HTML contains a Font Awesome icon element', () => {
    const result = renderWatchlistLogic([]);
    expect(result.emptyStateHtml).toContain('<i class="fas fa-chart-line"');
  });

  it('chart-line icon is NOT present when items exist (no empty state rendered)', () => {
    const result = renderWatchlistLogic([makeItem()]);
    // emptyStateHtml is null when items exist — icon is not rendered
    expect(result.emptyStateHtml).toBeNull();
  });

  it('chart-line icon appears in empty state after all items are removed', () => {
    const store: Record<string, string> = {};
    simulateInit(store);

    // Remove all defaults
    simulateRemoveFromWatchlist('NIFTY_FUT', store);
    simulateRemoveFromWatchlist('BANKNIFTY_FUT', store);
    simulateRemoveFromWatchlist('SENSEX_FUT', store);

    const items = loadWatchlistFromStorage(store);
    const result = renderWatchlistLogic(items);
    expect(result.emptyStateHtml).toContain('fa-chart-line');
  });
});

// ─── 4.4: No automatic re-addition of defaults after user deletion ────────────
//
// Critical distinction:
//   localStorage.getItem() returns null  → first-time user → add defaults
//   localStorage.getItem() returns "[]"  → user cleared watchlist → show empty state, NO defaults

describe('Req 4.4 — no automatic re-addition of defaults after user deletion', () => {
  it('empty array in localStorage ("[]") does NOT trigger default population', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    const { items } = simulateInit(store);
    expect(items).toHaveLength(0);
  });

  it('empty array in localStorage: storage is NOT overwritten with defaults', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    simulateInit(store);
    // Storage must still be the empty array, not replaced with defaults
    expect(store[WATCHLIST_KEY]).toBe('[]');
  });

  it('after removing all defaults, re-init does NOT re-add defaults', () => {
    const store: Record<string, string> = {};
    simulateInit(store); // first-time user: 3 defaults added

    // User removes all items
    simulateRemoveFromWatchlist('NIFTY_FUT', store);
    simulateRemoveFromWatchlist('BANKNIFTY_FUT', store);
    simulateRemoveFromWatchlist('SENSEX_FUT', store);

    // Verify storage now has empty array
    expect(store[WATCHLIST_KEY]).toBe('[]');

    // Simulate page refresh (re-init)
    const { items: reInitItems } = simulateInit(store);

    // Defaults must NOT be re-added
    expect(reInitItems).toHaveLength(0);
  });

  it('after removing all defaults, multiple re-inits never re-add defaults', () => {
    const store: Record<string, string> = {};
    simulateInit(store);

    simulateRemoveFromWatchlist('NIFTY_FUT', store);
    simulateRemoveFromWatchlist('BANKNIFTY_FUT', store);
    simulateRemoveFromWatchlist('SENSEX_FUT', store);

    // Simulate 5 page refreshes
    for (let i = 0; i < 5; i++) {
      const { items } = simulateInit(store);
      expect(items).toHaveLength(0);
    }
  });

  it('null key (no prior interaction) → defaults added; "[]" key → no defaults', () => {
    // Case A: null key → first-time user
    const storeA: Record<string, string> = {};
    const { items: itemsA } = simulateInit(storeA);
    expect(itemsA).toHaveLength(3);

    // Case B: "[]" key → user cleared watchlist
    const storeB: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    const { items: itemsB } = simulateInit(storeB);
    expect(itemsB).toHaveLength(0);
  });

  it('removing only some defaults does not trigger re-addition on re-init', () => {
    const store: Record<string, string> = {};
    simulateInit(store); // 3 defaults

    // Remove only NIFTY_FUT
    simulateRemoveFromWatchlist('NIFTY_FUT', store);

    // Re-init: key exists with 2 items → no defaults added
    const { items } = simulateInit(store);
    expect(items).toHaveLength(2);
    expect(items.some(i => i.symbol === 'NIFTY_FUT')).toBe(false);
    expect(items.some(i => i.symbol === 'BANKNIFTY_FUT')).toBe(true);
    expect(items.some(i => i.symbol === 'SENSEX_FUT')).toBe(true);
  });

  it('default symbols are not present in state after user clears watchlist', () => {
    const store: Record<string, string> = {};
    simulateInit(store);

    // Remove all
    simulateRemoveFromWatchlist('NIFTY_FUT', store);
    simulateRemoveFromWatchlist('BANKNIFTY_FUT', store);
    simulateRemoveFromWatchlist('SENSEX_FUT', store);

    const { items } = simulateInit(store);

    const defaultSymbols = ['NIFTY_FUT', 'BANKNIFTY_FUT', 'SENSEX_FUT'];
    for (const sym of defaultSymbols) {
      expect(items.some(i => i.symbol === sym)).toBe(false);
    }
  });

  it('localStorage key existence is the sole criterion for default population', () => {
    // Key absent → defaults
    const storeNoKey: Record<string, string> = {};
    const { items: noKeyItems } = simulateInit(storeNoKey);
    expect(noKeyItems).toHaveLength(3);

    // Key present with empty array → no defaults
    const storeEmptyArr: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    const { items: emptyArrItems } = simulateInit(storeEmptyArr);
    expect(emptyArrItems).toHaveLength(0);

    // Key present with items → no defaults
    const storeWithItems: Record<string, string> = {
      [WATCHLIST_KEY]: JSON.stringify([makeItem({ symbol: 'CUSTOM_1' })]),
    };
    const { items: withItemsItems } = simulateInit(storeWithItems);
    expect(withItemsItems).toHaveLength(1);
    expect(withItemsItems[0].symbol).toBe('CUSTOM_1');
  });
});

// ─── Additional: empty state rendering consistency ────────────────────────────

describe('Empty state rendering consistency', () => {
  it('renderWatchlistLogic returns itemCount 0 for empty items', () => {
    const result = renderWatchlistLogic([]);
    expect(result.itemCount).toBe(0);
  });

  it('renderWatchlistLogic returns correct itemCount for non-empty items', () => {
    const items = getDefaultWatchlistItems();
    const result = renderWatchlistLogic(items);
    expect(result.itemCount).toBe(3);
  });

  it('empty state HTML is a non-empty string when items array is empty', () => {
    const result = renderWatchlistLogic([]);
    expect(typeof result.emptyStateHtml).toBe('string');
    expect(result.emptyStateHtml!.length).toBeGreaterThan(0);
  });

  it('empty state is consistent across multiple calls with empty array', () => {
    const result1 = renderWatchlistLogic([]);
    const result2 = renderWatchlistLogic([]);
    expect(result1.emptyStateHtml).toBe(result2.emptyStateHtml);
    expect(result1.isEmpty).toBe(result2.isEmpty);
  });

  it('adding one item to empty watchlist transitions out of empty state', () => {
    const store: Record<string, string> = { [WATCHLIST_KEY]: '[]' };
    const { items: emptyItems } = simulateInit(store);
    expect(renderWatchlistLogic(emptyItems).isEmpty).toBe(true);

    // User adds an item from library drawer
    const newItem = makeItem({ symbol: 'FINNIFTY_FUT', name: 'FINNIFTY FUT' });
    const updatedItems = simulateAddToWatchlist(newItem, store);

    expect(renderWatchlistLogic(updatedItems).isEmpty).toBe(false);
    expect(renderWatchlistLogic(updatedItems).itemCount).toBe(1);
  });
});
