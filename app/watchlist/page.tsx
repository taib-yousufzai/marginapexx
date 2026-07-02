'use client';
import { useState, useEffect, useRef, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Footer from '@/components/Footer';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/hooks/useAuth';
import { useMarketQuotes, QuoteData } from '@/hooks/useMarketQuotes';
import { useComexQuotes, ComexQuoteData } from '@/hooks/useComexQuotes';
import { useOrderEntry, OrderSide, OrderType, ProductType } from '@/hooks/useOrderEntry';
import { useActivePositions } from '@/hooks/useActivePositions';
import { useMobileBack } from '@/hooks/useMobileBack';
import dynamic from 'next/dynamic';
const TradingChart = dynamic(() => import('@/components/TradingChart'), { ssr: false });
import TradeSheet from '@/components/TradeSheet';
import './page.css';

interface WatchlistItem {
  name: string;
  symbol: string;
  kiteSymbol: string;
  binanceSymbol?: string;  // e.g. 'BTCUSDT' — crypto (Binance)
  comexSymbol?: string;  // e.g. 'GC=F'    — COMEX USD price (Yahoo Finance proxy, paired with kiteSymbol for MCX)
  price: number;
  change: string;
  segment: string;
  contractDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  category?: string;
  lotSize?: number;
}

declare global {
  interface Window {
    __kiteQuotes: Record<string, QuoteData>;
    __binanceQuotes: Record<string, QuoteData>;
    __comexQuotes: Record<string, ComexQuoteData>;
    __watchlistItems: WatchlistItem[];
    __renderWatchlist: () => void;
    __addToWatchlistCallback: (item: WatchlistItem) => void;
    __removeFromWatchlistCallback: (symbol: string) => void;
    __selectionModeActive?: boolean;
    __watchlistEventsAttached?: boolean;
    __isBasketModeActive?: boolean;
    __lastProcessedQuery?: string;
  }
}

const WATCHLIST_KEY = 'marginApex_watchlist';

function loadWatchlistFromStorage(userId?: string): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const key = userId ? `${WATCHLIST_KEY}_${userId}` : WATCHLIST_KEY;
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : [];
  } catch { return []; }
}

function saveWatchlistToStorage(items: WatchlistItem[], userId?: string) {
  try {
    const key = userId ? `${WATCHLIST_KEY}_${userId}` : WATCHLIST_KEY;
    localStorage.setItem(key, JSON.stringify(items));
  } catch { }
}

// ── Default Crypto Items (Binance) ──────────────────────────────────────────

