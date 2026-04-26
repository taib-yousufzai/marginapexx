'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Footer from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import { useKiteQuotes, QuoteData } from '@/hooks/useKiteQuotes';
import './page.css';

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

declare global {
  interface Window {
    __kiteQuotes: Record<string, QuoteData>;
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
  try { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items)); } catch {}
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
    }
  ];
}

// ── Tab Labels ──────────────────────────────────────────────────────────────

export type TabLabel =
  | 'WATCHLIST'
  | 'INDEX-FUT' | 'INDEX-OPT'
  | 'STOCK-FUT' | 'STOCK-OPT'
  | 'MCX-FUT'   | 'MCX-OPT'
  | 'NSF-EQ'    | 'CRYPTO'
  | 'FOREX'     | 'COI';

export const TAB_LABELS: TabLabel[] = [
  'WATCHLIST',
  'INDEX-FUT', 'INDEX-OPT',
  'STOCK-FUT', 'STOCK-OPT',
  'MCX-FUT',   'MCX-OPT',
  'NSF-EQ',    'CRYPTO',
  'FOREX',     'COI',
];

// ── Segment → Tab Mapping ────────────────────────────────────────────────────

export const SEGMENT_TAB_MAP: Record<string, TabLabel> = {
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
}

function InstrumentRow({ item, quote }: InstrumentRowProps) {
  const ltp = quote?.lastPrice ?? item.price;
  const absoluteChange = ltp - item.close;
  const percentChange = item.close !== 0 ? ((ltp - item.close) / item.close) * 100 : 0;

  const handleLeftClick = () => {
    if (typeof window !== 'undefined' && (window as any).openDetailSheet) {
      (window as any).openDetailSheet(item.symbol);
    }
  };

  const handleRightClick = () => {
    if (typeof window !== 'undefined' && (window as any).openTradeSheet) {
      (window as any).openTradeSheet(item.symbol);
    }
  };

  return (
    <div className="instr-row">
      <div className="instr-row__left" onClick={handleLeftClick} style={{ cursor: 'pointer' }}>
        <div className="instr-row__name-line">
          <span className="instr-row__name">{item.name}</span>
          <span className="exchange-badge">{getExchangeBadge(item.segment)}</span>
        </div>
        {item.contractDate && (
          <div className="instr-row__date">{item.contractDate}</div>
        )}
      </div>
      <div className="instr-row__right" onClick={handleRightClick} style={{ cursor: 'pointer' }}>
        <div className="instr-row__ltp">LTP: {ltp.toFixed(2)}</div>
        <div className="instr-row__abs-change">{absoluteChange.toFixed(2)}</div>
        <div className={`instr-row__pct-change ${getPctClass(percentChange)}`}>
          {percentChange.toFixed(2)}%
        </div>
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

// ── WatchlistPage Component ──────────────────────────────────────────────────

export default function WatchlistPage() {
  const router = useRouter();
  useAuth();
  const [watchlistItems, setWatchlistItems] = useState<WatchlistItem[]>([]);
  const [activeTab, setActiveTab] = useState<TabLabel>('WATCHLIST');
  const [searchText, setSearchText] = useState<string>('');
  const filteredItems = filterBySearch(filterByTab(watchlistItems, activeTab), searchText);
  const scriptMountedRef = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem('marginApexTheme');
    if (saved === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem(WATCHLIST_KEY);

      // Key doesn't exist = first time user → populate defaults
      if (raw === null) {
        const defaults = getDefaultWatchlistItems();
        setWatchlistItems(defaults);
        saveWatchlistToStorage(defaults);
      } else {
        // Key exists (even if empty array) = user has interacted with watchlist
        const loaded = loadWatchlistFromStorage();
        setWatchlistItems(loaded);
      }
  }, []);

  const kiteSymbols = watchlistItems.map(i => i.kiteSymbol).filter(Boolean);
  const { quotes } = useKiteQuotes(kiteSymbols, 5000);

  useEffect(() => {
    window.__kiteQuotes = quotes;
    window.__watchlistItems = watchlistItems;
    if (scriptMountedRef.current && typeof window.__renderWatchlist === 'function') {
      window.__renderWatchlist();
    }
  }, [quotes, watchlistItems]);

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
  }, []);

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
    <div className="mobile-app">
      <div className="app-header">
        <div className="header-top">
          <div className="logo-area">
            <div className="logo-text">Watchlist</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <div className="folder-btn" id="openFolderMobileBtn">
              <i className="fas fa-folder"></i>
              <span>Library</span>
              <i className="fas fa-chevron-right"></i>
            </div>
          </div>
        </div>
        <SegmentTabBar activeTab={activeTab} onTabChange={(tab) => { setActiveTab(tab); setSearchText(''); }} />
        <div className="search-wrapper">
          <i className="fas fa-search search-icon"></i>
          <input type="text" className="search-input" id="globalSearchInput" placeholder="Search instrument" autoComplete="off" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
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
              <div className="watchlist-count" id="mobileWatchlistCounter">0 items</div>
            </div>
            <div className="action-hint">Swipe | Hold to select | Tap to trade</div>
          </div>
          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span className="add-hint"><i className="fas fa-plus-circle"></i> Add scripts to watchlist from Scripts Library</span>
            <div className="folder-btn basket-btn" id="basketModeBtn" style={{ cursor: 'pointer', background: '#E9F6EF', color: '#006400', border: '1px solid #C3E6D4', padding: '6px 14px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '30px', fontWeight: '700', whiteSpace: 'nowrap', flexShrink: 0 }}>
              <i className="fas fa-shopping-basket" style={{ color: '#006400' }}></i>
              <span>Basket</span>
            </div>
          </div>
          <div className="watchlist-cards-container">
            {filteredItems.length === 0 ? <EmptyState /> : filteredItems.map(item => <InstrumentRow key={item.symbol} item={item} quote={quotes[item.kiteSymbol]} />)}
            <div id="watchlistMobileContainer"></div>
          </div>
        </div>
      </div>

      <div id="tradeSheetOverlay" className="trade-sheet-overlay"></div>
      <div id="tradeSheet" className="trade-sheet">
        <div className="sheet-handle"><div className="handle-bar"></div></div>
        <div className="ts-header">
          <button className="ts-back-btn" id="sheetBackBtn" aria-label="Close">
            <i className="fas fa-chevron-down"></i>
          </button>
          <div className="ts-name-block">
            <div className="ts-instr-name" id="sheetScriptName">NIFTY FUT</div>
            <span className="ts-segment-badge" id="sheetSegment">NSE · Futures</span>
          </div>
          <div className="ts-price-block">
            <div className="ts-price-value" id="sheetCmpValue">₹22,456.80</div>
            <span className="ts-change-badge negative" id="sheetChange">+0.45%</span>
          </div>
        </div>
        <div className="ts-bidask-row">
          <div className="ts-ba-cell">
            <span className="ts-ba-label">BID</span>
            <span className="ts-ba-val bid-val" id="sheetBid">₹22,434.20</span>
          </div>
          <div className="ts-ba-divider"></div>
          <div className="ts-ba-cell">
            <span className="ts-ba-label">ASK</span>
            <span className="ts-ba-val ask-val" id="sheetAsk">₹22,479.40</span>
          </div>
        </div>
        <div className="sheet-content-scroll">
          <div className="ts-body">
            <div className="ts-section-card">
              <div className="ts-qty-lot-row">
                <span className="ts-section-label" style={{ marginBottom: 0 }}>Order Unit</span>
                <div className="ts-toggle-switch" id="qtyLotToggle">
                  <button className="ts-toggle-opt active" data-unit="qty">QTY</button>
                  <button className="ts-toggle-opt" data-unit="lot">LOT</button>
                </div>
              </div>
            </div>
            <div className="ts-info-cards-wrap">
              <div className="ts-info-cards">
                <div className="ts-info-card"><div className="ts-ic-label">Lot Size</div><div className="ts-ic-val" id="icLotSize">25</div></div>
                <div className="ts-info-card"><div className="ts-ic-label">Max Lots</div><div className="ts-ic-val" id="icMaxLots">500</div></div>
                <div className="ts-info-card"><div className="ts-ic-label">Order Lots</div><div className="ts-ic-val" id="icOrderLots">1</div></div>
                <div className="ts-info-card"><div className="ts-ic-label">Total Qty</div><div className="ts-ic-val" id="icTotalQty">25</div></div>
              </div>
            </div>
            <div className="ts-qty-container">
              <div className="ts-section-label">Quantity</div>
              <div className="ts-qty-stepper">
                <button className="ts-qty-btn" id="tsQtyMinus" aria-label="Decrease"><i className="fas fa-minus"></i></button>
                <div className="ts-qty-display" id="tradeQtyDisplay">25</div>
                <input type="hidden" id="tradeQtyInput" defaultValue="25" />
                <button className="ts-qty-btn" id="tsQtyPlus" aria-label="Increase"><i className="fas fa-plus"></i></button>
              </div>
              <div className="ts-qty-hint" id="sheetLotHint">1 Lot × 25 = 25 Qty</div>
            </div>
            <div className="ts-section-card">
              <div className="ts-section-label">Order Type</div>
              <div className="ts-pill-group" id="orderTypeContainer">
                <button className="ts-pill active" data-type="market">MARKET</button>
                <button className="ts-pill" data-type="limit">LIMIT</button>
                <button className="ts-pill" data-type="slm">SL-M</button>
                <button className="ts-pill" data-type="gtt">GTT</button>
              </div>
            </div>
            <div className="ts-section-card" id="priceInputCard" style={{ display: 'none' }}>
              <div className="ts-section-label">Price <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
              <input type="number" id="tradePriceInput" placeholder="0.00" className="price-input" style={{ width: '100%', boxSizing: 'border-box', borderRadius: '12px', padding: '12px 14px', fontSize: '1rem', fontWeight: 700 }} />
            </div>
            <div className="ts-section-card" id="triggerCard" style={{ display: 'none' }}>
              <div className="ts-section-label">Trigger Price <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
              <input type="number" id="tradeTriggerInput" placeholder="0.00" className="price-input" style={{ width: '100%', boxSizing: 'border-box', borderRadius: '12px', padding: '12px 14px', fontSize: '1rem', fontWeight: 700 }} />
            </div>
            <div className="ts-section-card">
              <div className="ts-section-label">Product Type</div>
              <div className="ts-pill-group" id="productTypeContainer">
                <button className="ts-pill active" data-type="mis">INTRADAY</button>
                <button className="ts-pill" data-type="nrml">CARRY</button>
              </div>
            </div>
            <div className="ts-margin-card">
              <div className="ts-margin-row"><span className="ts-ml">Available</span><span className="ts-mv avail">₹ 4,50,000.00</span></div>
              <div className="ts-margin-row"><span className="ts-ml">Required Margin</span><span className="ts-mv required" id="calculatedMargin">₹ 0.00</span></div>
              <div className="ts-margin-row"><span className="ts-ml">Carry Charges</span><span className="ts-mv carry">₹ 0.00</span></div>
            </div>
            <div style={{ height: '8px' }}></div>
          </div>
        </div>
      </div>

      <div className="ts-sticky-footer" id="tsStickyFooter">
        <button className="ts-btn ts-btn-buy" id="sheetBuyBtn">BUY</button>
        <button className="ts-btn ts-btn-sell" id="sheetSellBtn">SELL</button>
      </div>

      <div id="detailSheetOverlay" className="trade-sheet-overlay"></div>
      <div id="detailSheet" className="trade-sheet detail-sheet" style={{ height: 'auto', maxHeight: '72dvh', paddingBottom: '16px' }}>
        <div className="sheet-handle"><div className="handle-bar"></div></div>
        <div style={{ padding: '0' }}>
          <div style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button style={{ width: '26px', height: '26px', borderRadius: '50%', background: '#E5E7EB', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: '0', flexShrink: 0 }} onClick={() => { const sheet = document.getElementById('detailSheet'); const overlay = document.getElementById('detailSheetOverlay'); if (sheet) sheet.classList.remove('open'); if (overlay) overlay.classList.remove('active'); }}>
                <i className="fas fa-chevron-left" style={{ fontSize: '0.65rem', color: '#4B5563' }}></i>
              </button>
              <div>
                <div id="detailScriptName" style={{ fontSize: '0.95rem', fontWeight: '800', color: '#1A1E2B', marginBottom: '2px', lineHeight: '1.15' }}>BANKNIFTY 48500 CE</div>
                <span id="detailSegment" style={{ fontSize: '0.51rem', fontWeight: '700', color: '#DC2626', background: '#FEF2F2', padding: '2px 6px', borderRadius: '20px', lineHeight: '1' }}>NSE - Options</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.47rem', fontWeight: '600', color: '#8C94A8', textTransform: 'uppercase', marginBottom: '1px', lineHeight: '1' }}>CMP</div>
              <div id="detailCmpValue" style={{ fontSize: '0.935rem', fontWeight: '800', color: '#1A1E2B', marginBottom: '2px', lineHeight: '1.1' }}>₹215.60</div>
              <span id="detailChange" className="sheet-change" style={{ fontSize: '0.55rem', fontWeight: '700', padding: '2px 6px', lineHeight: '1' }}>-0.4%</span>
            </div>
          </div>
          <div style={{ height: '1px', background: '#F0F2F8', margin: '0 0 8px', width: '100%' }}></div>
          <div style={{ padding: '0 12px 10px 12px' }}>
            <div id="detailBidAskCard" style={{ background: '#F8FAFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '14px', padding: '8px 12px', display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '0.58rem', fontWeight: '600', color: '#8C94A8', marginBottom: '3px' }}>BID</div>
                <div id="detailBid" style={{ fontSize: '0.9rem', fontWeight: '700', color: '#059669' }}>₹215.38</div>
              </div>
              <div id="detailBidAskDivider" style={{ width: '1px', background: '#E2E8F0', height: '24px' }}></div>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: '0.58rem', fontWeight: '600', color: '#8C94A8', marginBottom: '3px' }}>ASK</div>
                <div id="detailAsk" style={{ fontSize: '0.9rem', fontWeight: '700', color: '#DC2626' }}>₹215.82</div>
              </div>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: '700', color: '#5B677E', marginBottom: '6px' }}>PRICE SUMMARY</div>
              <div id="detailOhlcCard" style={{ background: '#F8FAFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '14px', padding: '8px 10px', display: 'flex', justifyContent: 'space-between' }}>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.52rem', fontWeight: '600', color: '#8C94A8', marginBottom: '3px' }}>OPEN</div><div id="detailOpen" style={{ fontSize: '0.72rem', fontWeight: '700', color: '#059669' }}>₹216.50</div></div>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.52rem', fontWeight: '600', color: '#8C94A8', marginBottom: '3px' }}>HIGH</div><div id="detailHigh" style={{ fontSize: '0.72rem', fontWeight: '700', color: '#059669' }}>₹218.00</div></div>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.52rem', fontWeight: '600', color: '#8C94A8', marginBottom: '3px' }}>LOW</div><div id="detailLow" style={{ fontSize: '0.72rem', fontWeight: '700', color: '#DC2626' }}>₹214.00</div></div>
                <div style={{ textAlign: 'center' }}><div style={{ fontSize: '0.52rem', fontWeight: '600', color: '#8C94A8', marginBottom: '3px' }}>CLOSE</div><div id="detailClose" style={{ fontSize: '0.72rem', fontWeight: '700', color: '#1A1E2B' }}>₹215.60</div></div>
              </div>
            </div>
            <div id="detailContractCard" style={{ background: '#F8FAFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '14px', padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="far fa-calendar-alt"></i> CONTRACT DATE</div>
              <div id="detailContractDate" style={{ fontSize: '0.72rem', fontWeight: '700', color: '#1A1E2B', background: '#FFFFFF', padding: '3px 10px', borderRadius: '20px' }}>28 Mar 2025</div>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button id="detailBuyBtn" style={{ flex: 1, background: '#15803D', color: 'white', border: 'none', padding: '11px 0', borderRadius: '30px', fontSize: '0.9rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}><i className="fas fa-arrow-up"></i> BUY</button>
              <button id="detailSellBtn" style={{ flex: 1, background: '#B91C1C', color: 'white', border: 'none', padding: '11px 0', borderRadius: '30px', fontSize: '0.9rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px' }}><i className="fas fa-arrow-down"></i> SELL</button>
            </div>
          </div>
        </div>
      </div>

      <div id="basketSheetOverlay" className="trade-sheet-overlay"></div>
      <div id="basketSheet" className="trade-sheet detail-sheet" style={{ height: 'auto', maxHeight: '90dvh', paddingBottom: '30px' }}>
        <div className="sheet-handle"><div className="handle-bar"></div></div>
        <div style={{ padding: '24px 20px 20px 20px' }}>
          <div className="basket-sheet-title" style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '16px' }}><i className="fas fa-shopping-basket"></i> Basket Orders</div>
          <div id="basketLegsContainer" style={{ maxHeight: '40dvh', overflowY: 'auto', marginBottom: '20px' }}></div>
          <div className="basket-margin-summary" style={{ border: '1px solid #EEF2F8', padding: '16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#8C94A8' }}>Total Items</span><span id="basketTotalItems" className="basket-val" style={{ fontSize: '0.85rem', fontWeight: '700' }}>0</span></div>
            <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#8C94A8' }}>Total Value</span><span id="basketTotalValue" className="basket-val" style={{ fontSize: '0.85rem', fontWeight: '700' }}>₹0.00</span></div>
            <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#8C94A8' }}>Required Margin</span><span id="basketReqMargin" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#C62E2E' }}>₹0.00</span></div>
            <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #EEF2F8', paddingTop: '10px', marginTop: '2px' }}><span className="basket-val" style={{ fontSize: '0.8rem', fontWeight: '700' }}>Available Balance</span><span id="basketAvailBalance" style={{ fontSize: '0.9rem', fontWeight: '800', color: '#2C8E5A', background: '#E9F6EF', padding: '4px 10px', borderRadius: '8px' }}>₹4,50,000.00</span></div>
          </div>
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button id="basketExecuteBtn" style={{ flex: 1, background: '#2C8E5A', color: 'white', border: 'none', padding: '17px 0', borderRadius: '50px', fontSize: '1rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '7px', boxShadow: '0 6px 14px rgba(44,142,90,0.3)', minWidth: 0 }}><i className="fas fa-bolt" style={{ lineHeight: 1, fontSize: '1rem' }}></i> Execute Basket</button>
            <button id="basketClearBtn" style={{ flex: 1, background: '#EFEFEF', color: '#6B7280', border: 'none', padding: '17px 0', borderRadius: '50px', fontSize: '1rem', fontWeight: '600', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '7px', minWidth: 0 }}><i className="fas fa-trash-alt" style={{ opacity: 0.5 }}></i> Clear</button>
          </div>
        </div>
      </div>

      <div id="drawerOverlay" className="drawer-overlay"></div>
      <div id="scriptsFolderDrawer" className="folder-drawer">
        <div className="drawer-header">
          <h3><i className="fas fa-folder"></i> Trading Segments</h3>
          <button className="close-drawer" id="closeFolderDrawerBtn"><i className="fas fa-times"></i></button>
        </div>
        <div className="folder-tree-scroll" id="folderTreeMobile"></div>
        <div className="drawer-footer"><i className="fas fa-plus-circle"></i> Tap <span style={{ color: '#C62E2E' }}>+ Add</span> to watchlist | Browse all segments</div>
      </div>

      <div id="toastMessageMobile" className="mobile-toast" style={{ opacity: 0, visibility: 'hidden' }}></div>

      <div id="multiSelectBar" style={{ display: 'none', position: 'absolute', bottom: '70px', left: '16px', right: '16px', zIndex: 100 }}>
        <div className="multi-select-bar" style={{ background: '#FFF', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid #E8ECF0' }}>
          <div className="multi-select-row top-row" style={{ padding: '8px 16px', borderBottom: '1px solid #E8ECF0' }}>
            <span className="selected-count" id="selectedCount" style={{ marginLeft: 0, background: '#E9F6EF', color: '#006400', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '800' }}>0 in basket</span>
          </div>
          <div className="multi-select-row bottom-row" style={{ padding: '10px 16px', background: '#F8FAFF' }}>
            <div className="delete-actions" style={{ display: 'flex', gap: '12px', width: '100%' }}>
              <button className="exit-selection-btn" id="exitSelectionBtn" style={{ flex: 1, background: '#F0F2F5', color: '#5B677E', border: 'none', borderRadius: '30px', padding: '10px', fontWeight: '600', cursor: 'pointer' }}><i className="fas fa-times"></i> Cancel</button>
              <button className="basket-create-btn disabled" id="createBasketBtn" style={{ background: '#2C8E5A', color: '#fff', border: 'none', borderRadius: '30px', padding: '10px 18px', fontSize: '0.9rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px', flex: 2, justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 10px rgba(44,142,90,0.2)' }}><i className="fas fa-shopping-basket"></i> View Basket</button>
            </div>
          </div>
        </div>
      </div>

      <Footer activeTab="watchlist" />
    </div>
  );
}

function buildInlineScript(): string {
  return `
var tradingSegments=[{name:'INDEX - FUTURE',icon:'fa-chart-line',instruments:[{name:'NIFTY FUT',symbol:'NIFTY_FUT',kiteSymbol:'NSE:NIFTY 50',price:22456.80,change:'+0.45%',segment:'NSE - Futures',contractDate:'28 Mar 2025',open:22350,high:22580,low:22320,close:22456.80},{name:'SENSEX FUT',symbol:'SENSEX_FUT',kiteSymbol:'BSE:SENSEX',price:74230.15,change:'+0.32%',segment:'BSE - Futures',contractDate:'28 Mar 2025',open:73950,high:74500,low:73800,close:74230.15},{name:'BANKNIFTY FUT',symbol:'BANKNIFTY_FUT',kiteSymbol:'NSE:NIFTY BANK',price:48210.50,change:'-0.21%',segment:'NSE - Futures',contractDate:'28 Mar 2025',open:48350,high:48500,low:48100,close:48210.50},{name:'FINNIFTY FUT',symbol:'FINNIFTY_FUT',kiteSymbol:'NSE:NIFTY FIN SERVICE',price:21234.90,change:'+0.67%',segment:'NSE - Futures',contractDate:'28 Mar 2025',open:21080,high:21350,low:21050,close:21234.90},{name:'MIDCAP NIFTY FUT',symbol:'MIDCP_FUT',kiteSymbol:'NSE:NIFTY MIDCAP 50',price:11820.45,change:'+0.88%',segment:'NSE - Futures',contractDate:'28 Mar 2025',open:11700,high:11880,low:11680,close:11820.45}]},{name:'INDEX - OPTIONS',icon:'fa-chart-gantt',subCategories:[{name:'NIFTY Options',instruments:[{name:'NIFTY 22500 CE',symbol:'NIFTY22500CE',kiteSymbol:'',price:125.40,change:'+2.3%',segment:'NSE - Options',contractDate:'28 Mar 2025',open:122,high:128.50,low:121,close:125.40},{name:'NIFTY 22400 PE',symbol:'NIFTY22400PE',kiteSymbol:'',price:78.20,change:'-1.2%',segment:'NSE - Options',contractDate:'28 Mar 2025',open:79.50,high:80,low:77.50,close:78.20}]},{name:'SENSEX Options',instruments:[{name:'SENSEX 74500 CE',symbol:'SENSEX745CE',kiteSymbol:'',price:210.30,change:'+0.9%',segment:'BSE - Options',contractDate:'28 Mar 2025',open:208,high:212.50,low:207.50,close:210.30}]},{name:'BANKEX Options',instruments:[{name:'BANKEX 52000 CE',symbol:'BANKEX520CE',kiteSymbol:'',price:310.75,change:'+1.1%',segment:'BSE - Options',contractDate:'28 Mar 2025',open:307,high:314,low:306.50,close:310.75}]},{name:'BANKNIFTY Options',instruments:[{name:'BANKNIFTY 48500 CE',symbol:'BN48500CE',kiteSymbol:'',price:215.60,change:'-0.4%',segment:'NSE - Options',contractDate:'28 Mar 2025',open:216.50,high:218,low:214,close:215.60},{name:'BANKNIFTY 48000 PE',symbol:'BN48000PE',kiteSymbol:'',price:140.25,change:'+0.7%',segment:'NSE - Options',contractDate:'28 Mar 2025',open:139,high:142,low:138.50,close:140.25}]},{name:'FINNIFTY Options',instruments:[{name:'FINNIFTY 21500 CE',symbol:'FIN21500CE',kiteSymbol:'',price:92.50,change:'+1.5%',segment:'NSE - Options',contractDate:'28 Mar 2025',open:91,high:94,low:90.50,close:92.50}]},{name:'MID CAP NIFTY Options',instruments:[{name:'MIDCPNIFTY 11800 CE',symbol:'MIDCP118CE',kiteSymbol:'',price:65.30,change:'+2.1%',segment:'NSE - Options',contractDate:'28 Mar 2025',open:63.80,high:66.50,low:63.50,close:65.30}]}]},{name:'STOCKS - FUTURE',icon:'fa-building',instruments:[{name:'RELIANCE FUT',symbol:'RELIANCE_FUT',kiteSymbol:'NSE:RELIANCE',price:2856.40,change:'+0.75%',segment:'NSE - Futures',contractDate:'28 Mar 2025',open:2835,high:2870,low:2830,close:2856.40},{name:'TCS FUT',symbol:'TCS_FUT',kiteSymbol:'NSE:TCS',price:3987.20,change:'-0.33%',segment:'NSE - Futures',contractDate:'28 Mar 2025',open:4000,high:4015,low:3975,close:3987.20},{name:'HDFCBANK FUT',symbol:'HDFCBANK_FUT',kiteSymbol:'NSE:HDFCBANK',price:1680.90,change:'+0.22%',segment:'NSE - Futures',contractDate:'28 Mar 2025',open:1675,high:1688,low:1672,close:1680.90}]},{name:'STOCKS - OPTIONS',icon:'fa-chart-simple',instruments:[{name:'RELIANCE 2900 CE',symbol:'RELI2900CE',kiteSymbol:'',price:34.70,change:'+5.2%',segment:'NSE - Options',contractDate:'28 Mar 2025',open:33,high:36,low:32.80,close:34.70},{name:'TCS 4000 CE',symbol:'TCS4000CE',kiteSymbol:'',price:48.90,change:'-1.1%',segment:'NSE - Options',contractDate:'28 Mar 2025',open:49.50,high:50,low:48.50,close:48.90}]},{name:'MCX - FUTURE',icon:'fa-coins',instruments:[{name:'GOLD FUT',symbol:'GOLD_FUT',kiteSymbol:'MCX:GOLD25APRFUT',price:62340,change:'+0.28%',segment:'MCX - Futures',contractDate:'30 Apr 2025',open:62150,high:62450,low:62100,close:62340},{name:'SILVER FUT',symbol:'SILVER_FUT',kiteSymbol:'MCX:SILVER25MAYFUT',price:75230,change:'-0.15%',segment:'MCX - Futures',contractDate:'30 Apr 2025',open:75350,high:75450,low:75100,close:75230},{name:'CRUDEOIL FUT',symbol:'CRUDEOIL_FUT',kiteSymbol:'MCX:CRUDEOIL25APRFUT',price:6120.50,change:'+1.2%',segment:'MCX - Futures',contractDate:'30 Apr 2025',open:6045,high:6140,low:6040,close:6120.50}]},{name:'MCX - OPTIONS',icon:'fa-chart-line',instruments:[{name:'GOLD 62500 CE',symbol:'GOLD62500CE',kiteSymbol:'',price:820,change:'+0.9%',segment:'MCX - Options',contractDate:'30 Apr 2025',open:812,high:828,low:810,close:820}]},{name:'NSE - EQ',icon:'fa-chart-simple',instruments:[{name:'RELIANCE EQ',symbol:'RELIANCE',kiteSymbol:'NSE:RELIANCE',price:2845.30,change:'+0.68%',segment:'NSE - Equity',contractDate:'Cash Segment',open:2825,high:2858,low:2820,close:2845.30},{name:'HDFC BANK EQ',symbol:'HDFCBANK',kiteSymbol:'NSE:HDFCBANK',price:1672.85,change:'-0.12%',segment:'NSE - Equity',contractDate:'Cash Segment',open:1675,high:1680,low:1670,close:1672.85},{name:'INFY EQ',symbol:'INFY',kiteSymbol:'NSE:INFY',price:1598.40,change:'+1.03%',segment:'NSE - Equity',contractDate:'Cash Segment',open:1580,high:1605,low:1578,close:1598.40},{name:'TCS EQ',symbol:'TCS',kiteSymbol:'NSE:TCS',price:3982.50,change:'-0.22%',segment:'NSE - Equity',contractDate:'Cash Segment',open:3990,high:3995,low:3975,close:3982.50}]},{name:'CRYPTO',icon:'fa-bitcoin',instruments:[{name:'BTC/USDT',symbol:'BTCUSDT',kiteSymbol:'',price:68450.20,change:'+2.1%',segment:'Crypto - Futures',contractDate:'Perpetual',open:67000,high:69000,low:66800,close:68450.20},{name:'ETH/USDT',symbol:'ETHUSDT',kiteSymbol:'',price:3420.80,change:'+1.4%',segment:'Crypto - Futures',contractDate:'Perpetual',open:3370,high:3450,low:3360,close:3420.80},{name:'SOL/USDT',symbol:'SOLUSDT',kiteSymbol:'',price:182.30,change:'-0.7%',segment:'Crypto - Futures',contractDate:'Perpetual',open:183.50,high:184,low:181,close:182.30}]},{name:'FOREX',icon:'fa-globe',instruments:[{name:'EUR/USD',symbol:'EURUSD',kiteSymbol:'',price:1.0852,change:'+0.05%',segment:'Forex',contractDate:'Spot',open:1.0845,high:1.0860,low:1.0840,close:1.0852},{name:'GBP/USD',symbol:'GBPUSD',kiteSymbol:'',price:1.2734,change:'-0.02%',segment:'Forex',contractDate:'Spot',open:1.2738,high:1.2745,low:1.2725,close:1.2734},{name:'USD/JPY',symbol:'USDJPY',kiteSymbol:'',price:150.82,change:'+0.12%',segment:'Forex',contractDate:'Spot',open:150.60,high:151,low:150.50,close:150.82}]},{name:'COMEX',icon:'fa-gem',instruments:[{name:'Gold COMEX',symbol:'GC_F',kiteSymbol:'',price:2356.80,change:'+0.34%',segment:'COMEX - Futures',contractDate:'28 Apr 2025',open:2348,high:2362,low:2345,close:2356.80},{name:'Silver COMEX',symbol:'SI_F',kiteSymbol:'',price:28.45,change:'-0.22%',segment:'COMEX - Futures',contractDate:'28 Apr 2025',open:28.52,high:28.60,low:28.40,close:28.45},{name:'Copper',symbol:'HG_F',kiteSymbol:'',price:4.52,change:'+0.65%',segment:'COMEX - Futures',contractDate:'28 Apr 2025',open:4.49,high:4.55,low:4.48,close:4.52}]}];function getAllScripts(){var scripts=[];function traverse(node){if(node.instruments)node.instruments.forEach(function(inst){scripts.push(Object.assign({},inst,{category:node.name}));});if(node.subCategories)node.subCategories.forEach(function(sub){if(sub.instruments)sub.instruments.forEach(function(inst){scripts.push(Object.assign({},inst,{category:node.name+' > '+sub.name}));});});}tradingSegments.forEach(function(seg){traverse(seg);});return scripts;}var allScriptsDB=getAllScripts();var watchlistItems=(window.__watchlistItems&&window.__watchlistItems.length>0)?window.__watchlistItems.slice():[];var basketLegs=[];var selectionMode=false;var currentTradeScript=null;var longPressTimer=null;var toastTimeout=null;var watchlistContainer=document.getElementById('watchlistMobileContainer');var watchlistCounter=document.getElementById('mobileWatchlistCounter');var multiSelectBar=document.getElementById('multiSelectBar');var selectedCountSpan=document.getElementById('selectedCount');var searchInput=document.getElementById('globalSearchInput');var clearSearchBtn=document.getElementById('clearSearchBtn');var searchResultsArea=document.getElementById('searchResultsArea');var searchResultsList=document.getElementById('searchResultsList');var searchResultCount=document.getElementById('searchResultCount');var tradeSheet=document.getElementById('tradeSheet');var tradeSheetOverlay=document.getElementById('tradeSheetOverlay');var detailSheet=document.getElementById('detailSheet');var detailSheetOverlay=document.getElementById('detailSheetOverlay');var folderDrawer=document.getElementById('scriptsFolderDrawer');var overlay=document.getElementById('drawerOverlay');var toastEl=document.getElementById('toastMessageMobile');function showToast(msg,isError){if(toastTimeout)clearTimeout(toastTimeout);toastEl.textContent=msg;toastEl.style.background=isError?'#C62E2E':'#2C8E5A';toastEl.style.opacity='1';toastEl.style.visibility='visible';toastTimeout=setTimeout(function(){toastEl.style.opacity='0';toastEl.style.visibility='hidden';},2000);}function formatPrice(price,isCrypto){var numPrice=typeof price==='number'?price:parseFloat(price);if(isCrypto)return'$'+numPrice.toFixed(2);return'₹'+numPrice.toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});}function getLiveData(item){if(item.kiteSymbol&&window.__kiteQuotes&&window.__kiteQuotes[item.kiteSymbol]){var q=window.__kiteQuotes[item.kiteSymbol];return{price:q.lastPrice,change:(q.changePercent>=0?'+':'')+q.changePercent.toFixed(2)+'%',open:q.open,high:q.high,low:q.low,close:q.close};}return{price:item.price,change:item.change,open:item.open,high:item.high,low:item.low,close:item.close};}function generateBidAsk(price){var spread=price*0.001;return{bid:price-spread,ask:price+spread};}function escapeHtml(str){if(!str)return'';return str.replace(/[&<>]/g,function(m){return{'&':'&amp;','<':'&lt;','>':'&gt;'}[m];});}function addToWatchlist(item){if(typeof window.__addToWatchlistCallback==='function'){window.__addToWatchlistCallback(item);showToast('Added to watchlist',false);}else{if(watchlistItems.some(function(i){return i.symbol===item.symbol;}))return;watchlistItems.push(item);renderWatchlist();showToast('Added to watchlist',false);}}function removeFromWatchlist(symbol){if(typeof window.__removeFromWatchlistCallback==='function'){window.__removeFromWatchlistCallback(symbol);}else{watchlistItems=watchlistItems.filter(function(i){return i.symbol!==symbol;});renderWatchlist();}}function renderWatchlist(){if(!watchlistContainer)return;watchlistCounter.textContent=watchlistItems.length+' items';if(watchlistItems.length===0){watchlistContainer.innerHTML='<div style="text-align:center;padding:40px 20px;color:#9CA3AF;"><i class="fas fa-chart-line" style="font-size:3rem;margin-bottom:12px;opacity:0.3;"></i><div style="font-size:0.9rem;font-weight:600;">Your watchlist is empty</div><div style="font-size:0.75rem;margin-top:6px;">Add scripts from the library to start tracking</div></div>';return;}var html='';watchlistItems.forEach(function(item){var liveData=getLiveData(item);var isNegative=liveData.change.indexOf('-')===0;var isCrypto=item.segment&&item.segment.indexOf('Crypto')>=0;var priceStr=formatPrice(liveData.price,isCrypto);var changeClass=isNegative?'negative':'positive';html+='<div class="watchlist-card" data-symbol="'+escapeHtml(item.symbol)+'">';html+='<div class="wc-swipe-actions"><button class="wc-action-btn delete-btn" onclick="removeFromWatchlist(\\''+escapeHtml(item.symbol)+'\\')"><i class="fas fa-trash-alt"></i></button></div>';html+='<div class="wc-content">';html+='<div class="wc-left" onclick="openDetailSheet(\\''+escapeHtml(item.symbol)+'\\')">';html+='<div class="wc-name">'+escapeHtml(item.name)+'</div>';html+='<div class="wc-segment">'+escapeHtml(item.segment)+'</div>';html+='</div>';html+='<div class="wc-right" onclick="openTradeSheet(\\''+escapeHtml(item.symbol)+'\\')">';html+='<div class="wc-price">'+priceStr+'</div>';html+='<div class="wc-change '+changeClass+'">'+escapeHtml(liveData.change)+'</div>';html+='</div>';html+='<div class="wc-checkbox-wrapper" style="display:none;"><input type="checkbox" class="wc-checkbox"></div>';html+='</div>';html+='</div>';});watchlistContainer.innerHTML=html;attachSwipeHandlers();}function attachSwipeHandlers(){var cards=document.querySelectorAll('.watchlist-card');cards.forEach(function(card){var startX=0,currentX=0,isDragging=false;card.addEventListener('touchstart',function(e){startX=e.touches[0].clientX;currentX=startX;isDragging=true;longPressTimer=setTimeout(function(){if(!selectionMode){enterSelectionMode();card.querySelector('.wc-checkbox').checked=true;updateSelectionUI();}},500);});card.addEventListener('touchmove',function(e){if(!isDragging)return;clearTimeout(longPressTimer);currentX=e.touches[0].clientX;var diff=currentX-startX;if(diff<-50){card.style.transform='translateX(-80px)';}else if(diff>0){card.style.transform='translateX(0)';}});card.addEventListener('touchend',function(){clearTimeout(longPressTimer);isDragging=false;});});}function enterSelectionMode(){selectionMode=true;multiSelectBar.style.display='block';document.querySelectorAll('.wc-checkbox-wrapper').forEach(function(el){el.style.display='flex';});}function exitSelectionMode(){selectionMode=false;multiSelectBar.style.display='none';document.querySelectorAll('.wc-checkbox-wrapper').forEach(function(el){el.style.display='none';});document.querySelectorAll('.wc-checkbox').forEach(function(cb){cb.checked=false;});}function updateSelectionUI(){var checked=document.querySelectorAll('.wc-checkbox:checked').length;selectedCountSpan.textContent=checked+' in basket';}function openTradeSheet(symbol){var item=(window.__watchlistItems||watchlistItems).find(function(i){return i.symbol===symbol;});if(!item)return;currentTradeScript=item;var liveData=getLiveData(item);var bidAsk=generateBidAsk(liveData.price);var isCrypto=item.segment&&item.segment.indexOf('Crypto')>=0;document.getElementById('sheetScriptName').textContent=item.name;document.getElementById('sheetSegment').textContent=item.segment;document.getElementById('sheetCmpValue').textContent=formatPrice(liveData.price,isCrypto);document.getElementById('sheetChange').textContent=liveData.change;document.getElementById('sheetBid').textContent=formatPrice(bidAsk.bid,isCrypto);document.getElementById('sheetAsk').textContent=formatPrice(bidAsk.ask,isCrypto);tradeSheet.classList.add('open');tradeSheetOverlay.classList.add('active');}function openDetailSheet(symbol){var item=(window.__watchlistItems||watchlistItems).find(function(i){return i.symbol===symbol;});if(!item)return;var liveData=getLiveData(item);var bidAsk=generateBidAsk(liveData.price);var isCrypto=item.segment&&item.segment.indexOf('Crypto')>=0;document.getElementById('detailScriptName').textContent=item.name;document.getElementById('detailSegment').textContent=item.segment;document.getElementById('detailCmpValue').textContent=formatPrice(liveData.price,isCrypto);document.getElementById('detailChange').textContent=liveData.change;document.getElementById('detailBid').textContent=formatPrice(bidAsk.bid,isCrypto);document.getElementById('detailAsk').textContent=formatPrice(bidAsk.ask,isCrypto);document.getElementById('detailOpen').textContent=formatPrice(liveData.open,isCrypto);document.getElementById('detailHigh').textContent=formatPrice(liveData.high,isCrypto);document.getElementById('detailLow').textContent=formatPrice(liveData.low,isCrypto);document.getElementById('detailClose').textContent=formatPrice(liveData.close,isCrypto);document.getElementById('detailContractDate').textContent=item.contractDate;detailSheet.classList.add('open');detailSheetOverlay.classList.add('active');}function renderFolderTree(){var folderTreeMobile=document.getElementById('folderTreeMobile');if(!folderTreeMobile)return;var html='';tradingSegments.forEach(function(seg){html+='<div class="folder-item">';html+='<div class="folder-header"><i class="fas '+seg.icon+'"></i> '+escapeHtml(seg.name)+'</div>';if(seg.instruments){seg.instruments.forEach(function(inst){html+='<div class="script-item"><span>'+escapeHtml(inst.name)+'</span><button class="add-script-btn" onclick="addToWatchlist('+JSON.stringify(inst).replace(/"/g,'&quot;')+')"><i class="fas fa-plus"></i> Add</button></div>';});}if(seg.subCategories){seg.subCategories.forEach(function(sub){html+='<div class="subfolder-item"><div class="subfolder-header">'+escapeHtml(sub.name)+'</div>';sub.instruments.forEach(function(inst){html+='<div class="script-item"><span>'+escapeHtml(inst.name)+'</span><button class="add-script-btn" onclick="addToWatchlist('+JSON.stringify(inst).replace(/"/g,'&quot;')+')"><i class="fas fa-plus"></i> Add</button></div>';});html+='</div>';});}html+='</div>';});folderTreeMobile.innerHTML=html;}searchInput.addEventListener('input',function(){var query=this.value.trim().toLowerCase();if(query.length===0){searchResultsArea.style.display='none';clearSearchBtn.style.display='none';return;}clearSearchBtn.style.display='block';var results=allScriptsDB.filter(function(s){return s.name.toLowerCase().indexOf(query)>=0||s.symbol.toLowerCase().indexOf(query)>=0;});searchResultCount.textContent=results.length+' results';var html='';results.slice(0,50).forEach(function(item){var isCrypto=item.segment&&item.segment.indexOf('Crypto')>=0;html+='<div class="search-result-item"><div class="sri-left"><div class="sri-name">'+escapeHtml(item.name)+'</div><div class="sri-segment">'+escapeHtml(item.segment)+'</div></div><div class="sri-right"><div class="sri-price">'+formatPrice(item.price,isCrypto)+'</div><button class="add-script-btn" onclick="addToWatchlist('+JSON.stringify(item).replace(/"/g,'&quot;')+')"><i class="fas fa-plus"></i></button></div></div>';});searchResultsList.innerHTML=html;searchResultsArea.style.display='block';});clearSearchBtn.addEventListener('click',function(){searchInput.value='';searchResultsArea.style.display='none';this.style.display='none';});document.getElementById('openFolderMobileBtn').addEventListener('click',function(){folderDrawer.classList.add('open');overlay.classList.add('active');renderFolderTree();});document.getElementById('closeFolderDrawerBtn').addEventListener('click',function(){folderDrawer.classList.remove('open');overlay.classList.remove('active');});overlay.addEventListener('click',function(){folderDrawer.classList.remove('open');this.classList.remove('active');});document.getElementById('sheetBackBtn').addEventListener('click',function(){tradeSheet.classList.remove('open');tradeSheetOverlay.classList.remove('active');});tradeSheetOverlay.addEventListener('click',function(){tradeSheet.classList.remove('open');this.classList.remove('active');});detailSheetOverlay.addEventListener('click',function(){detailSheet.classList.remove('open');this.classList.remove('active');});document.getElementById('exitSelectionBtn').addEventListener('click',exitSelectionMode);document.getElementById('basketModeBtn').addEventListener('click',function(){document.getElementById('basketSheet').classList.add('open');document.getElementById('basketSheetOverlay').classList.add('active');});document.getElementById('basketSheetOverlay').addEventListener('click',function(){document.getElementById('basketSheet').classList.remove('open');this.classList.remove('active');});window.__renderWatchlist=renderWatchlist;window.openTradeSheet=openTradeSheet;window.openDetailSheet=openDetailSheet;window.addToWatchlist=addToWatchlist;window.removeFromWatchlist=removeFromWatchlist;renderWatchlist();
  `;
}
