'use client';

import { useState, useEffect, useRef, Suspense } from 'react';

import { useRouter, useSearchParams } from 'next/navigation';

import Footer from '@/components/Footer';

import Sidebar from '@/components/Sidebar';

import InstrumentRow from './InstrumentRow';

import TradingSegmentsDrawer from '@/components/TradingSegmentsDrawer';

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

    addToWatchlist: (name: string, symbol: string, segment: string) => void;

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

  'STOCK-FUT', 'STOCK-OPT',

  'MCX-FUT', 'MCX-OPT',

  'NSF-EQ', 'CRYPTO',

  'FOREX', 'COI',

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

    <div className="seg-tab-bar" suppressHydrationWarning>

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

    }, 3500);

  };

  useEffect(() => {

    (window as any).showToast = showToast;

  }, [showToast]);

  // Trade Sheet State

  const [selectedItem, setSelectedItem] = useState<WatchlistItem | null>(null);

  const [orderQty, setOrderQty] = useState<number>(25);

  const [binanceQuotes, setBinanceQuotes] = useState<Record<string, any>>({});

  const [comexQuotes, setComexQuotes] = useState<Record<string, any>>({});

  const [isSegmentsOpen, setIsSegmentsOpen] = useState(false);

  const [orderType, setOrderType] = useState<OrderType>('MARKET');

  const [productType, setProductType] = useState<ProductType>('INTRADAY');

  const [orderUnit, setOrderUnit] = useState<'qty' | 'lot'>('qty');

  const [limitPrice, setLimitPrice] = useState<string>('');

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

  const { quotes: fetchedBinance } = useBinanceQuotes(binanceSymbols, 5000);

  useEffect(() => { setBinanceQuotes(fetchedBinance); }, [fetchedBinance]);

  const comexSymbols = watchlistItems

    .map(i => i.comexSymbol)

    .filter((s): s is string => !!s);

  const { quotes: fetchedComex } = useComexQuotes(comexSymbols, 30_000);

  useEffect(() => { setComexQuotes(fetchedComex); }, [fetchedComex]);

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

    window.addToWatchlist = (name: string, symbol: string, segment: string) => {

      const newItem: WatchlistItem = {

        name, symbol, kiteSymbol: '', price: 0, change: '0%', segment, contractDate: '', open: 0, high: 0, low: 0, close: 0

      };

      window.__addToWatchlistCallback(newItem);

    };

    window.__removeFromWatchlistCallback = (symbol: string) => {

      setWatchlistItems(prev => {

        const next = prev.filter(i => i.symbol !== symbol);

        saveWatchlistToStorage(next);

        return next;

      });

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

  const handlePlaceOrder = async (side: OrderSide) => {

    if (!selectedItem) return;

    const result = await placeOrder({

      symbol: selectedItem.symbol,

      kite_instrument: selectedItem.kiteSymbol || selectedItem.symbol,

      segment: selectedItem.segment,

      side,

      order_type: orderType,

      product_type: productType,

      qty: orderQty,

      lots: orderUnit === 'lot' ? orderQty : 0,

      client_price: orderType === 'LIMIT' ? parseFloat(limitPrice) : currentLtp

    });

    if (result.success) {

      closeTradeSheet();

      showToast(`✅ Order Executed: ${side} ${orderQty} ${selectedItem.name} @ ₹${result.order?.fill_price?.toLocaleString('en-IN') ?? '---'}`, false);

    } else {

      showToast(`❌ Order Failed: ${result.error}`, true);

    }

  };

  const currentQuote = selectedItem ? quotes[selectedItem.kiteSymbol] : null;

  const currentLtp = currentQuote?.lastPrice ?? selectedItem?.price ?? 0;

  const isCrypto = selectedItem?.segment?.includes('Crypto') ?? false;

  const formatPrice = (price: number) => {

    if (isCrypto) return `$${price.toFixed(2)}`;

    return `₹${price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  };

  return (

    <div className="desktop-layout">

      <Sidebar />

      

      <main className="main-viewport">

        <div className="app-container">

          {/* Mobile Header */}

          <div className="nav-bar-full mobile-only">

            <div className="nav-icon-btn"><i className="fas fa-bell"></i></div>

            <div className="nav-app-name">Watch<span style={{ color: '#006400' }}>list</span></div>

            <div className="nav-group">

              <div className="library-btn" onClick={() => setIsSegmentsOpen(true)} style={{ cursor: 'pointer', background: 'rgba(198,46,46,0.1)', color: '#C62E2E', border: '1px solid rgba(198,46,46,0.2)', padding: '5px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700 }}>

                <i className="fas fa-folder"></i>

                <span>Library</span>

              </div>

              <div className="nav-funds" onClick={() => router.push('/funds')}><i className="fas fa-coins"></i><span>Funds</span></div>

              <div className="nav-icon-btn" onClick={() => router.push('/profile')}><i className="fas fa-user-cog"></i></div>

            </div>

          </div>

          {/* Desktop Header */}
          <div className="app-header desktop-only">
            <div className="header-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px 8px' }}>
              <div className="logo-area">
                <div className="logo-text" style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>Watchlist</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <div className="folder-btn" onClick={() => setIsSegmentsOpen(true)} style={{ background: 'var(--card-alt-bg)', border: '1px solid var(--border-light)', padding: '8px 16px', borderRadius: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  <i className="fas fa-folder" style={{ color: '#C62E2E' }}></i>
                  <span>Library</span>
                </div>
              </div>
            </div>
          </div>

          <SegmentTabBar activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setSearchText(''); }} />

          <div className="search-wrapper">

            <i className="fas fa-search search-icon"></i>

            <input type="text" className="search-input" id="globalSearchInput" placeholder="Search instrument" autoComplete="off" value={searchText} onChange={(e) => setSearchText(e.target.value)} suppressHydrationWarning />

            <i className="fas fa-trash clear-search" id="clearSearchBtn" onClick={() => setSearchText('')}></i>

          </div>

          {/* Main Content */}
          <div className="main-content">
            <div className="watchlist-section">
              <div className="watchlist-header">
                <div className="watchlist-title-section">
                  <div className="watchlist-title"><i className="fas fa-chart-line"></i> MY WATCHLIST</div>
                  <div className="watchlist-count">{filteredItems.length} items</div>
                </div>
                <div className="action-hint">Swipe | Hold to select | Tap to trade</div>
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
                  />
                ))}
              </div>
            </div>

            <Footer activeTab="watchlist" />
          </div>

        </div>

      </main>

      {/* Overlays and Sheets (Common) */}

      <div id="tradeSheetOverlay" className="trade-sheet-overlay" onClick={closeTradeSheet}></div>

      <div id="tradeSheet" className="trade-sheet">

        <div className="sheet-handle"><div className="handle-bar"></div></div>

        {selectedItem && (

          <div className="ts-content" style={{ padding: '0 20px 20px' }}>

            <div className="ts-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>

              <div>

                <div className="ts-symbol" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{selectedItem.name}</div>

                <div className="ts-exchange" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{selectedItem.segment}</div>

              </div>

              <div style={{ textAlign: 'right' }}>

                <div className="ts-ltp" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{formatPrice(currentLtp)}</div>

                <div className={`ts-chg ${quotes[selectedItem.kiteSymbol]?.changePercent < 0 ? 'neg' : 'pos'}`} style={{ fontSize: '0.8rem', fontWeight: 700 }}>

                  {quotes[selectedItem.kiteSymbol]?.changePercent > 0 ? '+' : ''}{quotes[selectedItem.kiteSymbol]?.changePercent?.toFixed(2)}%

                </div>

              </div>

            </div>

            <div className="ts-order-options" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

              <div className="ts-row">

                <div className="ts-label">Quantity</div>

                <div className="ts-qty-selector" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

                  <button className="qty-btn" onClick={() => setOrderQty(q => Math.max(1, q - 1))}>-</button>

                  <input type="number" className="qty-input" value={orderQty} onChange={e => setOrderQty(parseInt(e.target.value) || 1)} style={{ width: '60px', textAlign: 'center', border: '1px solid var(--border-light)', borderRadius: '8px', padding: '4px' }} />

                  <button className="qty-btn" onClick={() => setOrderQty(q => q + 1)}>+</button>

                </div>

              </div>

              <div className="ts-row">

                <div className="ts-label">Order Type</div>

                <div className="pill-group" style={{ display: 'flex', gap: '8px' }}>

                  {['MARKET', 'LIMIT', 'SL', 'SLM'].map(t => (

                    <button key={t} className={`pill-btn ${orderType === t ? 'active' : ''}`} onClick={() => setOrderType(t as OrderType)} style={{ flex: 1, padding: '6px', borderRadius: '8px', border: '1px solid var(--border-light)', background: orderType === t ? 'var(--text-primary)' : 'transparent', color: orderType === t ? 'var(--container-bg)' : 'var(--text-primary)', fontSize: '0.75rem', fontWeight: 700 }}>{t}</button>

                  ))}

                </div>

              </div>

              {orderType === 'LIMIT' && (

                <div className="ts-row">

                  <div className="ts-label">Price</div>

                  <input type="number" className="price-input" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} placeholder={currentLtp.toString()} style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-light)' }} />

                </div>

              )}

              <div className="ts-row">

                <div className="ts-label">Product</div>

                <div className="pill-group" style={{ display: 'flex', gap: '8px' }}>

                  {['INTRADAY', 'CARRY'].map(p => (

                    <button key={p} className={`pill-btn ${productType === p ? 'active' : ''}`} onClick={() => setProductType(p as ProductType)} style={{ flex: 1, padding: '6px', borderRadius: '8px', border: '1px solid var(--border-light)', background: productType === p ? 'var(--text-primary)' : 'transparent', color: productType === p ? 'var(--container-bg)' : 'var(--text-primary)', fontSize: '0.75rem', fontWeight: 700 }}>{p}</button>

                  ))}

                </div>

              </div>

            </div>

            <div className="ts-footer" style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>

              <button className="ts-btn ts-btn-buy" onClick={() => handlePlaceOrder('BUY')} disabled={placingOrder} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#2C8E5A', color: 'white', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}>{placingOrder ? '...' : 'BUY'}</button>

              <button className="ts-btn ts-btn-sell" onClick={() => handlePlaceOrder('SELL')} disabled={placingOrder} style={{ flex: 1, padding: '14px', borderRadius: '12px', border: 'none', background: '#C62E2E', color: 'white', fontWeight: 800, fontSize: '1rem', cursor: 'pointer' }}>{placingOrder ? '...' : 'SELL'}</button>

            </div>

          </div>

        )}

      </div>

      <div

        className={`pos-toast${toast.visible ? ' show' : ''}`}

        style={{

          position: 'fixed',

          bottom: '100px',

          left: '50%',

          transform: 'translateX(-50%)',

          background: toast.isError ? '#C62E2E' : '#2C8E5A',

          color: '#fff',

          padding: '12px 24px',

          borderRadius: '40px',

          fontWeight: '600',

          zIndex: 9999,

          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',

          opacity: toast.visible ? 1 : 0,

          visibility: toast.visible ? 'visible' : 'hidden',

          transition: 'all 0.3s ease'

        }}

      >

        {toast.msg}

      </div>

      <TradingSegmentsDrawer 

        isOpen={isSegmentsOpen} 

        onClose={() => setIsSegmentsOpen(false)}

        onSelect={(item) => {

          setWatchlistItems(prev => {

            if (prev.some(i => i.symbol === item.symbol)) return prev;

            const next = [...prev, item as WatchlistItem];

            saveWatchlistToStorage(next);

            return next;

          });

          setIsSegmentsOpen(false);

          showToast(`Added ${item.name} to Watchlist`, false);

        }}

      />

    </div>

  );

}

function buildInlineScript(): string {

  return `

    (function() {

      console.log('Watchlist initialized');

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

