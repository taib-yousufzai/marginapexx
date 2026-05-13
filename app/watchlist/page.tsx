'use client';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Footer from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import { useKiteQuotes, QuoteData } from '@/hooks/useKiteQuotes';
import { useBinanceQuotes, BinanceQuoteData } from '@/hooks/useBinanceQuotes';
import { useComexQuotes, ComexQuoteData } from '@/hooks/useComexQuotes';
import { useOrderEntry, OrderSide, OrderType, ProductType } from '@/hooks/useOrderEntry';
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
}

declare global {
  interface Window {
    __kiteQuotes: Record<string, QuoteData>;
    __binanceQuotes: Record<string, BinanceQuoteData>;
    __comexQuotes: Record<string, ComexQuoteData>;
    __watchlistItems: WatchlistItem[];
    __renderWatchlist: () => void;
    __addToWatchlistCallback: (item: WatchlistItem) => void;
    __removeFromWatchlistCallback: (symbol: string) => void;
  }
}

const WATCHLIST_KEY = 'marginApex_watchlist';

function loadWatchlistFromStorage(): WatchlistItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : [];
  } catch { return []; }
}

function saveWatchlistToStorage(items: WatchlistItem[]) {
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items)); } catch { }
}

// ── Default Crypto Items (Binance) ──────────────────────────────────────────