// Crypto whitelist: only BTC, ETH, DOGE (Requirement 5.1)
const DEFAULT_CRYPTO_ITEMS: WatchlistItem[] = [
  { name: 'Bitcoin', symbol: 'BTC', kiteSymbol: '', binanceSymbol: 'BTCUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
  { name: 'Ethereum', symbol: 'ETH', kiteSymbol: '', binanceSymbol: 'ETHUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
  { name: 'Dogecoin', symbol: 'DOGE', kiteSymbol: '', binanceSymbol: 'DOGEUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
];

// ── Default Forex Items (Zerodha CDS segment — INR pairs) ──────────────────
// Update expiry month as contracts roll (format: CDS:XYZINR26MONFUT)

const DEFAULT_FOREX_ITEMS: WatchlistItem[] = [
  { name: 'USD/INR', symbol: 'USDINR_FUT', kiteSymbol: 'CDS:USDINR26JULFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'FOREX' },
  { name: 'EUR/INR', symbol: 'EURINR_FUT', kiteSymbol: 'CDS:EURINR26JULFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'FOREX' },
  { name: 'GBP/INR', symbol: 'GBPINR_FUT', kiteSymbol: 'CDS:GBPINR26JULFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'FOREX' },
  { name: 'JPY/INR', symbol: 'JPYINR_FUT', kiteSymbol: 'CDS:JPYINR26JULFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'FOREX' },
];

// ── Default COMEX Items (MCX ₹ via Kite + COMEX $ via Yahoo proxy) ──────────────
// Rows with both kiteSymbol + comexSymbol show a ₹⇄$ toggle pill

const DEFAULT_COMEX_ITEMS: WatchlistItem[] = [
  { name: 'Gold', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26AUGFUT', comexSymbol: 'GC=F', price: 0, change: '0%', segment: 'MCX - Futures', contractDate: 'Aug 2026', open: 0, high: 0, low: 0, close: 0, category: 'COI' },
  { name: 'Silver', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULFUT', comexSymbol: 'SI=F', price: 0, change: '0%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'COI' },
  { name: 'Crude Oil', symbol: 'CRUDEOIL_FUT', kiteSymbol: 'MCX:CRUDEOIL26JULFUT', comexSymbol: 'CL=F', price: 0, change: '0%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'COI' },
  { name: 'Copper', symbol: 'COPPER_FUT', kiteSymbol: 'MCX:COPPER26JULFUT', comexSymbol: 'HG=F', price: 0, change: '0%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'COI' },
];

function getDefaultWatchlistItems(): WatchlistItem[] {
  return [
    {
      name: 'NIFTY 50 INDEX',
      symbol: 'NIFTY_INDEX',
      kiteSymbol: 'NSE:NIFTY 50',
      price: 22456.80,
      change: '+0.45%',
      segment: 'NSE - Futures',
      contractDate: '28 Mar 2025',
      open: 22350,
      high: 22580,
      low: 22320,
      close: 22456.80
    },
    {
      name: 'BANKNIFTY INDEX',
      symbol: 'BANKNIFTY_INDEX',
      kiteSymbol: 'NSE:NIFTY BANK',
      price: 48210.50,
      change: '-0.21%',
      segment: 'NSE - Futures',
      contractDate: '28 Mar 2025',
      open: 48350,
      high: 48500,
      low: 48100,
      close: 48210.50
    },
    {
      name: 'SENSEX INDEX',
      symbol: 'SENSEX_INDEX',
      kiteSymbol: 'BSE:SENSEX',
      price: 74230.15,
      change: '+0.32%',
      segment: 'BSE - Futures',
      contractDate: '28 Mar 2025',
      open: 73950,
      high: 74500,
      low: 73800,
      close: 74230.15
    },
    ...DEFAULT_CRYPTO_ITEMS,
    ...DEFAULT_FOREX_ITEMS,
    ...DEFAULT_COMEX_ITEMS,
  ];
}

// ── Tab Labels ──────────────────────────────────────────────────────────────

export type TabLabel =
  | 'All'
  | 'INDEX-FUT'
  | 'INDEX-OPT'
  | 'MCX-FUT'
  | 'MCX-OPT'
  | 'STOCK-FUT'
  | 'STOCK-OPT'
  | 'NSE-EQ'
  | 'CRYPTO'
  | 'COMEX'
  | 'FOREX';

export const TAB_LABELS: TabLabel[] = [
  'All',
  'INDEX-FUT',
  'INDEX-OPT',
  'MCX-FUT',
  'MCX-OPT',
  'STOCK-FUT',
  'STOCK-OPT',
  'NSE-EQ',
  'CRYPTO',
  'COMEX',
  'FOREX'
];

// ── Segment → Tab Mapping ────────────────────────────────────────────────────

export const SEGMENT_TAB_MAP: Record<string, TabLabel> = {
  'NSE - Futures': 'INDEX-FUT',
  'BSE - Futures': 'INDEX-FUT',
  'NSE - Options': 'INDEX-OPT',
  'BSE - Options': 'INDEX-OPT',
  'NSE - Stock Futures': 'STOCK-FUT',
  'BSE - Stock Futures': 'STOCK-FUT',
  'NSE - Stock Options': 'STOCK-OPT',
  'BSE - Stock Options': 'STOCK-OPT',
  'MCX - Futures': 'MCX-FUT',
  'MCX - Options': 'MCX-OPT',
  'NSE - Equity': 'NSE-EQ',
  'BSE - Equity': 'NSE-EQ',
  'Crypto': 'CRYPTO',
  'CRYPTO': 'CRYPTO',
  'Forex': 'FOREX',
  'FOREX': 'FOREX',
  'CDS - Futures': 'FOREX',
  'CDS - Options': 'FOREX',
  'COMEX - Futures': 'COMEX',
  'COMEX - Options': 'COMEX',
  'COMEX': 'COMEX',
  'COI': 'COMEX',
};

// ── Pure Helper Functions ────────────────────────────────────────────────────

/** Maps a WatchlistItem to its TabLabel. Checks category first, then segment. */
export function getTabForItem(item: WatchlistItem): TabLabel {
  if (item.category) {
    const c = item.category.toUpperCase();
    if (c.includes('INDEX - FUTURE')) return 'INDEX-FUT';
    if (c.includes('INDEX - OPTIONS')) return 'INDEX-OPT';
    if (c.includes('STOCKS - FUTURE')) return 'STOCK-FUT';
    if (c.includes('MCX - FUTURE')) return 'MCX-FUT';
    if (c.includes('MCX - OPTIONS')) return 'MCX-OPT';
    if (c.includes('CRYPTO')) return 'CRYPTO';
    if (c.includes('FOREX')) return 'FOREX';
    if (c.includes('COMEX')) return 'COMEX';
  }

  if (item.segment && SEGMENT_TAB_MAP[item.segment]) {
    return SEGMENT_TAB_MAP[item.segment];
  }
  return 'INDEX-FUT'; // Fallback
}

/** Filters items to those belonging to the active tab. */
export function filterByTab(items: WatchlistItem[], tab: TabLabel): WatchlistItem[] {
  if (tab === 'All') return items;
  return items.filter(item => getTabForItem(item) === tab);
}

/** Filters items by word-start match on name/symbol. "Nif" matches "NIFTY" but not "FINNIFTY". */
export function filterBySearch(items: WatchlistItem[], query: string): WatchlistItem[] {
  if (!query.trim()) return items;
  const q = query.toLowerCase();

  function wordStartMatch(text: string): boolean {
    const t = text.toLowerCase();
    if (t.startsWith(q)) return true;
    const words = t.split(/[\s\-_\/]/);
    return words.some(w => w.startsWith(q));
  }

  return items.filter(
    item => wordStartMatch(item.name) || wordStartMatch(item.symbol)
  );
}

/** Derives the exchange badge string from a segment string. */
export function getExchangeBadge(segment: string): string {
  if (segment.startsWith('NSE') && segment !== 'NSE - Equity') return 'NFO';
  if (segment.startsWith('BSE') && segment !== 'BSE - Equity') return 'BFO';
  if (segment.startsWith('MCX')) return 'MCX';
  if (segment.startsWith('CDS')) return 'CDS';
  if (segment === 'NSE - Equity') return 'NSE';
  if (segment === 'BSE - Equity') return 'BSE';
  return 'OTH';
}

/** Returns the CSS class for a percentage change value. */
export function getPctClass(pct: number): 'pct-positive' | 'pct-negative' {
  return pct < 0 ? 'pct-negative' : 'pct-positive';
}

// ── SegmentTabBar Component ──────────────────────────────────────────────────

interface SegmentTabBarProps {
  activeTab: TabLabel;
  onTabChange: (tab: TabLabel) => void;
const DEFAULT_CRYPTO_ITEMS: WatchlistItem[] = [
  { name: 'Bitcoin', symbol: 'BTC', kiteSymbol: '', binanceSymbol: 'BTCUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
  { name: 'Ethereum', symbol: 'ETH', kiteSymbol: '', binanceSymbol: 'ETHUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
  { name: 'Dogecoin', symbol: 'DOGE', kiteSymbol: '', binanceSymbol: 'DOGEUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
];

// ── Default Forex Items (Zerodha CDS segment — INR pairs) ──────────────────
// Update expiry month as contracts roll (format: CDS:XYZINR26MONFUT)

const DEFAULT_FOREX_ITEMS: WatchlistItem[] = [
  { name: 'USD/INR', symbol: 'USDINR_FUT', kiteSymbol: 'CDS:USDINR26JULFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'FOREX' },
  { name: 'EUR/INR', symbol: 'EURINR_FUT', kiteSymbol: 'CDS:EURINR26JULFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'FOREX' },
  { name: 'GBP/INR', symbol: 'GBPINR_FUT', kiteSymbol: 'CDS:GBPINR26JULFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'FOREX' },
  { name: 'JPY/INR', symbol: 'JPYINR_FUT', kiteSymbol: 'CDS:JPYINR26JULFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'FOREX' },
];

// ── Default COMEX Items (MCX ₹ via Kite + COMEX $ via Yahoo proxy) ──────────────
// Rows with both kiteSymbol + comexSymbol show a ₹⇄$ toggle pill

const DEFAULT_COMEX_ITEMS: WatchlistItem[] = [
  { name: 'Gold', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26AUGFUT', comexSymbol: 'GC=F', price: 0, change: '0%', segment: 'MCX - Futures', contractDate: 'Aug 2026', open: 0, high: 0, low: 0, close: 0, category: 'COI' },
  { name: 'Silver', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULFUT', comexSymbol: 'SI=F', price: 0, change: '0%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'COI' },
  { name: 'Crude Oil', symbol: 'CRUDEOIL_FUT', kiteSymbol: 'MCX:CRUDEOIL26JULFUT', comexSymbol: 'CL=F', price: 0, change: '0%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'COI' },
  { name: 'Copper', symbol: 'COPPER_FUT', kiteSymbol: 'MCX:COPPER26JULFUT', comexSymbol: 'HG=F', price: 0, change: '0%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'COI' },
];

function getDefaultWatchlistItems(): WatchlistItem[] {
  return [
    {
      name: 'NIFTY 50 INDEX',
      symbol: 'NIFTY_INDEX',
      kiteSymbol: 'NSE:NIFTY 50',
      price: 22456.80,
      change: '+0.45%',
      segment: 'NSE - Futures',
      contractDate: '28 Mar 2025',
      open: 22350,
      high: 22580,
      low: 22320,
      close: 22456.80
    },
    {
      name: 'BANKNIFTY INDEX',
      symbol: 'BANKNIFTY_INDEX',
      kiteSymbol: 'NSE:NIFTY BANK',
      price: 48210.50,
      change: '-0.21%',
      segment: 'NSE - Futures',
      contractDate: '28 Mar 2025',
      open: 48350,
      high: 48500,
      low: 48100,
      close: 48210.50
    },
    {
      name: 'SENSEX INDEX',
      symbol: 'SENSEX_INDEX',
      kiteSymbol: 'BSE:SENSEX',
      price: 74230.15,
      change: '+0.32%',
      segment: 'BSE - Futures',
      contractDate: '28 Mar 2025',
      open: 73950,
      high: 74500,
      low: 73800,
      close: 74230.15
    },
    ...DEFAULT_CRYPTO_ITEMS,
    ...DEFAULT_FOREX_ITEMS,
    ...DEFAULT_COMEX_ITEMS,
  ];
}

// ── Tab Labels ──────────────────────────────────────────────────────────────

export type TabLabel =
  | 'All'
  | 'INDEX-FUT'
  | 'INDEX-OPT'
  | 'MCX-FUT'
  | 'MCX-OPT'
  | 'STOCK-FUT'
  | 'STOCK-OPT'
  | 'NSE-EQ'
  | 'CRYPTO'
  | 'COMEX'
  | 'FOREX';

export const TAB_LABELS: TabLabel[] = [
  'All',
  'INDEX-FUT',
  'INDEX-OPT',
  'MCX-FUT',
  'MCX-OPT',
  'STOCK-FUT',
  'STOCK-OPT',
  'NSE-EQ',
  'CRYPTO',
  'COMEX',
  'FOREX'
];

// ── Segment → Tab Mapping ────────────────────────────────────────────────────

export const SEGMENT_TAB_MAP: Record<string, TabLabel> = {
  'NSE - Futures': 'INDEX-FUT',
  'BSE - Futures': 'INDEX-FUT',
  'NSE - Options': 'INDEX-OPT',
  'BSE - Options': 'INDEX-OPT',
  'NSE - Stock Futures': 'STOCK-FUT',
  'BSE - Stock Futures': 'STOCK-FUT',
  'NSE - Stock Options': 'STOCK-OPT',
  'BSE - Stock Options': 'STOCK-OPT',
  'MCX - Futures': 'MCX-FUT',
  'MCX - Options': 'MCX-OPT',
  'NSE - Equity': 'NSE-EQ',
  'BSE - Equity': 'NSE-EQ',
  'Crypto': 'CRYPTO',
  'CRYPTO': 'CRYPTO',
  'Forex': 'FOREX',
  'FOREX': 'FOREX',
  'CDS - Futures': 'FOREX',
  'CDS - Options': 'FOREX',
  'COMEX - Futures': 'COMEX',
  'COMEX - Options': 'COMEX',
  'COMEX': 'COMEX',
  'COI': 'COMEX',
};

// ── Pure Helper Functions ────────────────────────────────────────────────────

/** Maps a WatchlistItem to its TabLabel. Checks category first, then segment. */
export function getTabForItem(item: WatchlistItem): TabLabel {
  if (item.category) {
    const c = item.category.toUpperCase();
    if (c.includes('INDEX - FUTURE')) return 'INDEX-FUT';
    if (c.includes('INDEX - OPTIONS')) return 'INDEX-OPT';
    if (c.includes('STOCKS - FUTURE')) return 'STOCK-FUT';
    if (c.includes('MCX - FUTURE')) return 'MCX-FUT';
    if (c.includes('MCX - OPTIONS')) return 'MCX-OPT';
    if (c.includes('CRYPTO')) return 'CRYPTO';
    if (c.includes('FOREX')) return 'FOREX';
    if (c.includes('COMEX')) return 'COMEX';
  }

  if (item.segment && SEGMENT_TAB_MAP[item.segment]) {
    return SEGMENT_TAB_MAP[item.segment];
  }
  return 'INDEX-FUT'; // Fallback
}

/** Filters items to those belonging to the active tab. */
export function filterByTab(items: WatchlistItem[], tab: TabLabel): WatchlistItem[] {
  if (tab === 'All') return items;
  return items.filter(item => getTabForItem(item) === tab);
}

/** Filters items by word-start match on name/symbol. "Nif" matches "NIFTY" but not "FINNIFTY". */
export function filterBySearch(items: WatchlistItem[], query: string): WatchlistItem[] {
  if (!query.trim()) return items;
  const q = query.toLowerCase();

  function wordStartMatch(text: string): boolean {
    const t = text.toLowerCase();
    if (t.startsWith(q)) return true;
    const words = t.split(/[\s\-_\/]/);
    return words.some(w => w.startsWith(q));
  }

  return items.filter(
    item => wordStartMatch(item.name) || wordStartMatch(item.symbol)
  );
}

/** Derives the exchange badge string from a segment string. */
export function getExchangeBadge(segment: string): string {
  if (segment.startsWith('NSE') && segment !== 'NSE - Equity') return 'NFO';
  if (segment.startsWith('BSE') && segment !== 'BSE - Equity') return 'BFO';
  if (segment.startsWith('MCX')) return 'MCX';
  if (segment.startsWith('CDS')) return 'CDS';
  if (segment === 'NSE - Equity') return 'NSE';
  if (segment === 'BSE - Equity') return 'BSE';
  return 'OTH';
}

/** Returns the CSS class for a percentage change value. */
export function getPctClass(pct: number): 'pct-positive' | 'pct-negative' {
  return pct < 0 ? 'pct-negative' : 'pct-positive';
}

// ── SegmentTabBar Component ──────────────────────────────────────────────────

interface SegmentTabBarProps {
  activeTab: TabLabel;
  onTabChange: (tab: TabLabel) => void;
}

function SegmentTabBar({ activeTab, onTabChange }: SegmentTabBarProps) {
  return (
    <div className="seg-tab-bar">
      {TAB_LABELS.map(label => (
        <button
          key={label}
          className={`seg-tab${activeTab === label ? ' seg-tab--active' : ''}`}
          onClick={() => onTabChange(label)}
          suppressHydrationWarning
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── InstrumentRow Component ─────────────────────────────────────────────────

interface InstrumentRowProps {
  item: WatchlistItem;
  quote?: QuoteData;
  binanceQuote?: QuoteData;
  comexQuote?: ComexQuoteData;
  onTrade: (item: WatchlistItem) => void;
  onDetail: (item: WatchlistItem) => void;
  basketMode?: boolean;
  onBasketBuy?: (item: WatchlistItem) => void;
  onBasketSell?: (item: WatchlistItem) => void;
  onChart?: (item: WatchlistItem) => void;
}

function InstrumentRow({ item, quote, binanceQuote, comexQuote, onTrade, onDetail, basketMode, onBasketBuy, onBasketSell, onChart }: InstrumentRowProps) {
  const [priceView, setPriceView] = useState<'kite' | 'comex'>('kite');

  const isCrypto = !!item.binanceSymbol;
  const hasDualView = !!item.kiteSymbol && !!item.comexSymbol;
  const showComex = hasDualView && priceView === 'comex';

  let ltp = 0;
  let prevClose = 0;
  let percentChange = 0;
  let absoluteChange = 0;

  if (isCrypto) {
    ltp = binanceQuote?.lastPrice ?? 0;
    prevClose = binanceQuote?.close ?? 0;
    absoluteChange = ltp - prevClose;
    percentChange = prevClose !== 0 ? ((ltp - prevClose) / prevClose) * 100 : 0;
  } else if (showComex) {
    ltp = comexQuote?.lastPrice ?? 0;
    prevClose = comexQuote?.close ?? 0;
    absoluteChange = ltp - prevClose;
    percentChange = prevClose !== 0 ? ((ltp - prevClose) / prevClose) * 100 : 0;
  } else {
    ltp = quote?.lastPrice ?? item.price;
    if (quote) {
      prevClose = quote.close ?? ltp;
      absoluteChange = ltp - prevClose;
      percentChange = prevClose !== 0 ? ((ltp - prevClose) / prevClose) * 100 : 0;
    } else {
      const match = item.change ? item.change.match(/([-+]?[0-9]*\.?[0-9]+)%/) : null;
      percentChange = match ? parseFloat(match[1]) : 0;
      prevClose = percentChange !== -100 ? (ltp / (1 + percentChange / 100)) : ltp;
      absoluteChange = ltp - prevClose;
    }
  }
  const isLoading = isCrypto ? !binanceQuote : (showComex && !comexQuote);

  const handleLeftClick = () => {
    if (basketMode) return;
    onDetail(item);
  };

  const handleRightClick = () => {
    if (basketMode) return;
    onDetail(item);
  };

  return (
    <div className="instr-row watchlist-card" data-symbol={item.symbol}>
      <div className="wc-swipe-actions">
        <button className="wc-action-btn delete-btn" onClick={(e) => { e.stopPropagation(); (window as any).removeFromWatchlist?.(item.symbol); }}>
          <i className="fas fa-trash-alt"></i>
        </button>
      </div>
      <div className="wc-content instr-row__content">
        <div className="instr-row__left" onClick={handleLeftClick} style={{ cursor: 'pointer' }}>
          <div className="instr-row__name-line">
            <span className="instr-row__name">{item.name}</span>
            <span className="exchange-badge" style={
              isCrypto ? { background: '#F0A500', color: '#fff' } :
                showComex ? { background: '#4A148C', color: '#fff' } : {}
            }>
              {isCrypto ? 'CRYPTO' : showComex ? 'COMEX' : getExchangeBadge(item.segment)}
            </span>
            {!basketMode && onChart && (
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onChart(item);
                }}
                style={{ background: 'none', border: 'none', color: '#2C8E5A', cursor: 'pointer', padding: '0 4px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center' }}
                title="Open Chart"
              >
                <i className="fas fa-chart-simple"></i>
              </button>
            )}
          </div>
          {item.contractDate && (
            <div className="instr-row__date">{item.contractDate}</div>
          )}
          {isCrypto && (
            <div className="instr-row__date" style={{ color: '#6B7280', fontSize: '0.7rem' }}>{item.binanceSymbol}</div>
          )}
          {hasDualView && (
            <div
              className="mcx-comex-switch"
              onClick={(e) => { e.stopPropagation(); setPriceView(v => v === 'kite' ? 'comex' : 'kite'); }}
              style={{ fontSize: '0.62rem', fontWeight: '700', color: showComex ? '#4A148C' : '#2C8E5A', background: showComex ? '#EDE7F6' : '#E9F6EF', padding: '2px 8px', borderRadius: '20px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '3px', userSelect: 'none' }}
            >
              {showComex ? '₹ COMEX ⇄ ₹ MCX' : '₹ MCX ⇄ ₹ COMEX'}
            </div>
          )}
        </div>
        <div className="instr-row__right" onClick={handleRightClick} style={{ cursor: 'pointer' }}>
          {isLoading ? (
            <div className="instr-row__ltp" style={{ color: '#9CA3AF' }}>Loading…</div>
          ) : (
            <>
              <div className="instr-row__ltp">
                {`₹${ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </div>
              <div className="instr-row__abs-change">{absoluteChange >= 0 ? '+' : ''}{absoluteChange.toFixed(2)}</div>
              <div className={`instr-row__pct-change ${getPctClass(percentChange)}`}>
                {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%
              </div>
            </>
          )}
        </div>
        {!basketMode && (
          <button className="instrument-delete-btn" onClick={(e) => { e.stopPropagation(); (window as any).removeFromWatchlist?.(item.symbol); }}>
            <i className="fas fa-trash-alt"></i>
          </button>
        )}
        <div className="wc-checkbox-wrapper" style={{ display: 'none' }}>
          <input type="checkbox" className="wc-checkbox" onClick={(e) => e.stopPropagation()} />
        </div>
        {basketMode && (
          <div className="wc-basket-actions" onClick={(e) => e.stopPropagation()}>
            <button className="wc-basket-buy" onClick={() => onBasketBuy?.(item)}>BUY</button>
            <button className="wc-basket-sell" onClick={() => onBasketSell?.(item)}>SELL</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── EmptyState Component ────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="watchlist-empty-state">
      <div className="watchlist-empty-state__icon">
        <i className="fas fa-inbox"></i>
      </div>
      <div className="watchlist-empty-state__title">No instruments here</div>
      <div className="watchlist-empty-state__subtitle">Add instruments from the Library to this segment</div>
    </div>
  );
}

// ── Trading Segments Data ────────────────────────────────────────────────────

interface TradingInstrument {
  name: string; symbol: string; kiteSymbol: string; price: number; change: string;
  segment: string; contractDate: string; open: number; high: number; low: number; close: number;
  binanceSymbol?: string; comexSymbol?: string;
}
interface TradingSubCategory { name: string; instruments: TradingInstrument[]; }
interface TradingSegment { name: string; icon: string; instruments?: TradingInstrument[]; subCategories?: TradingSubCategory[]; }

function WatchlistContent() {
  const [tradingSegments, setTradingSegments] = useState<TradingSegment[]>([]);
  const tradingSegmentsRef = useRef<TradingSegment[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).__initialTradingSegments) {
      setTradingSegments((window as any).__initialTradingSegments);
      tradingSegmentsRef.current = (window as any).__initialTradingSegments;
    }

    fetch('/api/market/instruments/library')
      .then(res => res.ok ? res.json() : Promise.reject('fetch failed'))
      .then(data => {
        if (data.segments) {
          setTradingSegments(data.segments);
          tradingSegmentsRef.current = data.segments;
        }
      })
      .catch(err => console.error('Failed to load library segments:', err));
  }, []);

  const router = useRouter();
  const searchParams = useSearchParams();
  useAuth();
  const { placeOrder, loading: placingOrder, error: placeOrderError } = useOrderEntry();
  const { positions: activePositions } = useActivePositions();

  // Reset body overflow when this page unmounts (prevents scroll lock on other pages)
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
      document.body.style.overflowY = '';
      window.__selectionModeActive = false;
    };
  }, []);

  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabLabel>('All');
  const [searchText, setSearchText] = useState<string>('');
  const [isFolderDrawerOpen, setIsFolderDrawerOpen] = useState(false);
  const [expandedSegments, setExpandedSegments] = useState<Record<string, boolean>>({});
  const [allowedSegments, setAllowedSegments] = useState<string[] | null>(null);
  const [segmentSettings, setSegmentSettings] = useState<any[]>([]);
  const [scriptSettings, setScriptSettings] = useState<{ symbol: string; lot_size: number }[]>([]);
  const [userId, setUserId] = useState<string>('');

  const getWatchlistLotSize = (item: any): number => {
    if (item && item.lotSize && item.lotSize > 0) return item.lotSize;
    const n = (item.name || '').toUpperCase();
    const s = (item.symbol || '').toUpperCase();
    const sortedSettings = [...scriptSettings].sort((a, b) => b.symbol.length - a.symbol.length);
    const dbMatch = sortedSettings.find(set => 
      n.includes(set.symbol.toUpperCase()) || 
      s.includes(set.symbol.toUpperCase())
    );
    if (dbMatch) return Number(dbMatch.lot_size);
    if (n.includes('BANKNIFTY') || n.includes('BANKEX')) return 15;
    if (n.includes('FINNIFTY')) return 25;
    if (n.includes('MIDCP') || n.includes('MIDCAP')) return 50;
    if (n.includes('SENSEX')) return 10;
    if (n.includes('NIFTY')) return 25;
    if (n.includes('GOLDM')) return 10;
    if (n.includes('GOLD')) return 100;
    if (n.includes('SILVERM')) return 5;
    if (n.includes('SILVER')) return 30;
    if (n.includes('CRUDEOILM')) return 10;
    if (n.includes('CRUDEOIL')) return 100;
    if (n.includes('NATGASMINI')) return 250;
    if (n.includes('NATURALGAS')) return 1250;
    return 1;
  };

  useEffect(() => {
    async function fetchAllowedSegments() {
      try {
        const { supabase: sb } = await import('@/lib/supabaseClient');
        const { data: { session } } = await sb.auth.getSession();
        if (!session) { setAllowedSegments([]); return; }
        
        setUserId(session.user.id);

        // Also save to window for easy inline script access
        (window as any).__accessToken = session.access_token;
        
        const controller1 = new AbortController();
        const t1 = setTimeout(() => controller1.abort('Timeout'), 5000);
        const res = await fetch('/api/user/profile', {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: controller1.signal
        });
        clearTimeout(t1);

        if (res.ok) {
          const profile = await res.json();
          // Use profile.segments if set, otherwise empty array means all allowed
          setAllowedSegments(profile?.segments ?? []);

          // Fetch segment settings and script settings in parallel
          const mode = profile?.trading_mode || 'normal';
          const controller2 = new AbortController();
          const t2 = setTimeout(() => controller2.abort('Timeout'), 5000);
          
          const [resSettings, resScript] = await Promise.all([
            fetch(`/api/user/segments?mode=${mode}`, {
              headers: { Authorization: `Bearer ${session.access_token}` },
              signal: controller2.signal
            }),
            fetch('/api/user/script-settings', {
              headers: { Authorization: `Bearer ${session.access_token}` },
              signal: controller2.signal
            }),
          ]);
          clearTimeout(t2);
          
          if (resSettings.ok) {
            const settingsData = await resSettings.json();
            setSegmentSettings(settingsData || []);
          }
          if (resScript.ok) {
            const scriptData = await resScript.json();
            setScriptSettings(scriptData || []);
          }
        } else {
          // On error, fall back to allowing all
          setAllowedSegments([]);
        }
      } catch (err) {
        if (err !== 'Timeout' && (err as Error)?.name !== 'AbortError') {
          console.warn('Failed to fetch allowed segments', err);
        }
        // On error, fall back to allowing all
        setAllowedSegments([]);
      }
    }
    fetchAllowedSegments();
  }, []);



  // Toast State
  const [toast, setToast] = useState<{ msg: string; isError: boolean; visible: boolean }>({
    msg: '', isError: false, visible: false
  });
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (msg: string, isError: boolean) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, isError, visible: true });
    toastTimerRef.current = setTimeout(() => {
      setToast(t => ({ ...t, visible: false }));
    }, 1500);
  };

  useEffect(() => {
    (window as any).showToast = showToast;
  }, [showToast]);

  // Trade Sheet State
  const [selectedItem, setSelectedItem] = useState<WatchlistItem | null>(null);
  const [isBenchmarkChart, setIsBenchmarkChart] = useState<boolean>(false);
  const [chartItem, setChartItem] = useState<WatchlistItem | null>(null);

  const [tradeSide, setTradeSide] = useState<'BUY' | 'SELL' | 'BOTH'>('BOTH');
  const [orderQty, setOrderQty] = useState(1);
  const [qtyInput, setQtyInput] = useState('1');
  const [orderUnit, setOrderUnit] = useState('qty');
  const [orderType, setOrderType] = useState('MARKET');
  const [productType, setProductType] = useState('INTRADAY');
  const [slTpOpen, setSlTpOpen] = useState(false);
  const [slPrice, setSlPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');
  const openDetailSheet = (item: any) => {};
  const [isTradeSheetOpen, setIsTradeSheetOpen] = useState(false);


  const marketSymbols = useMemo(() => {
    const list: string[] = [];
    watchlistItems.forEach(i => {
      if (i.kiteSymbol) list.push(i.kiteSymbol);
      if (i.binanceSymbol) list.push(i.binanceSymbol);
    });
    return list;
  }, [watchlistItems]);

  const { quotes: marketQuotes } = useMarketQuotes(marketSymbols);

  const comexSymbols = watchlistItems
    .map(i => i.comexSymbol)
    .filter((s): s is string => !!s);
  const { quotes: comexQuotes } = useComexQuotes(comexSymbols, 1000);

                onBasketSell={(it) => setBasketLegs(prev => {
                  // If SELL leg already exists for this symbol, remove it (toggle off)
                  const exists = prev.find(l => l.item.symbol === it.symbol && l.side === 'SELL');
                  if (exists) {
                    showToast(`${it.name} SELL removed`, false);
                    return prev.filter(l => !(l.item.symbol === it.symbol && l.side === 'SELL'));
                  }
                  showToast(`${it.name} SELL added to basket ✓`, false);
                  return [...prev, { item: it, side: 'SELL', qty: 1, unit: 'qty' }];
                })}
              />
            ))}
            <div id="watchlistMobileContainer"></div>
          </div>
        </div>
      </div>

      {/* Basket bottom bar */}
      {basketMode && (
        <div style={{
          position: 'fixed', bottom: '92px', left: '50%', transform: 'translateX(-50%)',
          width: 'calc(100% - 24px)', maxWidth: '476px',
          background: 'var(--container-bg, #FFFFFF)',
          borderTop: '1px solid var(--border-light, #E8ECF0)', padding: '10px 16px',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.15)', zIndex: 44,
          boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '8px',
          borderRadius: '16px'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-primary, #1A1E2B)' }}>
            {basketLegs.length} in basket
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => { setBasketMode(false); setBasketLegs([]); }}
              style={{ flex: 1, background: 'var(--icon-bg, #F3F4F6)', color: 'var(--text-secondary, #4B5563)', border: 'none', padding: '11px 0', borderRadius: '30px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <i className="fas fa-times"></i> Cancel
            </button>
            <button
              onClick={() => {
                const sheet = document.getElementById('basketSheet');
                const overlay = document.getElementById('basketSheetOverlay');
                if (sheet) sheet.classList.add('open');
                if (overlay) overlay.classList.add('active');
              }}
              style={{ flex: 2, background: '#15803D', color: '#fff', border: 'none', padding: '11px 0', borderRadius: '30px', fontSize: '0.85rem', fontWeight: '800', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <i className="fas fa-shopping-basket"></i> View Basket
            </button>
          </div>
        </div>
      )}

      {isTradeSheetOpen && selectedItem && (
        <TradeSheet
          item={selectedItem as any}
          side={tradeSide === 'BOTH' ? 'BUY' : tradeSide}
          onClose={closeTradeSheet}
        />
      )}

      <div id="detailSheetOverlay" className="trade-sheet-overlay" onClick={() => { const sheet = document.getElementById('detailSheet'); const overlay = document.getElementById('detailSheetOverlay'); if (sheet) sheet.classList.remove('open'); if (overlay) overlay.classList.remove('active'); }}></div>
      <div id="detailSheet" className="trade-sheet detail-sheet" style={{ height: 'auto', maxHeight: '72dvh', paddingBottom: '16px' }}>
        <div className="sheet-handle"><div className="handle-bar"></div></div>
        {selectedItem && (() => {
          const ltp = currentLtp;
          const bid = rawBid;
          const ask = rawAsk;
          const chgPct = currentChangePercent;
          const fmt = (v: number) => formatPrice(v);
          return (
            <div style={{ padding: '0' }}>
              <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px' }}>
                  <button style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--icon-bg)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '0', flexShrink: 0 }} onClick={() => { const sheet = document.getElementById('detailSheet'); const overlay = document.getElementById('detailSheetOverlay'); if (sheet) sheet.classList.remove('open'); if (overlay) overlay.classList.remove('active'); }}>
                    <i className="fas fa-chevron-left" style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}></i>
                  </button>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-primary)', lineHeight: '1.15' }}>{selectedItem.name}</div>
                    <div>
                      <span style={{ fontSize: '0.51rem', fontWeight: '700', color: '#DC2626', background: '#FEF2F2', padding: '2px 6px', borderRadius: '20px', lineHeight: '1', display: 'inline-block' }}>{selectedItem.segment}</span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', textAlign: 'right' }}>
                  <span style={{ fontSize: '0.65rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1px', lineHeight: '1' }}>CMP</span>
                  <div style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--text-primary)', lineHeight: '1.1', letterSpacing: '-0.3px' }}>{fmt(ltp)}</div>
                  <span className="sheet-change" style={{ fontSize: '0.78rem', fontWeight: '700', padding: '0', lineHeight: '1', color: chgPct >= 0 ? '#059669' : '#DC2626' }}>{chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%</span>
                </div>
              </div>
              <div style={{ height: '1px', background: 'var(--border-light)', margin: '0 0 8px', width: '100%' }}></div>
              <div style={{ padding: '0 12px 10px 12px' }}>
                {/* Open Trading Chart Button */}
                <button
                  style={{
                    width: '100%',
                    padding: '9px',
                    borderRadius: '50px',
                    border: '1px solid rgba(44, 142, 90, 0.6)',
                    background: 'transparent',
                    color: '#2C8E5A',
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    marginBottom: '8px',
                    transition: 'all 0.18s'
                  }}
                  onClick={() => {
                    setChartItem(selectedItem);
                    setIsBenchmarkChart(false);
                    const detailSheet = document.getElementById('detailSheet');
                    const detailOverlay = document.getElementById('detailSheetOverlay');
                    if (detailSheet) detailSheet.classList.remove('open');
                    if (detailOverlay) detailOverlay.classList.remove('active');
                    const chartSheet = document.getElementById('chartSheet');
                    const chartOverlay = document.getElementById('chartSheetOverlay');
                    if (chartSheet) chartSheet.classList.add('open');
                    if (chartOverlay) chartOverlay.classList.add('active');
                  }}
                >
                  <svg 
                    viewBox="0 0 24 24" 
                    style={{
                      width: '1.1rem',
                      height: '1.1rem',
                      display: 'inline-block',
                      verticalAlign: 'middle',
                    }}
                  >
                    {/* Bars */}
                    <rect x="4" y="16" width="2.5" height="4" rx="0.5" fill="currentColor" />
                    <rect x="9" y="13" width="2.5" height="7" rx="0.5" fill="currentColor" />
                    <rect x="14" y="14" width="2.5" height="6" rx="0.5" fill="currentColor" />
                    <rect x="19" y="11" width="2.5" height="9" rx="0.5" fill="currentColor" />
                    
                    {/* Trendline */}
                    <path 
                      d="M 4 14 L 8 9 L 13 12 L 20 4" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                    />
                    {/* Arrowhead */}
                    <polyline 
                      points="15 4 20 4 20 9" 
                      fill="none" 
                      stroke="currentColor" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                    />
                  </svg>
                  Open Trading Chart
                </button>

                  <div style={{ background: 'var(--card-alt-bg)', border: '1px solid var(--border-card)', borderRadius: '14px', padding: '8px 12px', display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.58rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '3px' }}>BID</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#059669' }}>{fmt(rawBid)}</div>
                    </div>
                    <div style={{ width: '1px', background: 'var(--border-card)', height: '24px' }}></div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.58rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '3px' }}>ASK</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#DC2626' }}>{fmt(rawAsk)}</div>
                    </div>
                  </div>
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '0.62rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>PRICE SUMMARY</div>
                    <div style={{ background: 'var(--card-alt-bg)', border: '1px solid var(--border-card)', borderRadius: '14px', padding: '8px 10px', display: 'flex', justifyContent: 'space-between' }}>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.52rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '3px' }}>OPEN</div><div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#059669' }}>{fmt((isCrypto && currentBinanceQuote?.open) || (isComex && currentComexQuote?.open) || currentKiteQuote?.open || selectedItem.open)}</div></div>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.52rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '3px' }}>HIGH</div><div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#059669' }}>{fmt((isCrypto && currentBinanceQuote?.high) || (isComex && currentComexQuote?.high) || currentKiteQuote?.high || selectedItem.high)}</div></div>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.52rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '3px' }}>LOW</div><div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#DC2626' }}>{fmt((isCrypto && currentBinanceQuote?.low) || (isComex && currentComexQuote?.low) || currentKiteQuote?.low || selectedItem.low)}</div></div>
                      <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.52rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '3px' }}>CLOSE</div><div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-primary)' }}>{fmt((isCrypto && currentBinanceQuote?.close) || (isComex && currentComexQuote?.close) || currentKiteQuote?.close || selectedItem.close)}</div></div>
                    </div>
                  </div>
                <div style={{ background: 'var(--card-alt-bg)', border: '1px solid var(--border-card)', borderRadius: '14px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: '600', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="far fa-calendar-alt"></i> CONTRACT DATE</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-primary)', background: 'var(--bg-card)', padding: '3px 10px', borderRadius: '20px' }}>{selectedItem.contractDate}</div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button style={{ flex: 1, background: '#15803D', color: 'white', border: 'none', padding: '11px 0', borderRadius: '30px', fontSize: '0.9rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', touchAction: 'manipulation' }} onClick={() => openTradeSheet(selectedItem, 'BUY')} onTouchEnd={(e) => { e.preventDefault(); openTradeSheet(selectedItem, 'BUY'); }}>
                    <i className="fas fa-arrow-up"></i> BUY
                  </button>
                  <button style={{ flex: 1, background: '#B91C1C', color: 'white', border: 'none', padding: '11px 0', borderRadius: '30px', fontSize: '0.9rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', touchAction: 'manipulation' }} onClick={() => openTradeSheet(selectedItem, 'SELL')} onTouchEnd={(e) => { e.preventDefault(); openTradeSheet(selectedItem, 'SELL'); }}>
                    <i className="fas fa-arrow-down"></i> SELL
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <div id="basketSheetOverlay" className="trade-sheet-overlay" onClick={() => { const sheet = document.getElementById('basketSheet'); const overlay = document.getElementById('basketSheetOverlay'); if (sheet) sheet.classList.remove('open'); if (overlay) overlay.classList.remove('active'); }}></div>

      <div id="basketSheet" className="trade-sheet detail-sheet" style={{ height: 'auto', maxHeight: '90dvh', paddingBottom: '30px' }}>
        <div className="sheet-handle"><div className="handle-bar"></div></div>
        <div style={{ padding: '24px 20px 20px 20px' }}>
          <div className="basket-sheet-title" style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '16px' }}><i className="fas fa-shopping-basket"></i> Basket Orders</div>

          {/* Basket legs - React rendered */}
          <div style={{ maxHeight: '40dvh', overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {basketLegs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px', color: '#9CA3AF', fontSize: '0.8rem' }}>
                <i className="fas fa-shopping-basket" style={{ fontSize: '2rem', marginBottom: '8px', display: 'block', opacity: 0.3 }}></i>
                No items. Tap BUY/SELL on any stock.
              </div>
            ) : basketLegs.map((leg, i) => {
              const ltp = getLegPrice(leg.item);
              const totalVal = ltp * leg.qty;
              const legSymbol = '₹';
              return (
                <div key={i} style={{ background: 'var(--card-alt-bg, #F8FAFF)', border: '1px solid var(--border-card, #EEF2F8)', borderRadius: '16px', padding: '14px' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: '800', color: 'var(--text-primary, #1A1E2B)' }}>{leg.item.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary, #1A1E2B)' }}>{legSymbol}{totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <button onClick={() => setBasketLegs(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#C62E2E', cursor: 'pointer', fontSize: '0.9rem', padding: '0' }}>
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  </div>
                  {/* Order unit row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: '700', color: 'var(--text-muted, #8C94A8)', letterSpacing: '0.5px' }}>ORDER UNIT</span>
                    <div style={{ display: 'flex', background: 'var(--bg-card, #FFFFFF)', border: '1px solid var(--border-card, #E2E6EC)', borderRadius: '20px', overflow: 'hidden' }}>
                      <button
                        onClick={() => setBasketLegs(prev => prev.map((l, j) => j === i ? { ...l, unit: 'qty' } : l))}
                        style={{ padding: '4px 12px', fontSize: '0.65rem', fontWeight: '700', border: 'none', cursor: 'pointer', background: leg.unit !== 'lot' ? '#4B5563' : 'transparent', color: '#fff' }}
                      >QTY</button>
                      <button
                        onClick={() => setBasketLegs(prev => prev.map((l, j) => j === i ? { ...l, unit: 'lot' } : l))}
                        style={{ padding: '4px 12px', fontSize: '0.65rem', fontWeight: '700', border: 'none', cursor: 'pointer', background: leg.unit === 'lot' ? '#4B5563' : 'transparent', color: leg.unit === 'lot' ? '#fff' : 'var(--text-secondary, #6B7280)' }}
                      >LOT</button>
                    </div>
                  </div>
                  {/* B/S toggle + qty stepper */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', borderRadius: '20px', overflow: 'hidden', border: '1px solid var(--border-card, #E2E6EC)' }}>
                      <button
                        onClick={() => setBasketLegs(prev => prev.map((l, j) => j === i ? { ...l, side: 'BUY' } : l))}
                        style={{ padding: '6px 14px', fontSize: '0.72rem', fontWeight: '800', border: 'none', cursor: 'pointer', background: leg.side === 'BUY' ? '#1a8a3a' : 'var(--icon-bg, #F3F4F6)', color: leg.side === 'BUY' ? '#fff' : 'var(--text-secondary, #6B7280)' }}
                      >B</button>
                      <button
                        onClick={() => setBasketLegs(prev => prev.map((l, j) => j === i ? { ...l, side: 'SELL' } : l))}
                        style={{ padding: '6px 14px', fontSize: '0.72rem', fontWeight: '800', border: 'none', cursor: 'pointer', background: leg.side === 'SELL' ? '#b91c1c' : 'var(--icon-bg, #F3F4F6)', color: leg.side === 'SELL' ? '#fff' : 'var(--text-secondary, #6B7280)' }}
                      >S</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--card-alt-bg, #F3F4F6)', border: '1px solid var(--border-card, #E2E6EC)', borderRadius: '20px', padding: '4px 14px' }}>
                      <button onClick={() => setBasketLegs(prev => prev.map((l, j) => j === i ? { ...l, qty: Math.max(1, l.qty - 1) } : l))} style={{ background: 'none', border: 'none', fontSize: '0.9rem', cursor: 'pointer', color: 'var(--text-secondary, #6B7280)', padding: '0' }}>−</button>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', minWidth: '20px', textAlign: 'center', color: 'var(--text-primary, #1A1E2B)' }}>{leg.qty}</span>
                      <button onClick={() => setBasketLegs(prev => prev.map((l, j) => j === i ? { ...l, qty: l.qty + 1 } : l))} style={{ background: 'none', border: 'none', fontSize: '0.9rem', cursor: 'pointer', color: 'var(--text-secondary, #6B7280)', padding: '0' }}>+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="basket-margin-summary" style={{ border: '1px solid var(--border-light, #EEF2F8)', padding: '16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted, #8C94A8)' }}>Total Items</span><span className="basket-val" style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>{basketLegs.length}</span></div>
            <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted, #8C94A8)' }}>Total Value</span><span className="basket-val" style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)' }}>₹{basketLegs.reduce((acc, l) => acc + (getLegPrice(l.item) * l.qty), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
            <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-muted, #8C94A8)' }}>Required Margin</span><span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#C62E2E' }}>₹{basketLegs.reduce((acc, leg) => {
                const price = getLegPrice(leg.item);
                const seg = mapSegmentToDbSegment(leg.item.segment);
                const setting = segmentSettings.find(s => s.segment === seg && s.side === leg.side);
                const lev = Number(setting?.intraday_leverage ?? 10);
                const levType = setting?.intraday_type ?? 'Multiplier';
                const lotSz = scriptSettings.find(s => s.symbol === leg.item.symbol)?.lot_size ?? 1;
                const qty = leg.unit === 'lot' ? leg.qty * lotSz : leg.qty;
                const exposure = qty * price;
                let portion = 0;
                if (levType === '%') portion = exposure * (lev / 100);
                else if (levType === 'Fixed') portion = (qty / lotSz) * lev;
                else portion = exposure / lev;
                return acc + portion;
              }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
            <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--border-light, #EEF2F8)', paddingTop: '10px', marginTop: '2px' }}><span className="basket-val" style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-primary)' }}>Available Balance</span><span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#2C8E5A', background: '#E9F6EF', padding: '4px 10px', borderRadius: '8px' }}>{availableBalance !== null ? `₹${availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00'}</span></div>
          </div>
          <div style={{ display: 'flex', gap: '12px', width: '100%', padding: '0 4px' }}>
            <button
              style={{ flex: 1, background: '#2C8E5A', color: 'white', border: 'none', padding: '17px 8px', borderRadius: '50px', fontSize: '0.78rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', boxShadow: '0 6px 14px rgba(44,142,90,0.3)', minWidth: 0, whiteSpace: 'nowrap' }}
              onClick={() => setShowBasketConfirm(true)}
            >
              <i className="fas fa-bolt" style={{ lineHeight: 1, fontSize: '0.78rem' }}></i> Execute Basket
            </button>
            <button
              style={{ flex: 1, background: 'var(--icon-bg, #EFEFEF)', color: 'var(--text-secondary, #6B7280)', border: 'none', padding: '17px 8px', borderRadius: '50px', fontSize: '0.78rem', fontWeight: '600', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '7px', minWidth: 0, whiteSpace: 'nowrap' }}
              onClick={() => {
                setBasketLegs([]);
                const sheet = document.getElementById('basketSheet');
                const overlay = document.getElementById('basketSheetOverlay');
                if (sheet) sheet.classList.remove('open');
                if (overlay) overlay.classList.remove('active');
              }}
            >
              <i className="fas fa-trash-alt" style={{ opacity: 0.5 }}></i> Clear
            </button>
          </div>
        </div>
      </div>

      {/* Basket Execute Confirmation Dialog */}
      {showBasketConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
          <div style={{ background: '#FFFFFF', borderRadius: '24px', padding: '28px 24px', width: '100%', maxWidth: '360px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ width: '56px', height: '56px', background: '#E9F6EF', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <i className="fas fa-bolt" style={{ fontSize: '1.4rem', color: '#2C8E5A' }}></i>
              </div>
              <div className="sri-name" style={{ fontSize: '1.1rem', fontWeight: '800', color: '#1A1E2B', marginBottom: '8px' }}>Confirm Execution</div>
              <div style={{ fontSize: '0.8rem', color: '#6B7280', lineHeight: '1.5' }}>
                You are about to execute <strong>{basketLegs.length} order{basketLegs.length !== 1 ? 's' : ''}</strong> worth{' '}
                <strong>₹{basketLegs.reduce((acc, l) => acc + (getLegPrice(l.item) * l.qty), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>.
                <br />Are you sure?
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => {
                  setShowBasketConfirm(false);
                  showToast('Basket executed successfully!', false);
                  setBasketLegs([]);
                  setBasketMode(false);
                  const sheet = document.getElementById('basketSheet');
                  const overlay = document.getElementById('basketSheetOverlay');
                  if (sheet) sheet.classList.remove('open');
                  if (overlay) overlay.classList.remove('active');
                }}
                style={{ flex: 1, background: '#2C8E5A', color: '#fff', border: 'none', padding: '13px 0', borderRadius: '30px', fontSize: '0.9rem', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 12px rgba(44,142,90,0.3)' }}
              >
                <i className="fas fa-bolt" style={{ marginRight: '6px' }}></i>Confirm
              </button>
              <button
                onClick={() => setShowBasketConfirm(false)}
                style={{ flex: 1, background: '#F3F4F6', color: '#4B5563', border: 'none', padding: '13px 0', borderRadius: '30px', fontSize: '0.9rem', fontWeight: '700', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div id="drawerOverlay" className={`drawer-overlay${isFolderDrawerOpen ? ' active' : ''}`} onClick={() => setIsFolderDrawerOpen(false)}></div>
      <div id="scriptsFolderDrawer" className={`folder-drawer${isFolderDrawerOpen ? ' open' : ''}`}>
        <div className="drawer-header">
          <h3>Trading Segments</h3>
          <button className="close-drawer" onClick={() => setIsFolderDrawerOpen(false)} suppressHydrationWarning><i className="fas fa-times"></i></button>
        </div>
        <div className="folder-tree-scroll">
          {(() => {
            const DRAWER_SEG_TO_DB_KEY: Record<string, string> = {
              'INDEX-FUT': 'INDEX-FUT',
              'INDEX-OPT': 'INDEX-OPT',
              'MCX-FUT':   'MCX-FUT',
              'MCX-OPT':   'MCX-OPT',
              'STOCK-FUT': 'STOCK-FUT',
              'STOCK-OPT': 'STOCK-OPT',
              'NSE-EQ':    'NSE-EQ',
              'CRYPTO':    'CRYPTO',
              'COMEX':     'COMEX',
              'FOREX':     'FOREX',
            };
            // Define the desired display order
            const SEGMENT_ORDER = ['INDEX-FUT','INDEX-OPT','MCX-FUT','MCX-OPT','STOCK-FUT','STOCK-OPT','NSE-EQ','CRYPTO','COMEX','FOREX'];
            const sortedSegments = [...tradingSegments].sort((a, b) => {
              const ai = SEGMENT_ORDER.indexOf(a.name);
              const bi = SEGMENT_ORDER.indexOf(b.name);
              if (ai === -1 && bi === -1) return 0;
              if (ai === -1) return 1;
              if (bi === -1) return -1;
              return ai - bi;
            });
            const visibleSegments = sortedSegments.filter(seg => {
              if (allowedSegments === null) return true; // still loading — show all initially
              if (allowedSegments.length === 0) return true;
              const dbKey = DRAWER_SEG_TO_DB_KEY[seg.name] ?? seg.name.toUpperCase();
              return allowedSegments.includes(dbKey);
            });
            return visibleSegments.map((seg) => {
              const count = (seg.instruments?.length ?? 0) + (seg.subCategories?.reduce((a, s) => a + s.instruments.length, 0) ?? 0);
              const isOpen = !!expandedSegments[seg.name];
              return (
                <div key={seg.name} className="tree-item-li">
                  <div
                    className="tree-label-row"
                    onClick={() => setExpandedSegments(prev => ({ ...prev, [seg.name]: !prev[seg.name] }))}
                  >
                    <i className="fas fa-chevron-right chevron-icon" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}></i>
                    <span style={{ flex: 1, fontWeight: 700, fontSize: '0.88rem' }}>{seg.name}</span>
                    <span className="segment-count">{count}</span>
                  </div>
                  {isOpen && (
                    <div className="children-container" style={{ display: 'block' }}>
                      {seg.instruments?.map((inst) => (
                        <div key={inst.symbol} className="script-item">
                          <span>{inst.name}</span>
                          <button className="add-script-btn" onClick={() => {
                            if (typeof window.__addToWatchlistCallback === 'function') {
                              window.__addToWatchlistCallback(inst as WatchlistItem);
                              showToast('Added to watchlist', false);
                            }
                          }}>+ Add</button>
                        </div>
                      ))}
                      {seg.subCategories?.map((sub) => {
                        const subKey = `${seg.name}__${sub.name}`;
                        const subOpen = !!expandedSegments[subKey];
                        return (
                          <div key={sub.name} className="tree-item-li">
                            <div
                              className="tree-label-row"
                              style={{ paddingTop: '8px', paddingBottom: '8px' }}
                              onClick={(e) => { e.stopPropagation(); setExpandedSegments(prev => ({ ...prev, [subKey]: !prev[subKey] })); }}
                            >
                              <i className="fas fa-chevron-right chevron-icon" style={{ fontSize: '0.55rem', transform: subOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}></i>
                              <span style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary, #5B677E)' }}>{sub.name}</span>
                              <span className="segment-count">{sub.instruments.length}</span>
                            </div>
                            {subOpen && (
                              <div className="children-container" style={{ display: 'block' }}>
                                {sub.instruments.map((inst) => (
                                  <div key={inst.symbol} className="script-item">
                                    <span>{inst.name}</span>
                                    <button className="add-script-btn" onClick={() => {
                                      if (typeof window.__addToWatchlistCallback === 'function') {
                                        window.__addToWatchlistCallback(inst as WatchlistItem);
                                        showToast('Added to watchlist', false);
                                      }
                                    }}>+ Add</button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            });
          })()}
        </div>
        <div className="drawer-footer"><i className="fas fa-plus-circle"></i> Tap <span style={{ color: '#C62E2E' }}>+ Add</span> to watchlist | Browse all segments</div>
      </div>
      </div>

      {/* React-driven order toast */}
      <div
        style={{
          position: 'fixed',
          bottom: '90px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: toast.isError ? '#C62E2E' : '#1a7a4a',
          color: '#fff',
          padding: '8px 16px',
          borderRadius: '30px',
          fontSize: '0.72rem',
          fontWeight: '600',
          fontFamily: 'Inter, sans-serif',
          zIndex: 99999,
          whiteSpace: 'nowrap',
          maxWidth: '80vw',
          overflowX: 'hidden',
          textOverflow: 'ellipsis',
          boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
          opacity: toast.visible ? 1 : 0,
          visibility: toast.visible ? 'visible' : 'hidden',
          transition: 'opacity 0.2s ease, visibility 0.2s ease',
        }}
      >
        {toast.msg}
      </div>

      <div id="chartSheetOverlay" className="trade-sheet-overlay" onClick={() => { const sheet = document.getElementById('chartSheet'); const overlay = document.getElementById('chartSheetOverlay'); if (sheet) sheet.classList.remove('open'); if (overlay) overlay.classList.remove('active'); setChartItem(null); setIsBenchmarkChart(false); }}></div>
      <div id="chartSheet" className="trade-sheet" style={{ height: '100dvh', paddingBottom: '0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, position: 'relative', width: '100%', overflow: 'hidden' }}>
          {chartItem && (
            <TradingChart
              key={`${chartItem.binanceSymbol || chartItem.kiteSymbol || chartItem.symbol}-${chartItem.segment}`}
              symbol={chartItem.binanceSymbol || chartItem.kiteSymbol || chartItem.symbol}
              segment={chartItem.binanceSymbol ? 'CRYPTO' : chartItem.segment}
              liveQuote={chartItem.binanceSymbol ? marketQuotes[chartItem.binanceSymbol] : marketQuotes[chartItem.kiteSymbol]}
            />
          )}
        </div>
      </div>

      <Footer activeTab="watchlist" />
        </div>
      </main>
    </div>
  );
}


function buildInlineScript(allowedSegments: string[], segmentSettings: any[]): string {
  return `
    (function() {
      var allowedSegments = ${JSON.stringify(allowedSegments)};
      var segmentSettings = ${JSON.stringify(segmentSettings)};
      var tradingSegments = [
        {
          name: 'INDEX-FUT',
          icon: 'fa-chart-line',
          instruments: [
            { name: 'NIFTY 50 INDEX', symbol: 'NIFTY_INDEX', kiteSymbol: 'NSE:NIFTY 50', price: 22456.80, change: '+0.45%', segment: 'NSE - Futures', contractDate: '', open: 22350, high: 22580, low: 22320, close: 22456.80 },
            { name: 'SENSEX INDEX', symbol: 'SENSEX_INDEX', kiteSymbol: 'BSE:SENSEX', price: 74230.15, change: '+0.32%', segment: 'BSE - Futures', contractDate: '', open: 73950, high: 74500, low: 73800, close: 74230.15 },
            { name: 'BANKNIFTY INDEX', symbol: 'BANKNIFTY_INDEX', kiteSymbol: 'NSE:NIFTY BANK', price: 48210.50, change: '-0.21%', segment: 'NSE - Futures', contractDate: '', open: 48350, high: 48500, low: 48100, close: 48210.50 },
            { name: 'FINNIFTY INDEX', symbol: 'FINNIFTY_INDEX', kiteSymbol: 'NSE:NIFTY FIN SERVICE', price: 21234.90, change: '+0.67%', segment: 'NSE - Futures', contractDate: '', open: 21080, high: 21350, low: 21050, close: 21234.90 },
            { name: 'MIDCAP NIFTY INDEX', symbol: 'MIDCP_INDEX', kiteSymbol: 'NSE:NIFTY MID SELECT', price: 11820.45, change: '+0.88%', segment: 'NSE - Futures', contractDate: '', open: 11700, high: 11880, low: 11680, close: 11820.45 }
          ]
        },
        {
          name: 'INDEX-OPT',
          icon: 'fa-chart-gantt',
          subCategories: [
            {
              name: 'NIFTY Options',
              instruments: [
                { name: 'NIFTY 22300 PE', symbol: 'NIFTY22300PE', kiteSymbol: '', price: 65.10, change: '-2.1%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 66, high: 68, low: 64, close: 65.10 },
                { name: 'NIFTY 22400 PE', symbol: 'NIFTY22400PE', kiteSymbol: '', price: 78.20, change: '-1.2%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 79.50, high: 80, low: 77.50, close: 78.20 },
                { name: 'NIFTY 22500 CE', symbol: 'NIFTY22500CE', kiteSymbol: '', price: 125.40, change: '+2.3%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 122, high: 128.50, low: 121, close: 125.40 },
                { name: 'NIFTY 22600 CE', symbol: 'NIFTY22600CE', kiteSymbol: '', price: 85.30, change: '+1.5%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 84, high: 88, low: 82, close: 85.30 },
                { name: 'NIFTY 22700 CE', symbol: 'NIFTY22700CE', kiteSymbol: '', price: 55.20, change: '+3.1%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 53, high: 57, low: 51, close: 55.20 }
              ]
            },
            {
              name: 'SENSEX Options',
              instruments: [
                { name: 'SENSEX 74100 PE', symbol: 'SENSEX741PE', kiteSymbol: '', price: 150.20, change: '-1.5%', segment: 'BSE - Options', contractDate: '26 Jun 2026', open: 152, high: 155, low: 148, close: 150.20 },
                { name: 'SENSEX 74500 CE', symbol: 'SENSEX745CE', kiteSymbol: '', price: 210.30, change: '+0.9%', segment: 'BSE - Options', contractDate: '26 Jun 2026', open: 208, high: 212.50, low: 207.50, close: 210.30 },
                { name: 'SENSEX 74900 CE', symbol: 'SENSEX749CE', kiteSymbol: '', price: 125.10, change: '+2.5%', segment: 'BSE - Options', contractDate: '26 Jun 2026', open: 122, high: 128, low: 120, close: 125.10 }
              ]
            },
            {
              name: 'BANKEX Options',
              instruments: [
                { name: 'BANKEX 51800 PE', symbol: 'BANKEX518PE', kiteSymbol: '', price: 240.50, change: '-1.4%', segment: 'BSE - Options', contractDate: '26 Jun 2026', open: 245, high: 248, low: 238, close: 240.50 },
                { name: 'BANKEX 52000 CE', symbol: 'BANKEX520CE', kiteSymbol: '', price: 310.75, change: '+1.1%', segment: 'BSE - Options', contractDate: '26 Jun 2026', open: 307, high: 314, low: 306.50, close: 310.75 }
              ]
            },
            {
              name: 'BANKNIFTY Options',
              instruments: [
                { name: 'BANKNIFTY 47800 PE', symbol: 'BN47800PE', kiteSymbol: '', price: 110.15, change: '+0.3%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 109, high: 112, low: 108, close: 110.15 },
                { name: 'BANKNIFTY 48000 PE', symbol: 'BN48000PE', kiteSymbol: '', price: 140.25, change: '+0.7%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 139, high: 142, low: 138.50, close: 140.25 },
                { name: 'BANKNIFTY 48200 CE', symbol: 'BN48200CE', kiteSymbol: '', price: 280.40, change: '-1.1%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 282, high: 285, low: 279, close: 280.40 },
                { name: 'BANKNIFTY 48500 CE', symbol: 'BN48500CE', kiteSymbol: '', price: 215.60, change: '-0.4%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 216.50, high: 218, low: 214, close: 215.60 },
                { name: 'BANKNIFTY 48800 CE', symbol: 'BN48800CE', kiteSymbol: '', price: 155.80, change: '-0.8%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 157, high: 160, low: 154, close: 155.80 },
                { name: 'BANKNIFTY 49000 CE', symbol: 'BN49000CE', kiteSymbol: '', price: 120.40, change: '-1.5%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 122, high: 125, low: 118, close: 120.40 }
              ]
            },
            {
              name: 'FINNIFTY Options',
              instruments: [
                { name: 'FINNIFTY 21300 PE', symbol: 'FIN21300PE', kiteSymbol: '', price: 45.20, change: '-2.5%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 48, high: 50, low: 44, close: 45.20 },
                { name: 'FINNIFTY 21500 CE', symbol: 'FIN21500CE', kiteSymbol: '', price: 92.50, change: '+1.5%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 91, high: 94, low: 90.50, close: 92.50 },
                { name: 'FINNIFTY 21700 CE', symbol: 'FIN21700CE', kiteSymbol: '', price: 32.10, change: '+4.5%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 30, high: 34, low: 28, close: 32.10 }
              ]
            },
            {
              name: 'MID CAP NIFTY Options',
              instruments: [
                { name: 'MIDCPNIFTY 11800 CE', symbol: 'MIDCP118CE', kiteSymbol: '', price: 65.30, change: '+2.1%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 63.80, high: 66.50, low: 63.50, close: 65.30 },
                { name: 'MIDCPNIFTY 12000 CE', symbol: 'MIDCP120CE', kiteSymbol: '', price: 25.50, change: '+6.5%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 22, high: 28, low: 20, close: 25.50 }
              ]
            }
          ]
        },
        {
          name: 'STOCK-FUT',
          icon: 'fa-building',
          instruments: [
            { name: 'RELIANCE FUT', symbol: 'RELIANCE_FUT', kiteSymbol: 'NSE:RELIANCE', price: 2856.40, change: '+0.75%', segment: 'NSE - Futures', contractDate: '26 Jun 2026', open: 2835, high: 2870, low: 2830, close: 2856.40 },
            { name: 'TCS FUT', symbol: 'TCS_FUT', kiteSymbol: 'NSE:TCS', price: 3987.20, change: '-0.33%', segment: 'NSE - Futures', contractDate: '26 Jun 2026', open: 4000, high: 4015, low: 3975, close: 3987.20 },
            { name: 'HDFCBANK FUT', symbol: 'HDFCBANK_FUT', kiteSymbol: 'NSE:HDFCBANK', price: 1680.90, change: '+0.22%', segment: 'NSE - Futures', contractDate: '26 Jun 2026', open: 1675, high: 1688, low: 1672, close: 1680.90 }
          ]
        },
        {
          name: 'MCX-FUT',
          icon: 'fa-coins',
          instruments: [
            { name: 'GOLD FUT', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26AUGFUT', price: 72450, change: '+0.28%', segment: 'MCX - Futures', contractDate: 'Aug 2026', open: 72150, high: 72450, low: 72100, close: 72450 },
            { name: 'SILVER FUT', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULFUT', price: 82230, change: '-0.15%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 82350, high: 82450, low: 82100, close: 82230 },
            { name: 'CRUDEOIL FUT', symbol: 'CRUDEOIL_FUT', kiteSymbol: 'MCX:CRUDEOIL26JULFUT', price: 6120.50, change: '+1.2%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 6045, high: 6140, low: 6040, close: 6120.50 }
          ]
        },
        {
          name: 'MCX-OPT',
          icon: 'fa-chart-line',
          subCategories: [
            {
              name: 'GOLD',
              instruments: [
                { name: 'GOLD 72000 CE', symbol: 'GOLD26JUL72000CE', kiteSymbol: 'MCX:GOLD26JUL72000CE', price: 820, change: '+0.9%', segment: 'MCX - Options', contractDate: '2026-07-31', open: 812, high: 828, low: 810, close: 820 }
              ]
            },
            {
              name: 'CRUDEOIL',
              instruments: [
                { name: 'CRUDEOIL 6000 CE', symbol: 'CRUDEOIL26JUL6000CE', kiteSymbol: 'MCX:CRUDEOIL26JUL6000CE', price: 145, change: '+1.5%', segment: 'MCX - Options', contractDate: '2026-07-31', open: 140, high: 152, low: 138, close: 145 }
              ]
            }
          ]
        },
        {
          name: 'CRYPTO',
          icon: 'fa-bitcoin',
          instruments: [
            { name: 'BTC/USDT', symbol: 'BTCUSDT', kiteSymbol: '', binanceSymbol: 'BTCUSDT', price: 68450.20, change: '+2.1%', segment: 'Crypto', contractDate: 'Perpetual', open: 67000, high: 69000, low: 66800, close: 68450.20 },
            { name: 'ETH/USDT', symbol: 'ETHUSDT', kiteSymbol: '', binanceSymbol: 'ETHUSDT', price: 3420.80, change: '+1.4%', segment: 'Crypto', contractDate: 'Perpetual', open: 3370, high: 3450, low: 3360, close: 3420.80 },
            { name: 'SOL/USDT', symbol: 'SOLUSDT', kiteSymbol: '', binanceSymbol: 'SOLUSDT', price: 182.30, change: '-0.7%', segment: 'Crypto', contractDate: 'Perpetual', open: 183.50, high: 184, low: 181, close: 182.30 }
          ]
        },
        {
          name: 'FOREX',
          icon: 'fa-globe',
          instruments: [
            { name: 'USD/INR', symbol: 'USDINR_FUT', kiteSymbol: 'CDS:USDINR26JULFUT', price: 95.96, change: '0%', segment: 'CDS - Futures', contractDate: 'Jul 2026', open: 95.72, high: 96.03, low: 95.59, close: 95.61 },
            { name: 'EUR/INR', symbol: 'EURINR_FUT', kiteSymbol: 'CDS:EURINR26JULFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0 }
          ]
        },
        {
          name: 'COMEX',
          icon: 'fa-gem',
          instruments: [
            { name: 'Gold', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26AUGFUT', comexSymbol: 'GC=F', price: 72450, change: '+0.28%', segment: 'MCX - Futures', contractDate: 'Aug 2026', open: 72150, high: 72450, low: 72100, close: 72450 },
            { name: 'Silver', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULFUT', comexSymbol: 'SI=F', price: 82230, change: '-0.15%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 82350, high: 82450, low: 82100, close: 82230 },
            { name: 'Crude Oil', symbol: 'CRUDEOIL_FUT', kiteSymbol: 'MCX:CRUDEOIL26JULFUT', comexSymbol: 'CL=F', price: 6120, change: '0%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0 },
            { name: 'Copper', symbol: 'COPPER_FUT', kiteSymbol: 'MCX:COPPER26JULFUT', comexSymbol: 'HG=F', price: 780, change: '0%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0 }
          ]
        },
        {
          name: 'STOCK-OPT',
          icon: 'fa-layer-group',
          subCategories: [
            {
              name: 'RELIANCE',
              instruments: [
                { name: 'RELIANCE 2900 CE', symbol: 'RELIANCE26JUN2900CE', kiteSymbol: 'NFO:RELIANCE26JUN2900CE', price: 0, change: '0%', segment: 'NSE - Stock Options', contractDate: '2026-06-30', open: 0, high: 0, low: 0, close: 0 },
                { name: 'RELIANCE 2800 PE', symbol: 'RELIANCE26JUN2800PE', kiteSymbol: 'NFO:RELIANCE26JUN2800PE', price: 0, change: '0%', segment: 'NSE - Stock Options', contractDate: '2026-06-30', open: 0, high: 0, low: 0, close: 0 }
              ]
            },
            {
              name: 'TCS',
              instruments: [
                { name: 'TCS 4000 CE', symbol: 'TCS26JUN4000CE', kiteSymbol: 'NFO:TCS26JUN4000CE', price: 0, change: '0%', segment: 'NSE - Stock Options', contractDate: '2026-06-30', open: 0, high: 0, low: 0, close: 0 }
              ]
            },
            {
              name: 'HDFCBANK',
              instruments: [
                { name: 'HDFCBANK 1700 CE', symbol: 'HDFCBANK26JUN1700CE', kiteSymbol: 'NFO:HDFCBANK26JUN1700CE', price: 0, change: '0%', segment: 'NSE - Stock Options', contractDate: '2026-06-30', open: 0, high: 0, low: 0, close: 0 },
                { name: 'HDFCBANK 1600 PE', symbol: 'HDFCBANK26JUN1600PE', kiteSymbol: 'NFO:HDFCBANK26JUN1600PE', price: 0, change: '0%', segment: 'NSE - Stock Options', contractDate: '2026-06-30', open: 0, high: 0, low: 0, close: 0 }
              ]
            }
          ]
        },
        {
          name: 'NSE-EQ',
          icon: 'fa-landmark',
          instruments: [
            { name: 'RELIANCE', symbol: 'RELIANCE_EQ', kiteSymbol: 'NSE:RELIANCE', price: 0, change: '0%', segment: 'NSE - Equity', contractDate: '', open: 0, high: 0, low: 0, close: 0 },
            { name: 'TCS', symbol: 'TCS_EQ', kiteSymbol: 'NSE:TCS', price: 0, change: '0%', segment: 'NSE - Equity', contractDate: '', open: 0, high: 0, low: 0, close: 0 },
            { name: 'HDFCBANK', symbol: 'HDFCBANK_EQ', kiteSymbol: 'NSE:HDFCBANK', price: 0, change: '0%', segment: 'NSE - Equity', contractDate: '', open: 0, high: 0, low: 0, close: 0 },
            { name: 'INFY', symbol: 'INFY_EQ', kiteSymbol: 'NSE:INFY', price: 0, change: '0%', segment: 'NSE - Equity', contractDate: '', open: 0, high: 0, low: 0, close: 0 }
          ]
        }
      ];

      function mapCategoryToDbSegment(name) {
        var n = name.toUpperCase();
        if (n === 'INDEX-FUT') return 'INDEX-FUT';
        if (n === 'INDEX-OPT') return 'INDEX-OPT';
        if (n === 'STOCK-FUT') return 'STOCK-FUT';
        if (n === 'STOCK-OPT') return 'STOCK-OPT';
        if (n === 'MCX-FUT') return 'MCX-FUT';
        if (n === 'MCX-OPT') return 'MCX-OPT';
        if (n === 'NSE-EQ') return 'NSE-EQ';
        if (n === 'CRYPTO') return 'CRYPTO';
        if (n === 'FOREX') return 'FOREX';
        if (n === 'COMEX') return 'COMEX';
        return name;
      }
      if (allowedSegments && allowedSegments.length > 0) {
        tradingSegments = tradingSegments.filter(function(seg) {
          return allowedSegments.indexOf(mapCategoryToDbSegment(seg.name)) !== -1;
        });
      }
      
      window.__initialTradingSegments = tradingSegments;

      function getAllScripts() {
        var scripts = [];
        function traverse(node) {
          if (node.instruments) node.instruments.forEach(function(inst) { scripts.push(Object.assign({}, inst, { category: node.name })); });
          if (node.subCategories) node.subCategories.forEach(function(sub) {
            if (sub.instruments) sub.instruments.forEach(function(inst) { scripts.push(Object.assign({}, inst, { category: node.name + ' > ' + sub.name })); });
          });
        }
        tradingSegments.forEach(function(seg) { traverse(seg); });
        return scripts;
      }

      var allScriptsDB = getAllScripts();
      var watchlistItems = (window.__watchlistItems && window.__watchlistItems.length > 0) ? window.__watchlistItems.slice() : [];
      var selectionMode = false;
      var longPressTimer = null;

      var watchlistContainer = document.getElementById('watchlistMobileContainer');
      var watchlistCounter = document.getElementById('mobileWatchlistCounter');
      var multiSelectBar = document.getElementById('multiSelectBar');
      var selectedCountSpan = document.getElementById('selectedCount');
      var searchInput = document.getElementById('globalSearchInput');
      var clearSearchBtn = document.getElementById('clearSearchBtn');
      var searchResultsArea = document.getElementById('searchResultsArea');
      var searchResultsList = document.getElementById('searchResultsList');
      var searchResultCount = document.getElementById('searchResultCount');
      var folderDrawer = document.getElementById('scriptsFolderDrawer');
      var overlay = document.getElementById('drawerOverlay');

      function formatPrice(price, isCrypto) {
        var numPrice = typeof price === 'number' ? price : parseFloat(price);
        return '₹' + numPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]; });
      }

      // Symbols currently in the watchlist — kept in sync so buttons can
      // reflect "Added" state without waiting for a React re-render.
      var watchlistSymbols = new Set(
        (window.__watchlistItems || []).map(function(i) { return i.symbol; })
      );

      // Called by React after the watchlist state updates so the inline
      // script always has the latest set.
      window.__syncWatchlistSymbols = function(symbols) {
        watchlistSymbols = new Set(symbols);
      };

      function setButtonAdded(btn) {
        btn.textContent = 'Added ✓';
        btn.disabled = false;
        btn.style.background = '#2C8E5A';
        btn.style.color = '#fff';
        btn.style.opacity = '0.85';
        btn.style.cursor = 'pointer';
        
        var symbol = btn.getAttribute('data-watch-symbol');
        if (symbol) {
          btn.setAttribute('onclick', 'removeFromWatchlist("' + symbol.replace(/"/g, '&quot;') + '")');
        }
      }

      function setButtonRemoved(btn) {
        var isSearch = btn.classList.contains('sri-add-btn');
        btn.textContent = isSearch ? 'Add' : '+ Add';
        btn.disabled = false;
        
        if (isSearch) {
          btn.style.background = '#c53030';
          btn.style.color = 'white';
          btn.style.border = 'none';
          btn.style.borderRadius = '20px';
          btn.style.padding = '6px 16px';
          btn.style.fontWeight = '600';
          btn.style.fontSize = '0.85rem';
          btn.style.opacity = '1';
        } else {
          btn.style.cssText = '';
        }
        btn.style.cursor = 'pointer';
        
        var itemJsonEscaped = btn.getAttribute('data-watch-item');
        if (itemJsonEscaped) {
           btn.setAttribute('onclick', 'addToWatchlist(' + itemJsonEscaped + ')');
        }
      }

      function addToWatchlist(item) {
        if (typeof window.__addToWatchlistCallback === 'function') {
          window.__addToWatchlistCallback(item);
          watchlistSymbols.add(item.symbol);
          // Update every button on screen for this symbol
          var btns = document.querySelectorAll('[data-watch-symbol="' + item.symbol.replace(/"/g, '') + '"]');
          btns.forEach(function(btn) { setButtonAdded(btn); });
          if (window.showToast) window.showToast('Added to watchlist', false);
        }
      }

      function removeFromWatchlist(symbol) {
        if (typeof window.__removeFromWatchlistCallback === 'function') {
          window.__removeFromWatchlistCallback(symbol);
          watchlistSymbols.delete(symbol);
          var btns = document.querySelectorAll('[data-watch-symbol="' + symbol.replace(/"/g, '') + '"]');
          btns.forEach(function(btn) { setButtonRemoved(btn); });
          if (window.showToast) window.showToast('Removed from watchlist', false);
        }
      }

      function openDetailSheet(symbol) {
        if (typeof window.__reactOpenDetailSheet === 'function') {
          window.__reactOpenDetailSheet(symbol);
          var sheet = document.getElementById('detailSheet');
          var overlay = document.getElementById('detailSheetOverlay');
          if (sheet) sheet.classList.add('open');
          if (overlay) overlay.classList.add('active');
        }
      }

      function openTradeSheet(symbol) {
        if (typeof window.__reactOpenTradeSheet === 'function') {
          window.__reactOpenTradeSheet(symbol);
        }
      }

      function renderFolderTree() {
        var folderTreeMobile = document.getElementById('folderTreeMobile');
        if (!folderTreeMobile) return;
        var html = '';
        tradingSegments.forEach(function(seg) {
          html += '<div class="folder-item">';
          html += '<div class="folder-header">' + escapeHtml(seg.name) + '</div>';
          if (seg.instruments) {
            seg.instruments.forEach(function(inst) {
              var alreadyAdded = watchlistSymbols.has(inst.symbol);
              var itemJsonEscaped = JSON.stringify(inst).replace(/"/g, '&quot;');
              var btnHtml = alreadyAdded
                ? '<button class="add-script-btn" data-watch-symbol="' + escapeHtml(inst.symbol) + '" data-watch-item="' + itemJsonEscaped + '" onclick=\\'removeFromWatchlist("' + escapeHtml(inst.symbol) + '")\\' style="background:#2C8E5A;color:#fff;opacity:0.85;cursor:pointer;">Added ✓</button>'
                : '<button class="add-script-btn" data-watch-symbol="' + escapeHtml(inst.symbol) + '" data-watch-item="' + itemJsonEscaped + '" onclick=\\'addToWatchlist(' + itemJsonEscaped + ')\\'>+ Add</button>';
              html += '<div class="script-item"><span>' + escapeHtml(inst.name) + '</span>' + btnHtml + '</div>';
            });
          }
          if (seg.subCategories) {
            seg.subCategories.forEach(function(sub) {
              html += '<div class="subfolder-item"><div class="subfolder-header">' + escapeHtml(sub.name) + '</div>';
              sub.instruments.forEach(function(inst) {
                var alreadyAdded = watchlistSymbols.has(inst.symbol);
                var itemJsonEscaped = JSON.stringify(inst).replace(/"/g, '&quot;');
                var btnHtml = alreadyAdded
                  ? '<button class="add-script-btn" data-watch-symbol="' + escapeHtml(inst.symbol) + '" data-watch-item="' + itemJsonEscaped + '" onclick=\\'removeFromWatchlist("' + escapeHtml(inst.symbol) + '")\\' style="background:#2C8E5A;color:#fff;opacity:0.85;cursor:pointer;">Added ✓</button>'
                  : '<button class="add-script-btn" data-watch-symbol="' + escapeHtml(inst.symbol) + '" data-watch-item="' + itemJsonEscaped + '" onclick=\\'addToWatchlist(' + itemJsonEscaped + ')\\'>+ Add</button>';
                html += '<div class="script-item"><span>' + escapeHtml(inst.name) + '</span>' + btnHtml + '</div>';
              });
              html += '</div>';
            });
          }
          html += '</div>';
        });
        folderTreeMobile.innerHTML = html;
      }

      var searchDebounceTimer = null;
      var currentSearchController = null; // AbortController for in-flight fetch

      function getTabForSearchItem(seg, cat) {
        if (cat) {
          var c = cat.toUpperCase();
          if (c.indexOf('INDEX - FUTURE') >= 0) return 'INDEX-FUT';
          if (c.indexOf('INDEX - OPTIONS') >= 0) return 'INDEX-OPT';
          if (c.indexOf('STOCKS - FUTURE') >= 0) return 'STOCK-FUT';
          if (c.indexOf('MCX - FUTURE') >= 0) return 'MCX-FUT';
          if (c.indexOf('MCX - OPTIONS') >= 0) return 'MCX-OPT';
          if (c.indexOf('CRYPTO') >= 0) return 'CRYPTO';
          if (c.indexOf('FOREX') >= 0) return 'FOREX';
          if (c.indexOf('COMEX') >= 0) return 'COMEX';
        }
        if (!seg) return 'INDEX-FUT';
        var m = {
          'NSE - Futures': 'INDEX-FUT', 'BSE - Futures': 'INDEX-FUT',
          'NSE - Options': 'INDEX-OPT', 'BSE - Options': 'INDEX-OPT',
          'NSE - Stock Futures': 'STOCK-FUT', 'BSE - Stock Futures': 'STOCK-FUT',
          'NSE - Stock Options': 'STOCK-OPT', 'BSE - Stock Options': 'STOCK-OPT',
          'MCX - Futures': 'MCX-FUT', 'MCX - Options': 'MCX-OPT',
          'NSE - Equity': 'NSE-EQ', 'BSE - Equity': 'NSE-EQ',
          'Crypto': 'CRYPTO', 'CRYPTO': 'CRYPTO',
          'Forex': 'FOREX', 'FOREX': 'FOREX',
          'CDS - Futures': 'FOREX', 'CDS - Options': 'FOREX',
          'COMEX - Futures': 'COMEX', 'COMEX - Options': 'COMEX', 'COMEX': 'COMEX', 'COI': 'COMEX'
        };
        return m[seg] || 'INDEX-FUT';
      }

      function renderSearchResults(results) {
        var searchResultsArea = document.getElementById('searchResultsArea');
        var searchResultsList = document.getElementById('searchResultsList');
        var searchResultCount = document.getElementById('searchResultCount');
        if (!searchResultsArea || !searchResultsList) return;
        var html = '';
        results.slice(0, 40).forEach(function(item) {
          var kiteId = item.kiteSymbol || item.symbol || '';
          
          var mainName = item.name;
          
          var segMap = {
            'NSE - Options': 'NFO',
            'NSE - Futures': 'NFO',
            'MCX - Futures': 'MCX',
            'BSE - Options': 'BFO',
            'Crypto': 'CRYPTO',
            'CDS - Futures': 'CDS'
          };
          var badgeStr = segMap[item.segment] || 'NSE';
          var dateStr = (item.contractDate || '').replace(/ 20\d\d$/, '');
          var bottomHtml = dateStr ? escapeHtml(dateStr) + '<span style="background: #f1f5f9; color: #64748b; font-size: 0.65rem; padding: 3px 6px; border-radius: 4px; font-weight: 700; margin-left: 8px;">' + escapeHtml(badgeStr) + '</span>' : escapeHtml(badgeStr);

            var defaultPrice = item.price ? item.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---';
            var alreadyInWL = watchlistSymbols.has(item.symbol);
            var itemJsonEscaped = JSON.stringify(item).replace(/"/g, '&quot;');
            var addBtnHtml = alreadyInWL
              ? '<button class="add-script-btn sri-add-btn" data-watch-symbol="' + escapeHtml(item.symbol) + '" data-watch-item="' + itemJsonEscaped + '" onclick=\\'removeFromWatchlist("' + escapeHtml(item.symbol) + '")\\' style="background: #2C8E5A; color: white; border: none; border-radius: 20px; padding: 6px 16px; font-weight: 600; font-size: 0.85rem; opacity: 0.85; cursor: pointer;">Added ✓</button>'
              : '<button class="add-script-btn sri-add-btn" data-watch-symbol="' + escapeHtml(item.symbol) + '" data-watch-item="' + itemJsonEscaped + '" style="background: #c53030; color: white; border: none; border-radius: 20px; padding: 6px 16px; font-weight: 600; font-size: 0.85rem; cursor: pointer;" onclick=\\'addToWatchlist(' + itemJsonEscaped + ')\\'>Add</button>';
            html += '<div class="search-result-item" style="padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">' +
            '<div class="sri-left"><div class="sri-name" style="font-weight: 700; font-size: 0.95rem; color: #1e293b; margin-bottom: 4px;">' + escapeHtml(mainName) + '</div><div class="sri-symbol" style="color: #94a3b8; font-size: 0.75rem; font-weight: 500; display: flex; align-items: center;">' + bottomHtml + '</div></div>' +
            '<div class="sri-right" style="display: flex; align-items: center; gap: 12px;">' +
            '<div class="sri-price" data-kite-id="' + escapeHtml(kiteId) + '" style="font-weight: 700; font-size: 0.95rem; color: #1e293b; min-width: 60px; text-align: right;">' + escapeHtml(defaultPrice) + '</div>' +
            addBtnHtml +
            '</div></div>';
        });
        if (searchResultCount) searchResultCount.textContent = results.length + ' RESULTS';
        searchResultsList.innerHTML = html || '<div class="no-results">No results found in library</div>';
        searchResultsArea.style.display = 'flex';

        // Fetch live prices for all results that have a kiteSymbol
        var kiteIds = results.slice(0, 40)
          .map(function(r) { return r.kiteSymbol || ''; })
          .filter(function(id) { return id.includes(':'); });
        if (kiteIds.length === 0) return;

        fetch('/api/kite/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruments: kiteIds })
        })
          .then(function(r) {
            var ct = r.headers.get('content-type');
            if (r.ok && ct && ct.indexOf('application/json') !== -1) {
              return r.json();
            }
            return { data: {} };
          })
          .then(function(json) {
            var quoteData = (json && json.data) || {};
            Object.entries(quoteData).forEach(function(entry) {
              var kiteId = entry[0];
              var quote = entry[1];
              var lp = quote && quote.last_price;
              if (!lp) return;
              var el = searchResultsList.querySelector('[data-kite-id="' + kiteId + '"]');
              if (el) el.textContent = lp.toLocaleString('en-IN', { maximumFractionDigits: 2 });
            });
          })
          .catch(function() {});
      }

      function runSearch(query) {
        // Empty query — hide results immediately (no debounce needed)
        if (query.length === 0) {
          if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
          if (currentSearchController) { try { currentSearchController.abort(); } catch(e) {} }
          var area = document.getElementById('searchResultsArea');
          if (area) area.style.display = 'none';
          var btn = document.getElementById('clearSearchBtn');
          if (btn) btn.style.display = 'none';
          return;
        }

        var btn = document.getElementById('clearSearchBtn');
        if (btn) btn.style.display = 'block';

        // Cancel any previous in-flight request
        if (currentSearchController) {
          try { currentSearchController.abort(); } catch(e) {}
        }

        // Debounce both local and live results — filter on full word, not per character
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(function() {
          var activeTab = window.__activeTab || 'All';
          var q = query.toLowerCase();

          // Word-start matching: query must match the start of any word in name/symbol
          // e.g. "nif" matches "NIFTY 50" and "NIFTY22300PE" but NOT "FINNIFTY" or "BANKNIFTY"
          function wordStartMatch(text) {
            var t = text.toLowerCase();
            // Check if text itself starts with query
            if (t.indexOf(q) === 0) return true;
            // Check if any word (split by space, hyphen, underscore, digit boundary) starts with query
            var words = t.split(/[\s_\/\-]/);
            for (var i = 0; i < words.length; i++) {
              if (words[i].indexOf(q) === 0) return true;
            }
            return false;
          }

          // Local results filtered with word-start match
          var localResults = allScriptsDB.filter(function(s) {
            var match = wordStartMatch(s.name) || wordStartMatch(s.symbol);
            if (!match) return false;
            if (activeTab === 'All') return true;
            return getTabForSearchItem(s.segment, s.category) === activeTab;
          });
          renderSearchResults(localResults);

          currentSearchController = new AbortController();
          var signal = currentSearchController.signal;

          fetch('/api/market/instruments/search?q=' + encodeURIComponent(query), {
            headers: { 'Authorization': 'Bearer ' + (window.__accessToken || '') },
            signal: signal
          })
            .then(function(res) {
              var ct = res.headers.get('content-type');
              if (res.ok && ct && ct.indexOf('application/json') !== -1) {
                return res.json();
              }
              return [];
            })
            .then(function(liveResults) {
              if (!liveResults || !Array.isArray(liveResults)) return;
              // Check query is still current (guard against tab changes mid-flight)
              var currentInput = document.getElementById('globalSearchInput');
              if (!currentInput || currentInput.value.trim() !== query) return;
              // Apply word-start filter to live results too
              var filteredLive = liveResults.filter(function(r) {
                return wordStartMatch(r.name || '') || wordStartMatch(r.symbol || '');
              });
              // Live results first, then any local-only extras not in live set
              var liveSymbols = new Set(filteredLive.map(function(r) { return r.symbol; }));
              var hardcodedExtra = localResults.filter(function(s) { return !liveSymbols.has(s.symbol); });
              var merged = filteredLive.concat(hardcodedExtra);
              var activeTabLive = window.__activeTab || 'All';
              if (activeTabLive !== 'All') {
                merged = merged.filter(function(r) { return getTabForSearchItem(r.segment) === activeTabLive; });
              }
              renderSearchResults(merged);
            })
            .catch(function(err) {
              // AbortError is expected when a new search supersedes this one — ignore silently
              if (err && err.name === 'AbortError') return;
            });
        }, 300);
      }

      // Use a named function so it can be exposed globally for the React useEffect bridge
      function handleSearchInput(e) {
        if (e.target && e.target.id === 'globalSearchInput') {
          runSearch(e.target.value.trim());
        }
      }

      document.addEventListener('input', handleSearchInput);
      // Expose so React's searchText useEffect can trigger it directly
      window.__triggerSearch = function(query) {
        runSearch(query);
      };


      var openFolderBtn = document.getElementById('openFolderMobileBtn');
      if (openFolderBtn) {
        openFolderBtn.onclick = function() {
          folderDrawer.classList.add('open');
          overlay.classList.add('active');
          renderFolderTree();
        };
      }

      var closeFolderBtn = document.getElementById('closeFolderDrawerBtn');
      if (closeFolderBtn) {
        closeFolderBtn.onclick = function() {
          folderDrawer.classList.remove('open');
          overlay.classList.remove('active');
        };
      }

      if (overlay) {
        overlay.onclick = function() {
          folderDrawer.classList.remove('open');
          overlay.classList.remove('active');
        };
      }

      window.__reactDeleteSelected = function() {
        var checkedBoxes = document.querySelectorAll('.wc-checkbox:checked');
        if (checkedBoxes.length === 0) {
          if (window.showToast) window.showToast('Select items to delete', true);
          return;
        }
        
        var symbolsToDelete = [];
        checkedBoxes.forEach(function(cb) {
          var card = cb.closest('.watchlist-card');
          if (card) {
            var symbol = card.getAttribute('data-symbol');
            if (symbol) symbolsToDelete.push(symbol);
          }
        });

        if (symbolsToDelete.length > 0) {
          symbolsToDelete.forEach(function(sym) {
            if (typeof window.__removeFromWatchlistCallback === 'function') {
              window.__removeFromWatchlistCallback(sym);
            }
          });
          if (window.showToast) window.showToast('Deleted ' + symbolsToDelete.length + ' item' + (symbolsToDelete.length !== 1 ? 's' : '') + ' from watchlist', false);
        }
        
        exitSelectionMode();
      };

      if (!window.__watchlistEventsAttached) {
        window.__watchlistEventsAttached = true;
        // Capture all clicks when selectionMode is active to toggle checkboxes easily
        document.addEventListener('click', function(e) {
          if (!window.__selectionModeActive) return;
          
          var card = e.target.closest('.watchlist-card');
          if (!card) return;
          
          // Skip swipe delete buttons or checkbox itself to avoid double-toggling
          if (e.target.closest('.wc-swipe-actions') || e.target.classList.contains('wc-checkbox') || e.target.closest('.mcx-comex-switch')) {
            return;
          }
          
          e.preventDefault();
          e.stopPropagation();
          
          var cb = card.querySelector('.wc-checkbox');
          if (cb) {
            cb.checked = !cb.checked;
            if (typeof window.__updateSelectionUI === 'function') window.__updateSelectionUI();
          }
        }, true);

        // Handle delegating checkbox change listener to keep count updated
        document.addEventListener('change', function(e) {
          if (e.target && e.target.classList.contains('wc-checkbox')) {
            if (typeof window.__updateSelectionUI === 'function') window.__updateSelectionUI();
          }
        });
      }

      var basketModeBtn = document.getElementById('basketModeBtn');
      // basketModeBtn click is handled by React - no JS handler needed

      function attachSwipeHandlers() {
        var cards = document.querySelectorAll('.watchlist-card');
        cards.forEach(function(card) {
          if (card.getAttribute('data-swipe-attached')) return;
          card.setAttribute('data-swipe-attached', 'true');
          
          var startX = 0, currentX = 0, isDragging = false;
          card.addEventListener('touchstart', function(e) {
            startX = e.touches[0].clientX;
            currentX = startX;
            isDragging = true;
            longPressTimer = setTimeout(function() {
              if (!selectionMode) {
                enterSelectionMode();
                var cb = card.querySelector('.wc-checkbox');
                if (cb) cb.checked = true;
                updateSelectionUI();
              }
            }, 500);
          }, { passive: true });

          card.addEventListener('touchmove', function(e) {
            if (!isDragging) return;
            clearTimeout(longPressTimer);
            currentX = e.touches[0].clientX;
            var diff = currentX - startX;
            var content = card.querySelector('.wc-content');
            if (!content) return;
            if (diff < -50) {
              content.style.transform = 'translateX(-80px)';
            } else if (diff > 0) {
              content.style.transform = 'translateX(0)';
            }
          }, { passive: true });

          card.addEventListener('touchend', function() {
            clearTimeout(longPressTimer);
            isDragging = false;
          });
        });
      }

      function enterSelectionMode() {
        selectionMode = true;
        window.__selectionModeActive = true;
        if (window.__reactSetSelectionActive) window.__reactSetSelectionActive(true);
        document.querySelectorAll('.wc-checkbox-wrapper').forEach(function(el) {
          el.style.display = 'flex';
        });
        updateSelectionUI();
      }

      function exitSelectionMode() {
        selectionMode = false;
        window.__selectionModeActive = false;
        if (window.__reactSetSelectionActive) window.__reactSetSelectionActive(false);
        document.querySelectorAll('.wc-checkbox-wrapper').forEach(function(el) {
          el.style.display = 'none';
        });
        document.querySelectorAll('.wc-checkbox').forEach(function(cb) {
          cb.checked = false;
        });
      }

      function updateSelectionUI() {
        var checked = document.querySelectorAll('.wc-checkbox:checked').length;
        if (selectedCountSpan) selectedCountSpan.textContent = checked + ' selected';
      }
      window.__updateSelectionUI = updateSelectionUI;
      window.__selectionModeActive = selectionMode;

      window.__renderWatchlist = function() { /* Now handled by React */ };
      window.attachSwipeHandlers = attachSwipeHandlers;
      window.enterSelectionMode = enterSelectionMode;
      window.exitSelectionMode = exitSelectionMode;
      window.openDetailSheet = openDetailSheet;
      window.openTradeSheet = openTradeSheet;
      window.addToWatchlist = addToWatchlist;
      window.removeFromWatchlist = removeFromWatchlist;
      
      attachSwipeHandlers();
    })();
  `;
}

export default function WatchlistPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading watchlist...</div>;
  }

  return (
    <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading watchlist...</div>}>
      <WatchlistContent />
    </Suspense>
  );
}


