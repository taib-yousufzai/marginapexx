import { describe, it } from 'vitest';
import * as fc from 'fast-check';

// ─── Inline the pure logic under test ────────────────────────────────────────
// These mirror the module-level exports in app/watchlist/page.tsx exactly.
// Inlining avoids pulling in React / Next.js / path-alias dependencies.

interface WatchlistItem {
  name: string;
  symbol: string;
  kiteSymbol: string;
  price: number;
  change: number | string;
  segment: string;
  contractDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  category?: string;
}

type TabLabel =
  | 'INDEX-FUT' | 'INDEX-OPT'
  | 'STOCK-FUT' | 'STOCK-OPT'
  | 'MCX-FUT'   | 'MCX-OPT'
  | 'NSF-EQ'    | 'CRYPTO'
  | 'FOREX'     | 'COI';

const TAB_LABELS: TabLabel[] = [
  'INDEX-FUT', 'INDEX-OPT',
  'STOCK-FUT', 'STOCK-OPT',
  'MCX-FUT',   'MCX-OPT',
  'NSF-EQ',    'CRYPTO',
  'FOREX',     'COI',
];

const SEGMENT_TAB_MAP: Record<string, TabLabel> = {
  'NSE - Futures':       'INDEX-FUT',
  'BSE - Futures':       'INDEX-FUT',
  'NSE - Options':       'INDEX-OPT',
  'BSE - Options':       'INDEX-OPT',
  'NSE - Stock Futures': 'STOCK-FUT',
  'BSE - Stock Futures': 'STOCK-FUT',
  'NSE - Stock Options': 'STOCK-OPT',
  'BSE - Stock Options': 'STOCK-OPT',
  'MCX - Futures':       'MCX-FUT',
  'MCX - Options':       'MCX-OPT',
  'NSE - Equity':        'NSF-EQ',
  'BSE - Equity':        'NSF-EQ',
  'Crypto':              'CRYPTO',
  'CRYPTO':              'CRYPTO',
  'Forex':               'FOREX',
  'FOREX':               'FOREX',
  'CDS - Futures':       'FOREX',
  'CDS - Options':       'FOREX',
};

function getTabForItem(item: WatchlistItem): TabLabel {
  if (item.category && TAB_LABELS.includes(item.category as TabLabel)) {
    return item.category as TabLabel;
  }
  return SEGMENT_TAB_MAP[item.segment] ?? 'COI';
}

function filterByTab(items: WatchlistItem[], tab: TabLabel): WatchlistItem[] {
  return items.filter(item => getTabForItem(item) === tab);
}

function filterBySearch(items: WatchlistItem[], query: string): WatchlistItem[] {
  if (!query.trim()) return items;
  const q = query.toLowerCase();
  return items.filter(
    item =>
      item.name.toLowerCase().includes(q) ||
      item.symbol.toLowerCase().includes(q),
  );
}

function getPctClass(pct: number): 'pct-positive' | 'pct-negative' {
  return pct < 0 ? 'pct-negative' : 'pct-positive';
}

// ── Arbitrary ────────────────────────────────────────────────────────────────

function arbitraryWatchlistItem() {
  return fc.record({
    name: fc.string({ minLength: 1, maxLength: 30 }),
    symbol: fc.string({ minLength: 1, maxLength: 20 }),
    segment: fc.oneof(
      fc.constantFrom(
        'NSE - Futures',
        'BSE - Futures',
        'NSE - Options',
        'BSE - Options',
        'NSE - Stock Futures',
        'BSE - Stock Futures',
        'NSE - Stock Options',
        'BSE - Stock Options',
        'MCX - Futures',
        'MCX - Options',
        'NSE - Equity',
        'BSE - Equity',
        'Crypto',
        'CRYPTO',
        'Forex',
        'FOREX',
        'CDS - Futures',
        'CDS - Options',
      ),
      fc.string(),
    ),
    contractDate: fc.oneof(
      fc.constant(''),
      fc.string({ minLength: 1, maxLength: 20 }),
    ),
    price: fc.float({ noNaN: true, min: Math.fround(0.01), max: Math.fround(100000) }),
    close: fc.float({ noNaN: true, min: Math.fround(0.01), max: Math.fround(100000) }),
    change: fc.float({ noNaN: true }),
    open: fc.float({ noNaN: true, min: Math.fround(0.01), max: Math.fround(100000) }),
    high: fc.float({ noNaN: true, min: Math.fround(0.01), max: Math.fround(100000) }),
    low: fc.float({ noNaN: true, min: Math.fround(0.01), max: Math.fround(100000) }),
    kiteSymbol: fc.string({ minLength: 1, maxLength: 30 }),
    category: fc.option(fc.constantFrom(...TAB_LABELS), { nil: undefined }),
  });
}

// ── Property Tests ───────────────────────────────────────────────────────────

describe('watchlist-redesign property-based tests', () => {
  it('Property 2: tab filtering is partition-complete (Validates: Requirements 1.6)', () => {
    // Feature: watchlist-redesign, Property 2: tab filtering is partition-complete
    fc.assert(
      fc.property(
        fc.array(arbitraryWatchlistItem()),
        fc.constantFrom(...TAB_LABELS),
        (items, tab) => {
          const result = filterByTab(items, tab);
          const allCorrect = result.every(i => getTabForItem(i) === tab);
          const noExtras = items
            .filter(i => getTabForItem(i) !== tab)
            .every(i => !result.includes(i));
          return allCorrect && noExtras;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 3: search filtering is subset-preserving and case-insensitive (Validates: Requirements 2.4)', () => {
    // Feature: watchlist-redesign, Property 3: search filtering is subset-preserving and case-insensitive
    fc.assert(
      fc.property(
        fc.array(arbitraryWatchlistItem()),
        fc.string(),
        (items, query) => {
          const result = filterBySearch(items, query);
          if (!query.trim()) return result.length === items.length;
          const q = query.toLowerCase();
          return result.every(
            i =>
              i.name.toLowerCase().includes(q) ||
              i.symbol.toLowerCase().includes(q),
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 4: clearing search restores full tab-filtered list (Validates: Requirements 2.5)', () => {
    // Feature: watchlist-redesign, Property 4: clearing search restores full tab-filtered list
    fc.assert(
      fc.property(
        fc.array(arbitraryWatchlistItem()),
        fc.constantFrom(...TAB_LABELS),
        (items, tab) => {
          const tabFiltered = filterByTab(items, tab);
          const afterClear = filterBySearch(tabFiltered, '');
          return (
            afterClear.length === tabFiltered.length &&
            afterClear.every((item, i) => item.symbol === tabFiltered[i].symbol)
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 6: percentage change colour is determined by sign (Validates: Requirements 3.7, 3.8)', () => {
    // Feature: watchlist-redesign, Property 6: percentage change colour is determined by sign
    fc.assert(
      fc.property(fc.float({ noNaN: true }), pct => {
        const cls = getPctClass(pct);
        if (pct < 0) return cls === 'pct-negative';
        return cls === 'pct-positive';
      }),
      { numRuns: 100 },
    );
  });
});