const DEFAULT_CRYPTO_ITEMS: WatchlistItem[] = [
  { name: 'Bitcoin', symbol: 'BTC', kiteSymbol: '', binanceSymbol: 'BTCUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
  { name: 'Ethereum', symbol: 'ETH', kiteSymbol: '', binanceSymbol: 'ETHUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
  { name: 'BNB', symbol: 'BNB', kiteSymbol: '', binanceSymbol: 'BNBUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
  { name: 'Solana', symbol: 'SOL', kiteSymbol: '', binanceSymbol: 'SOLUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
  { name: 'XRP', symbol: 'XRP', kiteSymbol: '', binanceSymbol: 'XRPUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
  { name: 'Dogecoin', symbol: 'DOGE', kiteSymbol: '', binanceSymbol: 'DOGEUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
  { name: 'Cardano', symbol: 'ADA', kiteSymbol: '', binanceSymbol: 'ADAUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
  { name: 'Polygon', symbol: 'MATIC', kiteSymbol: '', binanceSymbol: 'MATICUSDT', price: 0, change: '0%', segment: 'Crypto', contractDate: '', open: 0, high: 0, low: 0, close: 0, category: 'CRYPTO' },
];

// ── Default Forex Items (Zerodha CDS segment — INR pairs) ──────────────────
// Update expiry month as contracts roll (format: CDS:XYZINR26MONFUT)

const DEFAULT_FOREX_ITEMS: WatchlistItem[] = [
  { name: 'USD/INR', symbol: 'USDINR_FUT', kiteSymbol: 'CDS:USDINR26MAYFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'May 2026', open: 0, high: 0, low: 0, close: 0, category: 'FOREX' },
  { name: 'EUR/INR', symbol: 'EURINR_FUT', kiteSymbol: 'CDS:EURINR26MAYFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'May 2026', open: 0, high: 0, low: 0, close: 0, category: 'FOREX' },
  { name: 'GBP/INR', symbol: 'GBPINR_FUT', kiteSymbol: 'CDS:GBPINR26MAYFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'May 2026', open: 0, high: 0, low: 0, close: 0, category: 'FOREX' },
  { name: 'JPY/INR', symbol: 'JPYINR_FUT', kiteSymbol: 'CDS:JPYINR26MAYFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'May 2026', open: 0, high: 0, low: 0, close: 0, category: 'FOREX' },
];

// ── Default COMEX Items (MCX ₹ via Kite + COMEX $ via Yahoo proxy) ──────────────
// Rows with both kiteSymbol + comexSymbol show a ₹⇄$ toggle pill

const DEFAULT_COMEX_ITEMS: WatchlistItem[] = [
  { name: 'Gold', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26JUNFUT', comexSymbol: 'GC=F', price: 0, change: '0%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 0, high: 0, low: 0, close: 0, category: 'COI' },
  { name: 'Silver', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULYFUT', comexSymbol: 'SI=F', price: 0, change: '0%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 0, high: 0, low: 0, close: 0, category: 'COI' },
  { name: 'Crude Oil', symbol: 'CRUDEOIL_FUT', kiteSymbol: 'MCX:CRUDEOIL26MAYFUT', comexSymbol: 'CL=F', price: 0, change: '0%', segment: 'MCX - Futures', contractDate: 'May 2026', open: 0, high: 0, low: 0, close: 0, category: 'COI' },
  { name: 'Copper', symbol: 'COPPER_FUT', kiteSymbol: 'MCX:COPPER26JUNFUT', comexSymbol: 'HG=F', price: 0, change: '0%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 0, high: 0, low: 0, close: 0, category: 'COI' },
];

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
      close: 22456.80
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
      close: 48210.50
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
      close: 74230.15
    },
    ...DEFAULT_CRYPTO_ITEMS,
    ...DEFAULT_FOREX_ITEMS,
    ...DEFAULT_COMEX_ITEMS,
  ];
}

// ── Tab Labels ──────────────────────────────────────────────────────────────

export type TabLabel =
  | 'WATCHLIST'
  | 'INDEX-FUT' | 'INDEX-OPT'
  | 'STOCK-FUT' | 'STOCK-OPT'
  | 'MCX-FUT' | 'MCX-OPT'
  | 'NSF-EQ' | 'CRYPTO'
  | 'FOREX' | 'COI';

export const TAB_LABELS: TabLabel[] = [
  'WATCHLIST',
  'INDEX-FUT', 'INDEX-OPT',
  'STOCK-FUT',
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
  'NSE - Equity': 'NSF-EQ',
  'BSE - Equity': 'NSF-EQ',
  'Crypto': 'CRYPTO',
  'CRYPTO': 'CRYPTO',
  'Forex': 'FOREX',
  'FOREX': 'FOREX',
  'CDS - Futures': 'FOREX',
  'CDS - Options': 'FOREX',
  'COMEX - Futures': 'COI',
  'COMEX - Options': 'COI',
};

// ── Pure Helper Functions ────────────────────────────────────────────────────

/** Maps a WatchlistItem to its TabLabel. Checks category first, then segment. */
export function getTabForItem(item: WatchlistItem): TabLabel {
  if (item.category && TAB_LABELS.includes(item.category as TabLabel)) {
    return item.category as TabLabel;
  }
  return SEGMENT_TAB_MAP[item.segment] ?? 'COI';
}

/** Filters items to those belonging to the active tab. */
export function filterByTab(items: WatchlistItem[], tab: TabLabel): WatchlistItem[] {
  if (tab === 'WATCHLIST') return items;
  return items.filter(item => getTabForItem(item) === tab);
}

/** Filters items by case-insensitive name/symbol match. Treats whitespace-only query as empty. */
export function filterBySearch(items: WatchlistItem[], query: string): WatchlistItem[] {
  if (!query.trim()) return items;
  const q = query.toLowerCase();
  return items.filter(
    item =>
      item.name.toLowerCase().includes(q) ||
      item.symbol.toLowerCase().includes(q)
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
  binanceQuote?: BinanceQuoteData;
  comexQuote?: ComexQuoteData;
  onTrade: (item: WatchlistItem) => void;
  onDetail: (item: WatchlistItem) => void;
  basketMode?: boolean;
  onBasketBuy?: (item: WatchlistItem) => void;
  onBasketSell?: (item: WatchlistItem) => void;
}

function InstrumentRow({ item, quote, binanceQuote, comexQuote, onTrade, onDetail, basketMode, onBasketBuy, onBasketSell }: InstrumentRowProps) {
  const [priceView, setPriceView] = useState<'kite' | 'comex'>('kite');

  const isCrypto = !!item.binanceSymbol;
  const hasDualView = !!item.kiteSymbol && !!item.comexSymbol;
  const showComex = hasDualView && priceView === 'comex';

  let ltp = 0;
  let prevClose = 0;
  if (isCrypto) {
    ltp = binanceQuote?.lastPrice ?? 0;
    prevClose = binanceQuote?.close ?? 0;
  } else if (showComex) {
    ltp = comexQuote?.lastPrice ?? 0;
    prevClose = comexQuote?.close ?? 0;
  } else {
    ltp = quote?.lastPrice ?? item.price;
    prevClose = item.close;
  }

  const absoluteChange = ltp - prevClose;
  const percentChange = prevClose !== 0 ? ((ltp - prevClose) / prevClose) * 100 : 0;
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
              {isCrypto ? 'BINANCE' : showComex ? 'COMEX' : getExchangeBadge(item.segment)}
            </span>
          </div>
          {item.contractDate && (
            <div className="instr-row__date">{item.contractDate}</div>
          )}
          {isCrypto && (
            <div className="instr-row__date" style={{ color: '#6B7280', fontSize: '0.7rem' }}>{item.binanceSymbol}</div>
          )}
          {hasDualView && (
            <div
              onClick={(e) => { e.stopPropagation(); setPriceView(v => v === 'kite' ? 'comex' : 'kite'); }}
              style={{ fontSize: '0.62rem', fontWeight: '700', color: showComex ? '#4A148C' : '#2C8E5A', background: showComex ? '#EDE7F6' : '#E9F6EF', padding: '2px 8px', borderRadius: '20px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '3px', userSelect: 'none' }}
            >
              {showComex ? '$ COMEX ⇄ ₹ MCX' : '₹ MCX ⇄ $ COMEX'}
            </div>
          )}
        </div>
        <div className="instr-row__right" onClick={handleRightClick} style={{ cursor: 'pointer' }}>
          {isLoading ? (
            <div className="instr-row__ltp" style={{ color: '#9CA3AF' }}>Loading…</div>
          ) : (
            <>
              <div className="instr-row__ltp">
                {isCrypto
                  ? `$${ltp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : showComex
                    ? `$${ltp.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : `LTP: ${ltp.toFixed(2)}`}
              </div>
              <div className="instr-row__abs-change">{absoluteChange >= 0 ? '+' : ''}{absoluteChange.toFixed(2)}</div>
              <div className={`instr-row__pct-change ${getPctClass(percentChange)}`}>
                {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%
              </div>
            </>
          )}
        </div>
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

const TRADING_SEGMENTS: TradingSegment[] = [
  {
    name: 'INDEX - FUTURE', icon: 'fa-chart-line',
    instruments: [
      { name: 'NIFTY FUT', symbol: 'NIFTY_FUT', kiteSymbol: 'NSE:NIFTY 50', price: 22456.80, change: '+0.45%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 22350, high: 22580, low: 22320, close: 22456.80 },
      { name: 'SENSEX FUT', symbol: 'SENSEX_FUT', kiteSymbol: 'BSE:SENSEX', price: 74230.15, change: '+0.32%', segment: 'BSE - Futures', contractDate: '28 Mar 2025', open: 73950, high: 74500, low: 73800, close: 74230.15 },
      { name: 'BANKNIFTY FUT', symbol: 'BANKNIFTY_FUT', kiteSymbol: 'NSE:NIFTY BANK', price: 48210.50, change: '-0.21%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 48350, high: 48500, low: 48100, close: 48210.50 },
      { name: 'FINNIFTY FUT', symbol: 'FINNIFTY_FUT', kiteSymbol: 'NSE:NIFTY FIN SERVICE', price: 21234.90, change: '+0.67%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 21080, high: 21350, low: 21050, close: 21234.90 },
      { name: 'MIDCAP NIFTY FUT', symbol: 'MIDCP_FUT', kiteSymbol: 'NSE:NIFTY MIDCAP 50', price: 11820.45, change: '+0.88%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 11700, high: 11880, low: 11680, close: 11820.45 },
    ]
  },
  {
    name: 'INDEX - OPTIONS', icon: 'fa-chart-gantt',
    subCategories: [
      { name: 'NIFTY Options', instruments: [
        { name: 'NIFTY 22500 CE', symbol: 'NIFTY22500CE', kiteSymbol: '', price: 125.40, change: '+2.3%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 122, high: 128.50, low: 121, close: 125.40 },
        { name: 'NIFTY 22400 PE', symbol: 'NIFTY22400PE', kiteSymbol: '', price: 78.20, change: '-1.2%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 79.50, high: 80, low: 77.50, close: 78.20 },
      ]},
      { name: 'SENSEX Options', instruments: [
        { name: 'SENSEX 74500 CE', symbol: 'SENSEX745CE', kiteSymbol: '', price: 210.30, change: '+0.9%', segment: 'BSE - Options', contractDate: '28 Mar 2025', open: 208, high: 212.50, low: 207.50, close: 210.30 },
      ]},
      { name: 'BANKEX Options', instruments: [
        { name: 'BANKEX 52000 CE', symbol: 'BANKEX520CE', kiteSymbol: '', price: 310.75, change: '+1.1%', segment: 'BSE - Options', contractDate: '28 Mar 2025', open: 307, high: 314, low: 306.50, close: 310.75 },
      ]},
      { name: 'BANKNIFTY Options', instruments: [
        { name: 'BANKNIFTY 48500 CE', symbol: 'BN48500CE', kiteSymbol: '', price: 215.60, change: '-0.4%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 216.50, high: 218, low: 214, close: 215.60 },
        { name: 'BANKNIFTY 48000 PE', symbol: 'BN48000PE', kiteSymbol: '', price: 140.25, change: '+0.7%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 139, high: 142, low: 138.50, close: 140.25 },
      ]},
      { name: 'FINNIFTY Options', instruments: [
        { name: 'FINNIFTY 21500 CE', symbol: 'FIN21500CE', kiteSymbol: '', price: 92.50, change: '+1.5%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 91, high: 94, low: 90.50, close: 92.50 },
      ]},
      { name: 'MID CAP NIFTY Options', instruments: [
        { name: 'MIDCPNIFTY 11800 CE', symbol: 'MIDCP118CE', kiteSymbol: '', price: 65.30, change: '+2.1%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 63.80, high: 66.50, low: 63.50, close: 65.30 },
      ]},
    ]
  },
  {
    name: 'STOCKS - FUTURE', icon: 'fa-building',
    instruments: [
      { name: 'RELIANCE FUT', symbol: 'RELIANCE_FUT', kiteSymbol: 'NSE:RELIANCE', price: 2856.40, change: '+0.75%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 2835, high: 2870, low: 2830, close: 2856.40 },
      { name: 'TCS FUT', symbol: 'TCS_FUT', kiteSymbol: 'NSE:TCS', price: 3987.20, change: '-0.33%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 4000, high: 4015, low: 3975, close: 3987.20 },
      { name: 'HDFCBANK FUT', symbol: 'HDFCBANK_FUT', kiteSymbol: 'NSE:HDFCBANK', price: 1680.90, change: '+0.22%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 1675, high: 1688, low: 1672, close: 1680.90 },
    ]
  },
  {
    name: 'MCX - FUTURE', icon: 'fa-coins',
    instruments: [
      { name: 'GOLD FUT', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26JUNFUT', price: 72450, change: '+0.28%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 72150, high: 72450, low: 72100, close: 72450 },
      { name: 'SILVER FUT', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULYFUT', price: 82230, change: '-0.15%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 82350, high: 82450, low: 82100, close: 82230 },
      { name: 'CRUDEOIL FUT', symbol: 'CRUDEOIL_FUT', kiteSymbol: 'MCX:CRUDEOIL26MAYFUT', price: 6120.50, change: '+1.2%', segment: 'MCX - Futures', contractDate: 'May 2026', open: 6045, high: 6140, low: 6040, close: 6120.50 },
    ]
  },
  {
    name: 'CRYPTO', icon: 'fa-bitcoin',
    instruments: [
      { name: 'BTC/USDT', symbol: 'BTCUSDT', kiteSymbol: '', binanceSymbol: 'BTCUSDT', price: 68450.20, change: '+2.1%', segment: 'Crypto', contractDate: 'Perpetual', open: 67000, high: 69000, low: 66800, close: 68450.20 },
      { name: 'ETH/USDT', symbol: 'ETHUSDT', kiteSymbol: '', binanceSymbol: 'ETHUSDT', price: 3420.80, change: '+1.4%', segment: 'Crypto', contractDate: 'Perpetual', open: 3370, high: 3450, low: 3360, close: 3420.80 },
      { name: 'SOL/USDT', symbol: 'SOLUSDT', kiteSymbol: '', binanceSymbol: 'SOLUSDT', price: 182.30, change: '-0.7%', segment: 'Crypto', contractDate: 'Perpetual', open: 183.50, high: 184, low: 181, close: 182.30 },
    ]
  },
  {
    name: 'FOREX', icon: 'fa-globe',
    instruments: [
      { name: 'USD/INR', symbol: 'USDINR_FUT', kiteSymbol: 'CDS:USDINR26MAYFUT', price: 83.45, change: '+0.05%', segment: 'CDS - Futures', contractDate: 'May 2026', open: 83.40, high: 83.50, low: 83.35, close: 83.45 },
      { name: 'EUR/INR', symbol: 'EURINR_FUT', kiteSymbol: 'CDS:EURINR26MAYFUT', price: 90.12, change: '-0.02%', segment: 'CDS - Futures', contractDate: 'May 2026', open: 90.15, high: 90.25, low: 90.05, close: 90.12 },
      { name: 'GBP/INR', symbol: 'GBPINR_FUT', kiteSymbol: 'CDS:GBPINR26MAYFUT', price: 107.30, change: '+0.08%', segment: 'CDS - Futures', contractDate: 'May 2026', open: 107.10, high: 107.50, low: 107.00, close: 107.30 },
    ]
  },
  {
    name: 'COMEX', icon: 'fa-gem',
    instruments: [
      { name: 'Gold', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26JUNFUT', comexSymbol: 'GC=F', price: 72450, change: '+0.28%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 72150, high: 72450, low: 72100, close: 72450 },
      { name: 'Silver', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULYFUT', comexSymbol: 'SI=F', price: 82230, change: '-0.15%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 82350, high: 82450, low: 82100, close: 82230 },
      { name: 'Crude Oil', symbol: 'CRUDEOIL_FUT', kiteSymbol: 'MCX:CRUDEOIL26MAYFUT', comexSymbol: 'CL=F', price: 6120.50, change: '+1.2%', segment: 'MCX - Futures', contractDate: 'May 2026', open: 6045, high: 6140, low: 6040, close: 6120.50 },
    ]
  },
];

function WatchlistContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useAuth();
  const { placeOrder, loading: placingOrder, error: placeOrderError } = useOrderEntry();

  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabLabel>('WATCHLIST');
  const [searchText, setSearchText] = useState<string>('');
  const [isFolderDrawerOpen, setIsFolderDrawerOpen] = useState(false);
  const [expandedSegments, setExpandedSegments] = useState<Record<string, boolean>>({});

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
  const [orderQty, setOrderQty] = useState<number>(25);
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [productType, setProductType] = useState<ProductType>('INTRADAY');
  const [orderUnit, setOrderUnit] = useState<'qty' | 'lot'>('qty');
  const [limitPrice, setLimitPrice] = useState<string>('');

  // Basket Mode State
  const [basketMode, setBasketMode] = useState(false);
  const [basketLegs, setBasketLegs] = useState<Array<{ item: WatchlistItem; side: 'BUY' | 'SELL'; qty: number; unit: 'qty' | 'lot' }>>([]);
  const [showBasketConfirm, setShowBasketConfirm] = useState(false);

  const filteredItems = filterBySearch(filterByTab(watchlistItems, activeTab), searchText);
  const scriptMountedRef = useRef(false);

  // Available Balance State
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);

  useEffect(() => {
    async function fetchBalance() {
      try {
        const { supabase: sb } = await import('@/lib/supabaseClient');
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/pay/balance', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.ok) {
          const text = await res.text();
          try {
            const { balance } = JSON.parse(text);
            setAvailableBalance(balance);
          } catch (e) {
            console.error('Failed to parse balance JSON:', text.substring(0, 100));
          }
        }
      } catch (err) {
        console.error('Failed to fetch available balance', err);
      }
    }
    fetchBalance();
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('marginApexTheme');
    if (saved === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
  }, []);

  // Handle deep linking from other screens (e.g. Home)
  const deepLinkSymbol = searchParams.get('symbol');
  useEffect(() => {
    if (deepLinkSymbol && watchlistItems.length > 0) {
      const query = deepLinkSymbol.toUpperCase();
      // Find item that matches name or symbol
      const item = watchlistItems.find(i => 
        i.symbol.toUpperCase() === query || 
        i.name.toUpperCase().includes(query) ||
        (i.kiteSymbol && i.kiteSymbol.toUpperCase().includes(query))
      );

      if (item) {
        // Switch to the appropriate tab if needed
        const itemTab = getTabForItem(item);
        if (itemTab !== activeTab) {
          setActiveTab(itemTab);
        }

        // Auto-open the trade sheet
        const timer = setTimeout(() => {
          openTradeSheet(item);
        }, 500); // Wait a bit for render
        return () => clearTimeout(timer);
      }
    }
  }, [deepLinkSymbol, watchlistItems]);

  useEffect(() => {
    const raw = localStorage.getItem(WATCHLIST_KEY);

    if (raw === null) {
      const defaults = getDefaultWatchlistItems();
      setWatchlistItems(defaults);
      saveWatchlistToStorage(defaults);
    } else {
      let loaded = loadWatchlistFromStorage();

      // MIGRATION: Update legacy items to new segments/symbols
      let migrated = false;
      const updated = loaded.map(item => {
        // Upgrade legacy Forex (Frankfurter) to new CDS pairs
        if ((item.category === 'FOREX' || item.segment === 'Forex') && !item.kiteSymbol.startsWith('CDS:')) {
          const match = DEFAULT_FOREX_ITEMS.find(d => d.name === item.name || d.symbol === item.symbol);
          if (match) { migrated = true; return { ...match }; }
        }
        // Upgrade legacy COMEX to dual-source MCX pairs
        if (item.category === 'COI' && (!item.kiteSymbol || !item.kiteSymbol.startsWith('MCX:'))) {
          const match = DEFAULT_COMEX_ITEMS.find(d => d.name === item.name || d.name.includes(item.name) || item.name.includes(d.name));
          if (match) { migrated = true; return { ...match }; }
        }
        return item;
      });

      if (migrated) {
        setWatchlistItems(updated);
        saveWatchlistToStorage(updated);
      } else {
        setWatchlistItems(loaded);
      }
    }
  }, []);

  const kiteSymbols = watchlistItems.map(i => i.kiteSymbol).filter(Boolean);
  const { quotes } = useKiteQuotes(kiteSymbols, 5000);

  const binanceSymbols = watchlistItems
    .map(i => i.binanceSymbol)
    .filter((s): s is string => !!s);
  const { quotes: binanceQuotes } = useBinanceQuotes(binanceSymbols, 5000);

  const comexSymbols = watchlistItems
    .map(i => i.comexSymbol)
    .filter((s): s is string => !!s);
  const { quotes: comexQuotes } = useComexQuotes(comexSymbols, 30_000);

  useEffect(() => {
    window.__kiteQuotes = quotes;
    window.__binanceQuotes = binanceQuotes;
    window.__comexQuotes = comexQuotes;
    window.__watchlistItems = watchlistItems;
    if (scriptMountedRef.current && typeof (window as any).attachSwipeHandlers === 'function') {
      (window as any).attachSwipeHandlers();
    }
  }, [quotes, binanceQuotes, comexQuotes, watchlistItems]);

  useEffect(() => {
    window.__addToWatchlistCallback = (item: WatchlistItem) => {
      setWatchlistItems(prev => {
        if (prev.some(i => i.symbol === item.symbol)) return prev;
        const next = [...prev, item];
        saveWatchlistToStorage(next);
        return next;
      });
    };
    window.__removeFromWatchlistCallback = (symbol: string) => {
      setWatchlistItems(prev => {
        const next = prev.filter(i => i.symbol !== symbol);
        saveWatchlistToStorage(next);
        return next;
      });
    };
    // Expose React handlers to window for legacy scripts
    (window as any).__reactOpenTradeSheet = (symbol: string) => {
      let item: WatchlistItem | undefined = window.__watchlistItems?.find((i: WatchlistItem) => i.symbol === symbol)
        || watchlistItems.find(i => i.symbol === symbol);

      if (!item) {
        for (const seg of TRADING_SEGMENTS) {
          const insts = [
            ...(seg.instruments || []),
            ...(seg.subCategories?.flatMap(s => s.instruments) || [])
          ];
          const found = insts.find(i => i.symbol === symbol);
          if (found) {
            item = {
              name: found.name,
              symbol: found.symbol,
              kiteSymbol: found.kiteSymbol,
              price: found.price,
              change: found.change,
              segment: found.segment,
              contractDate: found.contractDate,
              open: found.open,
              high: found.high,
              low: found.low,
              close: found.close,
              binanceSymbol: found.binanceSymbol,
              comexSymbol: found.comexSymbol,
            } as WatchlistItem;
            break;
          }
        }
      }

      if (item) {
        // Directly set state - avoid stale closure
        setSelectedItem(item);
        const isIndex = item.name.includes('NIFTY') || item.name.includes('BANKNIFTY');
        setOrderQty(isIndex ? 25 : 1);
        setOrderUnit('qty');
        setOrderType('MARKET');
        setProductType('INTRADAY');
        const detailSheet = document.getElementById('detailSheet');
        const detailOverlay = document.getElementById('detailSheetOverlay');
        if (detailSheet) detailSheet.classList.remove('open');
        if (detailOverlay) detailOverlay.classList.remove('active');
        const sheet = document.getElementById('tradeSheet');
        const overlay = document.getElementById('tradeSheetOverlay');
        const footer = document.getElementById('tsStickyFooter');
        if (sheet) sheet.classList.add('open');
        if (overlay) overlay.classList.add('active');
        if (footer) footer.classList.add('visible');
      }
    };
    (window as any).__reactOpenDetailSheet = (symbol: string) => {
      // Search in user watchlist first
      let item: WatchlistItem | undefined = window.__watchlistItems?.find((i: WatchlistItem) => i.symbol === symbol)
        || watchlistItems.find(i => i.symbol === symbol);

      if (!item) {
        for (const seg of TRADING_SEGMENTS) {
          const insts = [
            ...(seg.instruments || []),
            ...(seg.subCategories?.flatMap(s => s.instruments) || [])
          ];
          const found = insts.find(i => i.symbol === symbol);
          if (found) {
            item = {
              name: found.name,
              symbol: found.symbol,
              kiteSymbol: found.kiteSymbol,
              price: found.price,
              change: found.change,
              segment: found.segment,
              contractDate: found.contractDate,
              open: found.open,
              high: found.high,
              low: found.low,
              close: found.close,
              binanceSymbol: found.binanceSymbol,
              comexSymbol: found.comexSymbol,
            } as WatchlistItem;
            break;
          }
        }
      }

      if (item) {
        // Directly set state - avoid stale closure
        setSelectedItem(item);
        const tradeSheet = document.getElementById('tradeSheet');
        const tradeOverlay = document.getElementById('tradeSheetOverlay');
        if (tradeSheet) tradeSheet.classList.remove('open');
        if (tradeOverlay) tradeOverlay.classList.remove('active');
        const detailSheet = document.getElementById('detailSheet');
        const detailOverlay = document.getElementById('detailSheetOverlay');
        if (detailSheet) detailSheet.classList.add('open');
        if (detailOverlay) detailOverlay.classList.add('active');
      }
    };
  }, [watchlistItems]);

  const openTradeSheet = (item: WatchlistItem) => {
    setSelectedItem(item);
    // Reset defaults or set based on item type
    const isIndex = item.name.includes('NIFTY') || item.name.includes('BANKNIFTY');
    setOrderQty(isIndex ? 25 : 1);
    setOrderUnit('qty');
    setOrderType('MARKET');
    setProductType('INTRADAY');

    // Close detail sheet if open
    const detailSheet = document.getElementById('detailSheet');
    const detailOverlay = document.getElementById('detailSheetOverlay');
    if (detailSheet) detailSheet.classList.remove('open');
    if (detailOverlay) detailOverlay.classList.remove('active');

    // Trigger visual sheet open (compat with existing CSS)
    const sheet = document.getElementById('tradeSheet');
    const overlay = document.getElementById('tradeSheetOverlay');
    const footer = document.getElementById('tsStickyFooter');
    if (sheet) sheet.classList.add('open');
    if (overlay) overlay.classList.add('active');
    if (footer) footer.classList.add('visible');
  };

  const closeTradeSheet = () => {
    const sheet = document.getElementById('tradeSheet');
    const overlay = document.getElementById('tradeSheetOverlay');
    const footer = document.getElementById('tsStickyFooter');
    if (sheet) sheet.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    if (footer) footer.classList.remove('visible');
    setSelectedItem(null);
  };

  const openDetailSheet = (item: WatchlistItem) => {
    setSelectedItem(item);
    // Close trade sheet if open
    const tradeSheet = document.getElementById('tradeSheet');
    const tradeOverlay = document.getElementById('tradeSheetOverlay');
    if (tradeSheet) tradeSheet.classList.remove('open');
    if (tradeOverlay) tradeOverlay.classList.remove('active');
    // Open detail sheet
    const detailSheet = document.getElementById('detailSheet');
    const detailOverlay = document.getElementById('detailSheetOverlay');
    if (detailSheet) detailSheet.classList.add('open');
    if (detailOverlay) detailOverlay.classList.add('active');
  };

  const handlePlaceOrder = async (side: OrderSide) => {
    if (!selectedItem) return;

    // Resolve live LTP from correct source (mirrors the trade sheet display logic)
    const isCryptoItem = !!(selectedItem.binanceSymbol);
    let livePrice = selectedItem.price;
    if (isCryptoItem && selectedItem.binanceSymbol) {
      livePrice = binanceQuotes[selectedItem.binanceSymbol]?.lastPrice ?? selectedItem.price;
    } else if (selectedItem.kiteSymbol) {
      livePrice = quotes[selectedItem.kiteSymbol]?.lastPrice ?? selectedItem.price;
    }

    const result = await placeOrder({
      symbol: selectedItem.symbol,
      kite_instrument: selectedItem.kiteSymbol || selectedItem.symbol,
      segment: selectedItem.segment,
      side,
      order_type: orderType,
      product_type: productType,
      qty: orderQty,
      lots: orderUnit === 'lot' ? orderQty : 0,
      client_price: orderType === 'LIMIT' ? parseFloat(limitPrice) : livePrice
    });

    if (result.success) {
      closeTradeSheet();
      showToast(`✅ Order Executed: ${side} ${orderQty} ${selectedItem.name} @ ₹${result.order?.fill_price?.toLocaleString('en-IN') ?? '---'}`, false);
    } else {
      showToast(`❌ Order Failed: ${result.error}`, true);
    }
  };

  // ── Trade sheet: resolve live quote from correct source ─────────────────
  // Crypto  → useBinanceQuotes  (kiteSymbol is '' for crypto)
  // COMEX   → useComexQuotes    (has both kiteSymbol + comexSymbol)
  // All else→ useKiteQuotes
  const isCrypto = !!(selectedItem?.binanceSymbol);
  const isComex  = !!(selectedItem?.comexSymbol);

  const currentKiteQuote    = selectedItem?.kiteSymbol   ? quotes[selectedItem.kiteSymbol]           : null;
  const currentBinanceQuote = selectedItem?.binanceSymbol ? binanceQuotes[selectedItem.binanceSymbol] : null;
  const currentComexQuote   = selectedItem?.comexSymbol   ? comexQuotes[selectedItem.comexSymbol]     : null;

  let currentLtp           = 0;
  let currentChangePercent = 0;
  let currentChangePts     = 0;

  if (isCrypto && currentBinanceQuote) {
    currentLtp           = currentBinanceQuote.lastPrice;
    currentChangePercent = currentBinanceQuote.changePercent;
    currentChangePts     = currentBinanceQuote.change;
  } else if (isComex && currentComexQuote) {
    currentLtp           = currentComexQuote.lastPrice;
    currentChangePercent = currentComexQuote.changePercent;
    currentChangePts     = currentComexQuote.change;
  } else if (currentKiteQuote) {
    currentLtp           = currentKiteQuote.lastPrice;
    currentChangePercent = currentKiteQuote.changePercent;
    currentChangePts     = currentKiteQuote.change;
  } else {
    // Fallback to static item price (before any live data arrives)
    currentLtp = selectedItem?.price ?? 0;
  }

  const formatPrice = (price: number) => {
    if (isCrypto || isComex) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const bidPrice = currentLtp - (currentLtp * 0.001);
  const askPrice = currentLtp + (currentLtp * 0.001);

  const calculatedRequiredMargin = orderType === 'LIMIT' && limitPrice
    ? orderQty * parseFloat(limitPrice)
    : orderQty * currentLtp;

  useEffect(() => {
    window.__kiteQuotes = window.__kiteQuotes || {};
    window.__watchlistItems = window.__watchlistItems || [];

    const script = document.createElement('script');
    script.innerHTML = buildInlineScript();
    document.body.appendChild(script);
    scriptMountedRef.current = true;
    return () => {
      if (document.body.contains(script)) document.body.removeChild(script);
      scriptMountedRef.current = false;
    };
  }, []);

  return (
    <div className="mobile-app" suppressHydrationWarning>
      <div className="app-header">
        <div className="header-top">
          <div className="logo-area">
            <div className="logo-text">Watchlist</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <div className="folder-btn" id="openFolderMobileBtn" onClick={() => setIsFolderDrawerOpen(true)}>
              <i className="fas fa-folder"></i>
              <span>Library</span>
              <i className="fas fa-chevron-right"></i>
            </div>
          </div>
        </div>
        <SegmentTabBar activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setSearchText(''); }} />
        <div className="search-wrapper">
          <i className="fas fa-search search-icon"></i>
          <input type="text" className="search-input" id="globalSearchInput" placeholder="Search instrument" autoComplete="off" value={searchText} onChange={(e) => setSearchText(e.target.value)} suppressHydrationWarning />
          <i className="fas fa-trash clear-search" id="clearSearchBtn" onClick={() => setSearchText('')}></i>
        </div>
      </div>

      <div className="main-content">
        <div id="searchResultsArea" className="search-results-section" style={{ display: 'none' }}>
          <div className="section-subtitle">
            <i className="fas fa-search"></i> SEARCH RESULTS <span style={{ fontSize: '0.6rem', marginLeft: 'auto' }} id="searchResultCount"></span>
          </div>
          <div id="searchResultsList"></div>
        </div>

        <div className="watchlist-section">
          <div className="watchlist-header">
            <div className="watchlist-title-section">
              <div className="watchlist-title"><i className="fas fa-chart-line"></i> MY WATCHLIST</div>
              <div className="watchlist-count" id="mobileWatchlistCounter">{filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}</div>
            </div>
            <div className="action-hint">Swipe | Hold to select | Tap to trade</div>
          </div>
          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span className="add-hint"><i className="fas fa-plus-circle"></i> Add scripts to watchlist from Scripts Library</span>
            <div className="folder-btn basket-btn" id="basketModeBtn"
              onClick={() => setBasketMode(b => !b)}
              style={{ cursor: 'pointer', background: '#E9F6EF', color: '#006400', border: '1px solid #C3E6D4', padding: '6px 14px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '30px', fontWeight: '700', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <i className="fas fa-shopping-basket" style={{ color: '#006400' }}></i>
              <span>Basket</span>
            </div>
          </div>
          <div className="watchlist-card-list">
            {filteredItems.length === 0 ? <EmptyState /> : filteredItems.map(item => (
              <InstrumentRow
                key={item.symbol}
                item={item}
                quote={quotes[item.kiteSymbol]}
                binanceQuote={item.binanceSymbol ? binanceQuotes[item.binanceSymbol] : undefined}
                comexQuote={item.comexSymbol ? comexQuotes[item.comexSymbol] : undefined}
                onTrade={openTradeSheet}
                onDetail={openDetailSheet}
                basketMode={basketMode}
                onBasketBuy={(it) => setBasketLegs(prev => {
                  // If BUY leg already exists for this symbol, remove it (toggle off)
                  const exists = prev.find(l => l.item.symbol === it.symbol && l.side === 'BUY');
                  if (exists) {
                    showToast(`${it.name} BUY removed`, false);
                    return prev.filter(l => !(l.item.symbol === it.symbol && l.side === 'BUY'));
                  }
                  showToast(`${it.name} BUY added to basket ✓`, false);
                  return [...prev, { item: it, side: 'BUY', qty: 1, unit: 'qty' }];
                })}
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
          width: 'calc(100% - 24px)', maxWidth: '476px', background: '#FFFFFF',
          borderTop: '1px solid #E8ECF0', padding: '10px 16px',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.1)', zIndex: 44,
          boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '8px',
          borderRadius: '16px'
        }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#1A1E2B' }}>
            {basketLegs.length} in basket
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => { setBasketMode(false); setBasketLegs([]); }}
              style={{ flex: 1, background: '#F3F4F6', color: '#4B5563', border: 'none', padding: '11px 0', borderRadius: '30px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
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

      <div id="tradeSheetOverlay" className="trade-sheet-overlay" onClick={closeTradeSheet}></div>
      <div id="tradeSheet" className="trade-sheet">
        <div className="sheet-handle"><div className="handle-bar"></div></div>
        <div className="ts-header">
          <button className="ts-back-btn" id="sheetBackBtn" aria-label="Close" onClick={closeTradeSheet} suppressHydrationWarning>
            <i className="fas fa-chevron-down"></i>
          </button>
          <div className="ts-name-block">
            <div className="ts-instr-name" id="sheetScriptName">{selectedItem?.name || '---'}</div>
            <span className="ts-segment-badge" id="sheetSegment">{selectedItem?.segment || '---'}</span>
          </div>
          <div className="ts-price-block">
            <div className="ts-price-value" id="sheetCmpValue">{formatPrice(currentLtp)}</div>
            <span className={`ts-change-badge ${currentChangePercent < 0 ? 'negative' : ''}`} id="sheetChange">
              {currentLtp > 0 ? (currentChangePercent >= 0 ? '+' : '') + currentChangePercent.toFixed(2) + '%' : '0.00%'}
            </span>
          </div>
        </div>
        <div className="ts-bidask-row">
          <div className="ts-ba-cell">
            <span className="ts-ba-label">BID</span>
            <span className="ts-ba-val bid-val" id="sheetBid">{formatPrice(bidPrice)}</span>
          </div>
          <div className="ts-ba-divider"></div>
          <div className="ts-ba-cell">
            <span className="ts-ba-label">ASK</span>
            <span className="ts-ba-val ask-val" id="sheetAsk">{formatPrice(askPrice)}</span>
          </div>
        </div>
        <div className="sheet-content-scroll">
          <div className="ts-body">
            <div className="ts-section-card">
              <div className="ts-qty-lot-row">
                <span className="ts-section-label" style={{ marginBottom: 0 }}>Order Unit</span>
                <div className="ts-toggle-switch" id="qtyLotToggle">
                  <button
                    className={`ts-toggle-opt ${orderUnit === 'qty' ? 'active' : ''}`}
                    onClick={() => setOrderUnit('qty')}
                    suppressHydrationWarning
                  >QTY</button>
                  <button
                    className={`ts-toggle-opt ${orderUnit === 'lot' ? 'active' : ''}`}
                    onClick={() => setOrderUnit('lot')}
                    suppressHydrationWarning
                  >LOT</button>
                </div>
              </div>
            </div>
            <div className="ts-info-cards-wrap">
              <div className="ts-info-cards">
                <div className="ts-info-card"><div className="ts-ic-label">Lot Size</div><div className="ts-ic-val" id="icLotSize">1</div></div>
                <div className="ts-info-card"><div className="ts-ic-label">Max Lots</div><div className="ts-ic-val" id="icMaxLots">--</div></div>
                <div className="ts-info-card"><div className="ts-ic-label">Order Lots</div><div className="ts-ic-val" id="icOrderLots">{orderUnit === 'lot' ? orderQty : '--'}</div></div>
                <div className="ts-info-card"><div className="ts-ic-label">Total Qty</div><div className="ts-ic-val" id="icTotalQty">{orderUnit === 'lot' ? orderQty : orderQty}</div></div>
              </div>
            </div>
            <div className="ts-qty-container">
              <div className="ts-section-label">Quantity</div>
              <div className="ts-qty-stepper">
                <button className="ts-qty-btn" id="tsQtyMinus" aria-label="Decrease" onClick={() => setOrderQty(q => Math.max(1, q - 1))}><i className="fas fa-minus"></i></button>
                <div className="ts-qty-display" id="tradeQtyDisplay">{orderQty}</div>
                <input type="hidden" id="tradeQtyInput" value={orderQty} />
                <button className="ts-qty-btn" id="tsQtyPlus" aria-label="Increase" onClick={() => setOrderQty(q => q + 1)}><i className="fas fa-plus"></i></button>
              </div>
              <div className="ts-qty-hint" id="sheetLotHint">
                {orderUnit === 'lot' ? `${orderQty} Lots` : `${orderQty} Qty`}
              </div>
            </div>
            <div className="ts-section-card">
              <div className="ts-section-label">Order Type</div>
              <div className="ts-pill-group" id="orderTypeContainer">
                {(['MARKET', 'LIMIT', 'SLM', 'GTT'] as OrderType[]).map(type => (
                  <button
                    key={type}
                    className={`ts-pill ${orderType === type ? 'active' : ''}`}
                    onClick={() => setOrderType(type)}
                  >{type}</button>
                ))}
              </div>
            </div>
            <div className="ts-section-card" id="priceInputCard" style={{ display: orderType === 'LIMIT' ? 'block' : 'none' }}>
              <div className="ts-section-label">Price <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
              <input
                type="number"
                id="tradePriceInput"
                placeholder="0.00"
                className="price-input"
                style={{ width: '100%', boxSizing: 'border-box', borderRadius: '12px', padding: '12px 14px', fontSize: '1rem', fontWeight: 700 }}
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
              />
            </div>
            <div className="ts-section-card" id="triggerCard" style={{ display: orderType === 'SLM' ? 'block' : 'none' }}>
              <div className="ts-section-label">Trigger Price <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
              <input type="number" id="tradeTriggerInput" placeholder="0.00" className="price-input" style={{ width: '100%', boxSizing: 'border-box', borderRadius: '12px', padding: '12px 14px', fontSize: '1rem', fontWeight: 700 }} />
            </div>
            <div className="ts-section-card">
              <div className="ts-section-label">Product Type</div>
              <div className="ts-pill-group" id="productTypeContainer">
                <button
                  className={`ts-pill ${productType === 'INTRADAY' ? 'active' : ''}`}
                  onClick={() => setProductType('INTRADAY')}
                >INTRADAY</button>
                <button
                  className={`ts-pill ${productType === 'CARRY' ? 'active' : ''}`}
                  onClick={() => setProductType('CARRY')}
                >CARRY</button>
              </div>
            </div>
            <div className="ts-margin-card">
              <div className="ts-margin-row"><span className="ts-ml">Available</span><span className="ts-mv avail">{availableBalance !== null ? `₹ ${availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '--'}</span></div>
              <div className="ts-margin-row"><span className="ts-ml">Required Margin</span><span className="ts-mv required" id="calculatedMargin">₹ {calculatedRequiredMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
              <div className="ts-margin-row"><span className="ts-ml">Carry Charges</span><span className="ts-mv carry">₹ 0.00</span></div>
            </div>
            <div style={{ height: '8px' }}></div>
          </div>
        </div>
      </div>

      <div className="ts-sticky-footer" id="tsStickyFooter">
        <button
          className="ts-btn ts-btn-buy"
          id="sheetBuyBtn"
          disabled={placingOrder}
          onClick={() => handlePlaceOrder('BUY')}
        >
          {placingOrder ? 'PLACING...' : 'BUY'}
        </button>
        <button
          className="ts-btn ts-btn-sell"
          id="sheetSellBtn"
          disabled={placingOrder}
          onClick={() => handlePlaceOrder('SELL')}
        >
          {placingOrder ? 'PLACING...' : 'SELL'}
        </button>
      </div>

      <div id="detailSheetOverlay" className="trade-sheet-overlay" onClick={() => { const sheet = document.getElementById('detailSheet'); const overlay = document.getElementById('detailSheetOverlay'); if (sheet) sheet.classList.remove('open'); if (overlay) overlay.classList.remove('active'); }}></div>
      <div id="detailSheet" className="trade-sheet detail-sheet" style={{ height: 'auto', maxHeight: '72dvh', paddingBottom: '16px' }}>
        <div className="sheet-handle"><div className="handle-bar"></div></div>
        {selectedItem && (() => {
          const q = quotes[selectedItem.kiteSymbol];
          const ltp = q?.lastPrice ?? selectedItem.price;
          const bid = q?.bid ?? (ltp * 0.999);
          const ask = q?.ask ?? (ltp * 1.001);
          const chgPct = q ? q.changePercent : 0;
          const fmt = (v: number) => `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          return (
            <div style={{ padding: '0' }}>
              <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#E5E7EB', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '0', flexShrink: 0 }} onClick={() => { const sheet = document.getElementById('detailSheet'); const overlay = document.getElementById('detailSheetOverlay'); if (sheet) sheet.classList.remove('open'); if (overlay) overlay.classList.remove('active'); }}>
                    <i className="fas fa-chevron-left" style={{ fontSize: '0.65rem', color: '#4B5563' }}></i>
                  </button>
                  <div>
                    <div style={{ fontSize: '0.95rem', fontWeight: '800', color: '#1A1E2B', marginBottom: '2px', lineHeight: '1.15' }}>{selectedItem.name}</div>
                    <span style={{ fontSize: '0.51rem', fontWeight: '700', color: '#DC2626', background: '#FEF2F2', padding: '2px 6px', borderRadius: '20px', lineHeight: '1' }}>{selectedItem.segment}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.47rem', fontWeight: '600', color: '#8C94A8', textTransform: 'uppercase', marginBottom: '1px', lineHeight: '1' }}>CMP</div>
                  <div style={{ fontSize: '0.935rem', fontWeight: '800', color: '#1A1E2B', marginBottom: '2px', lineHeight: '1.1' }}>{fmt(ltp)}</div>
                  <span className="sheet-change" style={{ fontSize: '0.55rem', fontWeight: '700', padding: '2px 6px', lineHeight: '1', color: chgPct >= 0 ? '#059669' : '#DC2626' }}>{chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%</span>
                </div>
              </div>
              <div style={{ height: '1px', background: '#F0F2F8', margin: '0 0 8px', width: '100%' }}></div>
              <div style={{ padding: '0 12px 10px 12px' }}>
                <div style={{ background: '#F8FAFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '14px', padding: '8px 12px', display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: '600', color: '#8C94A8', marginBottom: '3px' }}>BID</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#059669' }}>{fmt(bid)}</div>
                  </div>
                  <div style={{ width: '1px', background: '#E2E8F0', height: '24px' }}></div>
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: '600', color: '#8C94A8', marginBottom: '3px' }}>ASK</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#DC2626' }}>{fmt(ask)}</div>
                  </div>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.62rem', fontWeight: '700', color: '#5B677E', marginBottom: '6px' }}>PRICE SUMMARY</div>
                  <div style={{ background: '#F8FAFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '14px', padding: '8px 10px', display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.52rem', fontWeight: '600', color: '#8C94A8', marginBottom: '3px' }}>OPEN</div><div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#059669' }}>{fmt(selectedItem.open)}</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.52rem', fontWeight: '600', color: '#8C94A8', marginBottom: '3px' }}>HIGH</div><div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#059669' }}>{fmt(selectedItem.high)}</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.52rem', fontWeight: '600', color: '#8C94A8', marginBottom: '3px' }}>LOW</div><div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#DC2626' }}>{fmt(selectedItem.low)}</div></div>
                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.52rem', fontWeight: '600', color: '#8C94A8', marginBottom: '3px' }}>CLOSE</div><div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#1A1E2B' }}>{fmt(selectedItem.close)}</div></div>
                  </div>
                </div>
                <div style={{ background: '#F8FAFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '14px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="far fa-calendar-alt"></i> CONTRACT DATE</div>
                  <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#1A1E2B', background: '#FFFFFF', padding: '3px 10px', borderRadius: '20px' }}>{selectedItem.contractDate}</div>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button style={{ flex: 1, background: '#15803D', color: 'white', border: 'none', padding: '11px 0', borderRadius: '30px', fontSize: '0.9rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }} onClick={() => openTradeSheet(selectedItem)}>
                    <i className="fas fa-arrow-up"></i> BUY
                  </button>
                  <button style={{ flex: 1, background: '#B91C1C', color: 'white', border: 'none', padding: '11px 0', borderRadius: '30px', fontSize: '0.9rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }} onClick={() => openTradeSheet(selectedItem)}>
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
              const q = quotes[leg.item.kiteSymbol];
              const ltp = q?.lastPrice ?? leg.item.price;
              const totalVal = ltp * leg.qty;
              return (
                <div key={i} style={{ background: '#F8FAFF', border: '1px solid #EEF2F8', borderRadius: '16px', padding: '14px' }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#1A1E2B' }}>{leg.item.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1A1E2B' }}>₹{totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <button onClick={() => setBasketLegs(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#C62E2E', cursor: 'pointer', fontSize: '0.9rem', padding: '0' }}>
                        <i className="fas fa-trash-alt"></i>
                      </button>
                    </div>
                  </div>
                  {/* Order unit row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: '700', color: '#8C94A8', letterSpacing: '0.5px' }}>ORDER UNIT</span>
                    <div style={{ display: 'flex', background: '#FFFFFF', border: '1px solid #E2E6EC', borderRadius: '20px', overflow: 'hidden' }}>
                      <button
                        onClick={() => setBasketLegs(prev => prev.map((l, j) => j === i ? { ...l, unit: 'qty' } : l))}
                        style={{ padding: '4px 12px', fontSize: '0.65rem', fontWeight: '700', border: 'none', cursor: 'pointer', background: leg.unit !== 'lot' ? '#1A1E2B' : 'transparent', color: leg.unit !== 'lot' ? '#fff' : '#6B7280' }}
                      >QTY</button>
                      <button
                        onClick={() => setBasketLegs(prev => prev.map((l, j) => j === i ? { ...l, unit: 'lot' } : l))}
                        style={{ padding: '4px 12px', fontSize: '0.65rem', fontWeight: '700', border: 'none', cursor: 'pointer', background: leg.unit === 'lot' ? '#1A1E2B' : 'transparent', color: leg.unit === 'lot' ? '#fff' : '#6B7280' }}
                      >LOT</button>
                    </div>
                  </div>
                  {/* B/S toggle + qty stepper */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ display: 'flex', borderRadius: '20px', overflow: 'hidden', border: '1px solid #E2E6EC' }}>
                      <button
                        onClick={() => setBasketLegs(prev => prev.map((l, j) => j === i ? { ...l, side: 'BUY' } : l))}
                        style={{ padding: '6px 14px', fontSize: '0.72rem', fontWeight: '800', border: 'none', cursor: 'pointer', background: leg.side === 'BUY' ? '#1a8a3a' : '#F3F4F6', color: leg.side === 'BUY' ? '#fff' : '#6B7280' }}
                      >B</button>
                      <button
                        onClick={() => setBasketLegs(prev => prev.map((l, j) => j === i ? { ...l, side: 'SELL' } : l))}
                        style={{ padding: '6px 14px', fontSize: '0.72rem', fontWeight: '800', border: 'none', cursor: 'pointer', background: leg.side === 'SELL' ? '#b91c1c' : '#F3F4F6', color: leg.side === 'SELL' ? '#fff' : '#6B7280' }}
                      >S</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#FFFFFF', border: '1px solid #E2E6EC', borderRadius: '20px', padding: '4px 14px' }}>
                      <button onClick={() => setBasketLegs(prev => prev.map((l, j) => j === i ? { ...l, qty: Math.max(1, l.qty - 1) } : l))} style={{ background: 'none', border: 'none', fontSize: '0.9rem', cursor: 'pointer', color: '#6B7280', padding: '0' }}>−</button>
                      <span style={{ fontSize: '0.85rem', fontWeight: '700', minWidth: '20px', textAlign: 'center' }}>{leg.qty}</span>
                      <button onClick={() => setBasketLegs(prev => prev.map((l, j) => j === i ? { ...l, qty: l.qty + 1 } : l))} style={{ background: 'none', border: 'none', fontSize: '0.9rem', cursor: 'pointer', color: '#6B7280', padding: '0' }}>+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="basket-margin-summary" style={{ border: '1px solid #EEF2F8', padding: '16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#8C94A8' }}>Total Items</span><span className="basket-val" style={{ fontSize: '0.85rem', fontWeight: '700' }}>{basketLegs.length}</span></div>
            <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#8C94A8' }}>Total Value</span><span className="basket-val" style={{ fontSize: '0.85rem', fontWeight: '700' }}>₹{basketLegs.reduce((acc, l) => acc + ((quotes[l.item.kiteSymbol]?.lastPrice ?? l.item.price) * l.qty), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
            <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#8C94A8' }}>Required Margin</span><span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#C62E2E' }}>₹{(basketLegs.reduce((acc, l) => acc + ((quotes[l.item.kiteSymbol]?.lastPrice ?? l.item.price) * l.qty), 0) * 0.2).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></div>
            <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #EEF2F8', paddingTop: '10px', marginTop: '2px' }}><span className="basket-val" style={{ fontSize: '0.8rem', fontWeight: '700' }}>Available Balance</span><span style={{ fontSize: '0.9rem', fontWeight: '800', color: '#2C8E5A', background: '#E9F6EF', padding: '4px 10px', borderRadius: '8px' }}>{availableBalance !== null ? `₹${availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '₹0.00'}</span></div>
          </div>
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button
              style={{ flex: 1, background: '#2C8E5A', color: 'white', border: 'none', padding: '17px 0', borderRadius: '50px', fontSize: '1rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '7px', boxShadow: '0 6px 14px rgba(44,142,90,0.3)', minWidth: 0 }}
              onClick={() => setShowBasketConfirm(true)}
            >
              <i className="fas fa-bolt" style={{ lineHeight: 1, fontSize: '1rem' }}></i> Execute Basket
            </button>
            <button
              style={{ flex: 1, background: '#EFEFEF', color: '#6B7280', border: 'none', padding: '17px 0', borderRadius: '50px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '7px', minWidth: 0 }}
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
              <div style={{ fontSize: '1.1rem', fontWeight: '800', color: '#1A1E2B', marginBottom: '8px' }}>Confirm Execution</div>
              <div style={{ fontSize: '0.8rem', color: '#6B7280', lineHeight: '1.5' }}>
                You are about to execute <strong>{basketLegs.length} order{basketLegs.length !== 1 ? 's' : ''}</strong> worth{' '}
                <strong>₹{basketLegs.reduce((acc, l) => acc + ((quotes[l.item.kiteSymbol]?.lastPrice ?? l.item.price) * l.qty), 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong>.
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
          <h3><i className="fas fa-folder"></i> Trading Segments</h3>
          <button className="close-drawer" onClick={() => setIsFolderDrawerOpen(false)} suppressHydrationWarning><i className="fas fa-times"></i></button>
        </div>
        <div className="folder-tree-scroll">
          {TRADING_SEGMENTS.map((seg) => {
            const count = (seg.instruments?.length ?? 0) + (seg.subCategories?.reduce((a, s) => a + s.instruments.length, 0) ?? 0);
            const isOpen = !!expandedSegments[seg.name];
            return (
              <div key={seg.name} className="tree-item-li">
                <div
                  className="tree-label-row"
                  onClick={() => setExpandedSegments(prev => ({ ...prev, [seg.name]: !prev[seg.name] }))}
                >
                  <i className="fas fa-chevron-right chevron-icon" style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}></i>
                  <i className={`fas ${seg.icon} folder-icon`}></i>
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
          })}
        </div>
        <div className="drawer-footer"><i className="fas fa-plus-circle"></i> Tap <span style={{ color: '#C62E2E' }}>+ Add</span> to watchlist | Browse all segments</div>
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

      <div id="multiSelectBar" className="multi-select-bar" style={{ display: 'none', position: 'fixed', bottom: '0', left: '0', right: '0', background: '#fff', zIndex: 1000, boxShadow: '0 -2px 10px rgba(0,0,0,0.1)' }}>
        <div className="multi-select-row" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F3F4F6' }}>
          <span id="selectedCount" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#111827' }}>0 in basket</span>
        </div>
        <div className="multi-select-row bottom-row" style={{ padding: '10px 16px' }}>
          <button id="exitSelectionBtn" style={{ width: '100%', background: '#F3F4F6', color: '#4B5563', border: 'none', padding: '10px', borderRadius: '12px', fontSize: '0.85rem', fontWeight: '700' }}>Exit Selection</button>
        </div>
      </div>

      <Footer activeTab="watchlist" />
    </div>
  );
}


function buildInlineScript(): string {
  return `
    (function() {
      var tradingSegments = [
        {
          name: 'INDEX - FUTURE',
          icon: 'fa-chart-line',
          instruments: [
            { name: 'NIFTY FUT', symbol: 'NIFTY_FUT', kiteSymbol: 'NSE:NIFTY 50', price: 22456.80, change: '+0.45%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 22350, high: 22580, low: 22320, close: 22456.80 },
            { name: 'SENSEX FUT', symbol: 'SENSEX_FUT', kiteSymbol: 'BSE:SENSEX', price: 74230.15, change: '+0.32%', segment: 'BSE - Futures', contractDate: '28 Mar 2025', open: 73950, high: 74500, low: 73800, close: 74230.15 },
            { name: 'BANKNIFTY FUT', symbol: 'BANKNIFTY_FUT', kiteSymbol: 'NSE:NIFTY BANK', price: 48210.50, change: '-0.21%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 48350, high: 48500, low: 48100, close: 48210.50 },
            { name: 'FINNIFTY FUT', symbol: 'FINNIFTY_FUT', kiteSymbol: 'NSE:NIFTY FIN SERVICE', price: 21234.90, change: '+0.67%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 21080, high: 21350, low: 21050, close: 21234.90 },
            { name: 'MIDCAP NIFTY FUT', symbol: 'MIDCP_FUT', kiteSymbol: 'NSE:NIFTY MIDCAP 50', price: 11820.45, change: '+0.88%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 11700, high: 11880, low: 11680, close: 11820.45 }
          ]
        },
        {
          name: 'INDEX - OPTIONS',
          icon: 'fa-chart-gantt',
          subCategories: [
            {
              name: 'NIFTY Options',
              instruments: [
                { name: 'NIFTY 22500 CE', symbol: 'NIFTY22500CE', kiteSymbol: '', price: 125.40, change: '+2.3%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 122, high: 128.50, low: 121, close: 125.40 },
                { name: 'NIFTY 22400 PE', symbol: 'NIFTY22400PE', kiteSymbol: '', price: 78.20, change: '-1.2%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 79.50, high: 80, low: 77.50, close: 78.20 }
              ]
            },
            {
              name: 'SENSEX Options',
              instruments: [
                { name: 'SENSEX 74500 CE', symbol: 'SENSEX745CE', kiteSymbol: '', price: 210.30, change: '+0.9%', segment: 'BSE - Options', contractDate: '28 Mar 2025', open: 208, high: 212.50, low: 207.50, close: 210.30 }
              ]
            },
            {
              name: 'BANKEX Options',
              instruments: [
                { name: 'BANKEX 52000 CE', symbol: 'BANKEX520CE', kiteSymbol: '', price: 310.75, change: '+1.1%', segment: 'BSE - Options', contractDate: '28 Mar 2025', open: 307, high: 314, low: 306.50, close: 310.75 }
              ]
            },
            {
              name: 'BANKNIFTY Options',
              instruments: [
                { name: 'BANKNIFTY 48500 CE', symbol: 'BN48500CE', kiteSymbol: '', price: 215.60, change: '-0.4%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 216.50, high: 218, low: 214, close: 215.60 },
                { name: 'BANKNIFTY 48000 PE', symbol: 'BN48000PE', kiteSymbol: '', price: 140.25, change: '+0.7%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 139, high: 142, low: 138.50, close: 140.25 }
              ]
            },
            {
              name: 'FINNIFTY Options',
              instruments: [
                { name: 'FINNIFTY 21500 CE', symbol: 'FIN21500CE', kiteSymbol: '', price: 92.50, change: '+1.5%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 91, high: 94, low: 90.50, close: 92.50 }
              ]
            },
            {
              name: 'MID CAP NIFTY Options',
              instruments: [
                { name: 'MIDCPNIFTY 11800 CE', symbol: 'MIDCP118CE', kiteSymbol: '', price: 65.30, change: '+2.1%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 63.80, high: 66.50, low: 63.50, close: 65.30 }
              ]
            }
          ]
        },
        {
          name: 'STOCKS - FUTURE',
          icon: 'fa-building',
          instruments: [
            { name: 'RELIANCE FUT', symbol: 'RELIANCE_FUT', kiteSymbol: 'NSE:RELIANCE', price: 2856.40, change: '+0.75%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 2835, high: 2870, low: 2830, close: 2856.40 },
            { name: 'TCS FUT', symbol: 'TCS_FUT', kiteSymbol: 'NSE:TCS', price: 3987.20, change: '-0.33%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 4000, high: 4015, low: 3975, close: 3987.20 },
            { name: 'HDFCBANK FUT', symbol: 'HDFCBANK_FUT', kiteSymbol: 'NSE:HDFCBANK', price: 1680.90, change: '+0.22%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 1675, high: 1688, low: 1672, close: 1680.90 }
          ]
        },
        {
          name: 'MCX - FUTURE',
          icon: 'fa-coins',
          instruments: [
            { name: 'GOLD FUT', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26JUNFUT', price: 72450, change: '+0.28%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 72150, high: 72450, low: 72100, close: 72450 },
            { name: 'SILVER FUT', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULYFUT', price: 82230, change: '-0.15%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 82350, high: 82450, low: 82100, close: 82230 },
            { name: 'CRUDEOIL FUT', symbol: 'CRUDEOIL_FUT', kiteSymbol: 'MCX:CRUDEOIL26MAYFUT', price: 6120.50, change: '+1.2%', segment: 'MCX - Futures', contractDate: 'May 2026', open: 6045, high: 6140, low: 6040, close: 6120.50 }
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
            { name: 'USD/INR', symbol: 'USDINR_FUT', kiteSymbol: 'CDS:USDINR26MAYFUT', price: 83.45, change: '+0.05%', segment: 'CDS - Futures', contractDate: 'May 2026', open: 83.40, high: 83.50, low: 83.35, close: 83.45 },
            { name: 'EUR/INR', symbol: 'EURINR_FUT', kiteSymbol: 'CDS:EURINR26MAYFUT', price: 90.12, change: '-0.02%', segment: 'CDS - Futures', contractDate: 'May 2026', open:90.15, high: 90.25, low: 90.05, close: 90.12 }
          ]
        },
        {
          name: 'COMEX',
          icon: 'fa-gem',
          instruments: [
            { name: 'Gold', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26JUNFUT', comexSymbol: 'GC=F', price: 72450, change: '+0.28%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 72150, high: 72450, low: 72100, close: 72450 },
            { name: 'Silver', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULYFUT', comexSymbol: 'SI=F', price: 82230, change: '-0.15%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 82350, high: 82450, low: 82100, close: 82230 }
          ]
        }
      ];

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
        if (isCrypto) return '$' + numPrice.toFixed(2);
        return '₹' + numPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]; });
      }

      function addToWatchlist(item) {
        if (typeof window.__addToWatchlistCallback === 'function') {
          window.__addToWatchlistCallback(item);
          if (window.showToast) window.showToast('Added to watchlist', false);
        }
      }

      function removeFromWatchlist(symbol) {
        if (typeof window.__removeFromWatchlistCallback === 'function') {
          window.__removeFromWatchlistCallback(symbol);
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
          html += '<div class="folder-header"><i class="fas ' + seg.icon + '"></i> ' + escapeHtml(seg.name) + '</div>';
          if (seg.instruments) {
            seg.instruments.forEach(function(inst) {
              html += '<div class="script-item"><span>' + escapeHtml(inst.name) + '</span><button class="add-script-btn" onclick=\\'addToWatchlist(' + JSON.stringify(inst).replace(/"/g, '&quot;') + ')\\'>+ Add</button></div>';
            });
          }
          if (seg.subCategories) {
            seg.subCategories.forEach(function(sub) {
              html += '<div class="subfolder-item"><div class="subfolder-header">' + escapeHtml(sub.name) + '</div>';
              sub.instruments.forEach(function(inst) {
                html += '<div class="script-item"><span>' + escapeHtml(inst.name) + '</span><button class="add-script-btn" onclick=\\'addToWatchlist(' + JSON.stringify(inst).replace(/"/g, '&quot;') + ')\\'>+ Add</button></div>';
              });
              html += '</div>';
            });
          }
          html += '</div>';
        });
        folderTreeMobile.innerHTML = html;
      }

      if (searchInput) {
        searchInput.addEventListener('input', function() {
          var query = this.value.trim().toLowerCase();
          if (query.length === 0) {
            searchResultsArea.style.display = 'none';
            clearSearchBtn.style.display = 'none';
            return;
          }
          clearSearchBtn.style.display = 'block';
          var results = allScriptsDB.filter(function(s) { return s.name.toLowerCase().indexOf(query) >= 0 || s.symbol.toLowerCase().indexOf(query) >= 0; });
          searchResultCount.textContent = results.length + ' results';
          var html = '';
          results.slice(0, 50).forEach(function(item) {
            var isCrypto = item.segment && item.segment.indexOf('Crypto') >= 0;
            html += '<div class="search-result-item"><div class="sri-left"><div class="sri-name">' + escapeHtml(item.name) + '</div><div class="sri-segment">' + escapeHtml(item.segment) + '</div></div><div class="sri-right"><div class="sri-price">' + formatPrice(item.price, isCrypto) + '</div><button class="add-script-btn" onclick=\\'addToWatchlist(' + JSON.stringify(item).replace(/"/g, '&quot;') + ')\\'>+</button></div></div>';
          });
          searchResultsList.innerHTML = html;
          searchResultsArea.style.display = 'block';
        });
      }

      if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', function() {
          searchInput.value = '';
          searchResultsArea.style.display = 'none';
          this.style.display = 'none';
        });
      }

      var openFolderBtn = document.getElementById('openFolderMobileBtn');
      if (openFolderBtn) {
        openFolderBtn.addEventListener('click', function() {
          folderDrawer.classList.add('open');
          overlay.classList.add('active');
          renderFolderTree();
        });
      }

      var closeFolderBtn = document.getElementById('closeFolderDrawerBtn');
      if (closeFolderBtn) {
        closeFolderBtn.addEventListener('click', function() {
          folderDrawer.classList.remove('open');
          overlay.classList.remove('active');
        });
      }

      if (overlay) {
        overlay.addEventListener('click', function() {
          folderDrawer.classList.remove('open');
          this.classList.remove('active');
        });
      }

      var exitSelectionBtn = document.getElementById('exitSelectionBtn');
      if (exitSelectionBtn) {
        exitSelectionBtn.addEventListener('click', function() {
          exitSelectionMode();
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
        if (multiSelectBar) multiSelectBar.style.display = 'block';
        document.querySelectorAll('.wc-checkbox-wrapper').forEach(function(el) {
          el.style.display = 'flex';
        });
      }

      function exitSelectionMode() {
        selectionMode = false;
        if (multiSelectBar) multiSelectBar.style.display = 'none';
        document.querySelectorAll('.wc-checkbox-wrapper').forEach(function(el) {
          el.style.display = 'none';
        });
        document.querySelectorAll('.wc-checkbox').forEach(function(cb) {
          cb.checked = false;
        });
      }

      function updateSelectionUI() {
        var checked = document.querySelectorAll('.wc-checkbox:checked').length;
        if (selectedCountSpan) selectedCountSpan.textContent = checked + ' in basket';
      }

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
  return (
    <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading watchlist...</div>}>
      <WatchlistContent />
    </Suspense>
  );
}


