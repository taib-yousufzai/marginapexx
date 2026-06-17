'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import { getSession } from '@/lib/auth';
import { useMarketQuotes, QuoteData } from '@/hooks/useMarketQuotes';
import { supabase } from '@/lib/supabaseClient';
import './page.css';

// Dynamically import TradingChart to prevent SSR issues (depends on window/lightweight-charts)
const TradingChart = dynamic(() => import('@/components/TradingChart'), { ssr: false });

interface WatchlistItem {
  name: string;
  symbol: string;
  kiteSymbol: string;
  binanceSymbol?: string;
  price: number;
  change: string;
  segment: string;
}

interface ScannerResult {
  symbol: string;
  name: string;
  exchange: string;
  segment: string;
  instrument_type: string;
  last_price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  gap: number;
  gapPercent: number;
  updated_at: string;
}

interface Trade {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  entry_price: number;
  exit_price: number | null;
  pnl: number;
  status: string;
  entry_time: string;
  exit_time: string | null;
}

interface Execution {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  price: number;
  execution_time: string;
  commission: number;
}

interface StrategyRun {
  id: string;
  strategy_name: string;
  signal_type: string;
  symbol: string;
  payload: any;
  status: string;
  error_message: string | null;
  created_at: string;
}

const DEFAULT_WATCHLIST: WatchlistItem[] = [
  { name: 'NIFTY 50 INDEX', symbol: 'NIFTY_INDEX', kiteSymbol: 'NSE:NIFTY 50', price: 0, change: '0%', segment: 'NSE - Futures' },
  { name: 'BANKNIFTY INDEX', symbol: 'BANKNIFTY_INDEX', kiteSymbol: 'NSE:NIFTY BANK', price: 0, change: '0%', segment: 'NSE - Futures' },
  { name: 'USD/INR', symbol: 'USDINR_FUT', kiteSymbol: 'CDS:USDINR26JUNFUT', price: 0, change: '0%', segment: 'CDS - Futures' },
  { name: 'Gold', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26JUNFUT', price: 0, change: '0%', segment: 'MCX - Futures' },
  { name: 'Bitcoin', symbol: 'BTC', kiteSymbol: '', binanceSymbol: 'BTCUSDT', price: 0, change: '0%', segment: 'Crypto' },
  { name: 'Ethereum', symbol: 'ETH', kiteSymbol: '', binanceSymbol: 'ETHUSDT', price: 0, change: '0%', segment: 'Crypto' }
];

const WATCHLIST_KEY_PREFIX = 'marginApex_watchlist';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // Background auth check/redirect helper
  useAuth();

  useEffect(() => {
    getSession().then((session) => {
      if (session) {
        setUser(session.user);
      }
      setAuthLoading(false);
    });
  }, []);

  // Selected asset state
  const [activeSymbol, setActiveSymbol] = useState<string>('NSE:NIFTY 50');
  const [activeSegment, setActiveSegment] = useState<string>('INDEX-FUT');

  // Left sidebar navigation tab state
  const [activeLeftTab, setActiveLeftTab] = useState<'watchlist' | 'scanner'>('watchlist');
  const [mobileTab, setMobileTab] = useState<'watchlist' | 'chart' | 'scanner' | 'logs'>('watchlist');

  // Watchlist states
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Scanner filter states
  const [scanSegment, setScanSegment] = useState<string>('NSE');
  const [scanMomentum, setScanMomentum] = useState<string>('top_gainers');
  const [minPriceFilter, setMinPriceFilter] = useState<string>('');
  const [maxPriceFilter, setMaxPriceFilter] = useState<string>('');
  const [minVolFilter, setMinVolFilter] = useState<string>('');
  const [scannerResults, setScannerResults] = useState<ScannerResult[]>([]);
  const [scanningLoading, setScanningLoading] = useState(false);

  // Trade Log tabs states
  const [tradeLogTab, setTradeLogTab] = useState<'trades' | 'executions' | 'strategyRuns' | 'webhookToken'>('trades');
  const [tradesList, setTradesList] = useState<Trade[]>([]);
  const [executionsList, setExecutionsList] = useState<Execution[]>([]);
  const [strategyRunsList, setStrategyRunsList] = useState<StrategyRun[]>([]);
  const [webhookToken, setWebhookToken] = useState<string>('');
  const [profileLoading, setProfileLoading] = useState(false);

  // --- Redirect if unauthenticated ---
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [user, authLoading, router]);

  // --- Load Watchlist on auth complete ---
  useEffect(() => {
    if (!user) return;

    const key = `${WATCHLIST_KEY_PREFIX}_${user.id}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        setWatchlist(JSON.parse(saved));
      } catch {
        setWatchlist(DEFAULT_WATCHLIST);
      }
    } else {
      setWatchlist(DEFAULT_WATCHLIST);
      localStorage.setItem(key, JSON.stringify(DEFAULT_WATCHLIST));
    }
  }, [user]);

  // Save watchlist helper
  const saveWatchlist = (items: WatchlistItem[]) => {
    if (!user) return;
    setWatchlist(items);
    localStorage.setItem(`${WATCHLIST_KEY_PREFIX}_${user.id}`, JSON.stringify(items));
  };

  // --- Load profile Webhook Token and Trade logs ---
  const fetchProfileAndWebhookToken = async () => {
    if (!user) return;
    setProfileLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      const res = await fetch('/api/user/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.webhook_token) {
          setWebhookToken(data.webhook_token);
        }
      }
    } catch (err) {
      console.error('Failed to load webhook token:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  const fetchTradeLogs = async () => {
    if (!user) return;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      const res = await fetch('/api/user/trade-logs?limit=50', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTradesList(data.trades || []);
        setExecutionsList(data.executions || []);
        setStrategyRunsList(data.strategyRuns || []);
      }
    } catch (err) {
      console.error('Failed to fetch trade logs:', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchProfileAndWebhookToken();
      fetchTradeLogs();
      // Periodically refresh trade logs
      const logInterval = setInterval(fetchTradeLogs, 10000);
      return () => clearInterval(logInterval);
    }
  }, [user]);

  // --- Real-time quote streaming ---
  const watchlistKiteIds = useMemo(() => {
    return watchlist.map(item => item.binanceSymbol ? item.binanceSymbol : item.kiteSymbol).filter(Boolean);
  }, [watchlist]);

  const { quotes: liveQuotes } = useMarketQuotes([activeSymbol, ...watchlistKiteIds]);

  // --- Helper to resolve standard segment keys ---
  const resolveSegmentLabel = (sym: string, exchangeOrSegment?: string): string => {
    const s = sym.toUpperCase();
    const raw = (exchangeOrSegment || '').toUpperCase();
    if (s.endsWith('USDT') || s.includes('CRYPTO') || raw.includes('CRYPTO')) return 'CRYPTO';
    if (s.includes('USDINR') || s.includes('EURINR') || s.includes('GBPINR') || s.includes('JPYINR') || raw.includes('FOREX') || raw.includes('CDS')) return 'FOREX';
    if (s.includes('CRUDEOIL') || s.includes('NATURALGAS') || s.includes('GOLD') || s.includes('SILVER') || raw.includes('MCX')) {
      if (s.includes('CE') || s.includes('PE')) return 'MCX-OPT';
      return 'MCX-FUT';
    }
    if (s.includes('CE') || s.includes('PE')) {
      if (s.includes('NIFTY') || s.includes('SENSEX') || s.includes('BANKEX') || s.includes('FINNIFTY') || s.includes('MIDCP') || s.includes('MIDCAP')) return 'INDEX-OPT';
      return 'STOCK-OPT';
    }
    if (s.includes('FUT')) {
      if (s.includes('NIFTY') || s.includes('SENSEX') || s.includes('BANKEX') || s.includes('FINNIFTY') || s.includes('MIDCP') || s.includes('MIDCAP')) return 'INDEX-FUT';
      return 'STOCK-FUT';
    }
    return 'NSE-EQ';
  };

  // --- Watchlist search logic ---
  useEffect(() => {
    if (searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`/api/market/instruments/search?q=${encodeURIComponent(searchQuery)}`, {
          headers
        });
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data || []);
        }
      } catch (err) {
        console.error('Failed search instruments:', err);
      } finally {
        setSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click symbol on watchlist or popover
  const selectSymbol = (item: any) => {
    const sym = item.binanceSymbol ? item.binanceSymbol : item.kiteSymbol;
    const dbSeg = resolveSegmentLabel(sym, item.segment);
    setActiveSymbol(sym);
    setActiveSegment(dbSeg);
    setMobileTab('chart');
  };

  const handleAddSearchResult = (result: any) => {
    const alreadyExists = watchlist.some(
      item => item.kiteSymbol === result.kiteSymbol && item.binanceSymbol === result.binanceSymbol
    );
    if (!alreadyExists) {
      const newItems = [...watchlist, result];
      saveWatchlist(newItems);
    }
    selectSymbol(result);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveWatchlistItem = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const newItems = watchlist.filter((_, idx) => idx !== index);
    saveWatchlist(newItems);
  };

  // --- Run Market Scanner ---
  const handleRunScanner = async () => {
    setScanningLoading(true);
    try {
      const params = new URLSearchParams({
        segment: scanSegment,
        momentum: scanMomentum,
        limit: '30'
      });

      if (minPriceFilter) params.append('minPrice', minPriceFilter);
      if (maxPriceFilter) params.append('maxPrice', maxPriceFilter);
      if (minVolFilter) params.append('minVolume', minVolFilter);

      const res = await fetch(`/api/market/scanner?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setScannerResults(data || []);
      }
    } catch (err) {
      console.error('Scanner run failed:', err);
    } finally {
      setScanningLoading(false);
    }
  };

  // Run initial scan on load
  useEffect(() => {
    if (user) {
      handleRunScanner();
    }
  }, [user, scanSegment, scanMomentum]);

  const handleDoubleclickScannerResult = (result: ScannerResult) => {
    const isCrypto = result.segment.toUpperCase() === 'CRYPTO';
    const kiteSymbol = isCrypto ? '' : `${result.exchange}:${result.symbol}`;
    const binanceSymbol = isCrypto ? result.symbol : '';

    const watchItem: WatchlistItem = {
      name: result.name,
      symbol: result.symbol,
      kiteSymbol,
      binanceSymbol,
      price: result.last_price,
      change: `${result.changePercent >= 0 ? '+' : ''}${result.changePercent}%`,
      segment: result.segment
    };

    const alreadyExists = watchlist.some(
      item => (isCrypto && item.binanceSymbol === binanceSymbol) || (!isCrypto && item.kiteSymbol === kiteSymbol)
    );

    if (!alreadyExists) {
      saveWatchlist([...watchlist, watchItem]);
    }

    selectSymbol(watchItem);
  };

  // --- Copy webhook token helper ---
  const [copySuccess, setCopySuccess] = useState(false);
  const handleCopyWebhookToken = () => {
    if (!webhookToken) return;
    navigator.clipboard.writeText(webhookToken);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // --- Live Quote helper inside Watchlist items ---
  const getEnrichedWatchlistItem = (item: WatchlistItem) => {
    const liveKey = item.binanceSymbol ? item.binanceSymbol : item.kiteSymbol;
    const live = liveQuotes[liveKey];

    const lastPrice = live ? live.lastPrice : item.price || 0;
    const changePct = live ? live.changePercent : 0;
    const isUp = changePct >= 0;

    return {
      ...item,
      price: lastPrice,
      changePercent: changePct,
      isUp
    };
  };

  const activeLiveQuote = useMemo(() => {
    return liveQuotes[activeSymbol] || null;
  }, [activeSymbol, liveQuotes]);

  if (authLoading) {
    return (
      <div className="empty-panel-state" style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <i className="fas fa-circle-notch fa-spin"></i>
        <span>Authenticating session...</span>
      </div>
    );
  }

  return (
    <div className="dashboard-root">
      <Sidebar />

      <main className="dashboard-viewport">
        {/* Mobile Terminal Header Tabs */}
        <div className="mobile-terminal-header">
          <button
            className={`mobile-terminal-tab-btn ${mobileTab === 'watchlist' ? 'active' : ''}`}
            onClick={() => { setMobileTab('watchlist'); setActiveLeftTab('watchlist'); }}
          >
            <i className="fas fa-list"></i>
            <span>Watchlist</span>
          </button>
          <button
            className={`mobile-terminal-tab-btn ${mobileTab === 'chart' ? 'active' : ''}`}
            onClick={() => setMobileTab('chart')}
          >
            <i className="fas fa-chart-line"></i>
            <span>Chart</span>
          </button>
          <button
            className={`mobile-terminal-tab-btn ${mobileTab === 'scanner' ? 'active' : ''}`}
            onClick={() => { setMobileTab('scanner'); setActiveLeftTab('scanner'); }}
          >
            <i className="fas fa-radar"></i>
            <span>Scanner</span>
          </button>
          <button
            className={`mobile-terminal-tab-btn ${mobileTab === 'logs' ? 'active' : ''}`}
            onClick={() => setMobileTab('logs')}
          >
            <i className="fas fa-history"></i>
            <span>Logs</span>
          </button>
        </div>

        <div className="dashboard-grid">
          {/* ============================================================
              LEFT BAR: WATCHLIST & SCANNER
              ============================================================ */}
          <div className={`left-panel ${(mobileTab !== 'watchlist' && mobileTab !== 'scanner') ? 'mobile-hide' : ''}`}>
            <div className="panel-tabs-header">
              <button
                className={`panel-tab-btn ${activeLeftTab === 'watchlist' ? 'active' : ''}`}
                onClick={() => setActiveLeftTab('watchlist')}
              >
                WATCHLIST
              </button>
              <button
                className={`panel-tab-btn ${activeLeftTab === 'scanner' ? 'active' : ''}`}
                onClick={() => setActiveLeftTab('scanner')}
              >
                SCANNER
              </button>
            </div>

            <div className="panel-tab-content">
              {activeLeftTab === 'watchlist' ? (
                <>
                  <div className="search-widget">
                    <div className="search-input-wrapper">
                      <i className="fas fa-search"></i>
                      <input
                        type="text"
                        className="search-field"
                        placeholder="Search & add symbol..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searching && (
                        <i className="fas fa-circle-notch fa-spin" style={{ left: 'auto', right: '12px' }}></i>
                      )}
                    </div>

                    {searchResults.length > 0 && (
                      <div className="search-results-popover">
                        {searchResults.map((result, idx) => (
                          <div
                            key={idx}
                            className="search-result-item"
                            onClick={() => handleAddSearchResult(result)}
                          >
                            <div className="search-result-info">
                              <span className="search-result-symbol">{result.name}</span>
                              <span className="search-result-name">{result.symbol}</span>
                            </div>
                            <div className="search-result-meta">
                              <span className="search-result-seg">{result.segment}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="watchlist-scroll-container">
                    {watchlist.length === 0 ? (
                      <div className="empty-panel-state">
                        <i className="fas fa-layer-group"></i>
                        <span>Watchlist is empty.<br />Search symbols to add.</span>
                      </div>
                    ) : (
                      watchlist.map((item, idx) => {
                        const enriched = getEnrichedWatchlistItem(item);
                        const isCurrent = activeSymbol === (item.binanceSymbol ? item.binanceSymbol : item.kiteSymbol);
                        return (
                          <div
                            key={idx}
                            className={`db-watchlist-card ${isCurrent ? 'active' : ''}`}
                            onClick={() => selectSymbol(item)}
                          >
                            <div className="db-watchlist-card-left">
                              <span className="watchlist-symbol">{item.name}</span>
                              <span className="watchlist-segment">{item.segment}</span>
                            </div>
                            <div className="db-watchlist-card-right">
                              <span className="watchlist-price">
                                ₹{enriched.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className={`watchlist-change ${enriched.isUp ? 'positive' : 'negative'}`}>
                                {enriched.isUp ? '+' : ''}{enriched.changePercent.toFixed(2)}%
                              </span>
                            </div>
                            <button
                              className="ew-close"
                              style={{ width: '22px', height: '22px', fontSize: '0.65rem', marginLeft: '6px' }}
                              onClick={(e) => handleRemoveWatchlistItem(e, idx)}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="scanner-filters">
                    <div className="filter-row">
                      <div className="filter-field">
                        <span className="filter-label">SEGMENT</span>
                        <select
                          className="filter-select"
                          value={scanSegment}
                          onChange={(e) => setScanSegment(e.target.value)}
                        >
                          <option value="NSE">NSE Equity</option>
                          <option value="NFO">NFO Options</option>
                          <option value="MCX">MCX Commodity</option>
                          <option value="CRYPTO">Binance Crypto</option>
                          <option value="CDS">CDS Currency</option>
                        </select>
                      </div>
                      <div className="filter-field">
                        <span className="filter-label">MOMENTUM</span>
                        <select
                          className="filter-select"
                          value={scanMomentum}
                          onChange={(e) => setScanMomentum(e.target.value)}
                        >
                          <option value="top_gainers">Top Gainers</option>
                          <option value="top_losers">Top Losers</option>
                          <option value="high_volume">Volume Leaders</option>
                          <option value="breakout_high">Breakout High</option>
                          <option value="breakout_low">Breakout Low</option>
                          <option value="gappers_up">Gappers Up</option>
                          <option value="gappers_down">Gappers Down</option>
                        </select>
                      </div>
                    </div>

                    <div className="filter-row">
                      <div className="filter-field">
                        <span className="filter-label">MIN PRICE (₹)</span>
                        <input
                          type="number"
                          className="filter-input"
                          placeholder="Min"
                          value={minPriceFilter}
                          onChange={(e) => setMinPriceFilter(e.target.value)}
                        />
                      </div>
                      <div className="filter-field">
                        <span className="filter-label">MAX PRICE (₹)</span>
                        <input
                          type="number"
                          className="filter-input"
                          placeholder="Max"
                          value={maxPriceFilter}
                          onChange={(e) => setMaxPriceFilter(e.target.value)}
                        />
                      </div>
                    </div>

                    <button
                      className="scan-submit-btn"
                      onClick={handleRunScanner}
                      disabled={scanningLoading}
                    >
                      {scanningLoading ? (
                        <>
                          <i className="fas fa-circle-notch fa-spin"></i>
                          Scanning...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-radar"></i>
                          Run Scan
                        </>
                      )}
                    </button>
                  </div>

                  <div className="scanner-scroll-container">
                    {scannerResults.length === 0 ? (
                      <div className="empty-panel-state">
                        <i className="fas fa-radar"></i>
                        <span>No scanner matches.<br />Adjust filters or run scan.</span>
                      </div>
                    ) : (
                      <table className="scanner-table-compact">
                        <thead>
                          <tr>
                            <th>SYMBOL</th>
                            <th style={{ textAlign: 'right' }}>PRICE</th>
                            <th style={{ textAlign: 'right' }}>CHANGE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scannerResults.map((result, idx) => (
                            <tr
                              key={idx}
                              onClick={() => handleDoubleclickScannerResult(result)}
                            >
                              <td className="scanner-symbol-cell">
                                {result.symbol}
                                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                  Vol: {result.volume.toLocaleString('en-IN')}
                                </div>
                              </td>
                              <td className="scanner-price-cell">
                                ₹{result.last_price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className={`scanner-pct-cell ${result.changePercent >= 0 ? 'positive' : 'negative'}`}>
                                {result.changePercent >= 0 ? '+' : ''}
                                {result.changePercent}%
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ============================================================
              RIGHT AREA: CHARTS + TRADE LOGS
              ============================================================ */}
          <div className={`right-area ${(mobileTab !== 'chart' && mobileTab !== 'logs') ? 'mobile-hide' : ''}`}>
            {/* Top: Chart Workspace */}
            <div className={`chart-workspace-container ${mobileTab !== 'chart' ? 'mobile-hide' : ''}`}>
              <TradingChart
                symbol={activeSymbol}
                segment={activeSegment}
                liveQuote={activeLiveQuote}
              />
            </div>

            {/* Bottom: Trade Logs Panel */}
            <div className={`tradelog-pane ${mobileTab !== 'logs' ? 'mobile-hide' : ''}`}>
              <div className="tradelog-header">
                <div className="tradelog-tabs">
                  <button
                    className={`tradelog-tab-btn ${tradeLogTab === 'trades' ? 'active' : ''}`}
                    onClick={() => setTradeLogTab('trades')}
                  >
                    TRADES
                  </button>
                  <button
                    className={`tradelog-tab-btn ${tradeLogTab === 'executions' ? 'active' : ''}`}
                    onClick={() => setTradeLogTab('executions')}
                  >
                    EXECUTIONS & FILLS
                  </button>
                  <button
                    className={`tradelog-tab-btn ${tradeLogTab === 'strategyRuns' ? 'active' : ''}`}
                    onClick={() => setTradeLogTab('strategyRuns')}
                  >
                    TV SIGNAL LOGS
                  </button>
                  <button
                    className={`tradelog-tab-btn ${tradeLogTab === 'webhookToken' ? 'active' : ''}`}
                    onClick={() => setTradeLogTab('webhookToken')}
                  >
                    TV WEBHOOK INFO
                  </button>
                </div>

                <div className="tradelog-header-meta">
                  <i
                    className="fas fa-sync"
                    style={{ cursor: 'pointer', marginRight: '6px' }}
                    onClick={fetchTradeLogs}
                    title="Manual Refresh Logs"
                  ></i>
                  Auto-sync: On
                </div>
              </div>

              <div className="tradelog-body">
                {/* 1. TRADES TAB */}
                {tradeLogTab === 'trades' && (
                  tradesList.length === 0 ? (
                    <div className="empty-panel-state">
                      <i className="fas fa-briefcase"></i>
                      <span>No round-trip trades completed yet.</span>
                    </div>
                  ) : (
                    <table className="tradelog-table">
                      <thead>
                        <tr>
                          <th>SYMBOL</th>
                          <th>SIDE</th>
                          <th>STATUS</th>
                          <th>QTY</th>
                          <th>ENTRY PRICE</th>
                          <th>EXIT PRICE</th>
                          <th>REALIZED P&L</th>
                          <th>ENTRY TIME</th>
                          <th>EXIT TIME</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tradesList.map((trade) => (
                          <tr key={trade.id}>
                            <td style={{ fontWeight: 700 }}>{trade.symbol}</td>
                            <td>
                              <span className={`tradelog-badge ${trade.side.toLowerCase()}`}>
                                {trade.side}
                              </span>
                            </td>
                            <td>
                              <span className={`tradelog-badge ${trade.status.toLowerCase()}`}>
                                {trade.status.toUpperCase()}
                              </span>
                            </td>
                            <td>{trade.qty}</td>
                            <td>₹{trade.entry_price.toFixed(2)}</td>
                            <td>{trade.exit_price ? `₹${trade.exit_price.toFixed(2)}` : '—'}</td>
                            <td>
                              <span className={`tradelog-pnl ${trade.pnl >= 0 ? 'positive' : 'negative'}`}>
                                {trade.pnl >= 0 ? '+' : ''}₹{trade.pnl.toFixed(2)}
                              </span>
                            </td>
                            <td>{new Date(trade.entry_time).toLocaleString('en-IN')}</td>
                            <td>{trade.exit_time ? new Date(trade.exit_time).toLocaleString('en-IN') : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {/* 2. EXECUTIONS TAB */}
                {tradeLogTab === 'executions' && (
                  executionsList.length === 0 ? (
                    <div className="empty-panel-state">
                      <i className="fas fa-list-check"></i>
                      <span>No order executions or fills logged.</span>
                    </div>
                  ) : (
                    <table className="tradelog-table">
                      <thead>
                        <tr>
                          <th>EXECUTION ID</th>
                          <th>SYMBOL</th>
                          <th>SIDE</th>
                          <th>FILLED QTY</th>
                          <th>EXECUTION PRICE</th>
                          <th>COMMISSION</th>
                          <th>EXECUTION TIME</th>
                        </tr>
                      </thead>
                      <tbody>
                        {executionsList.map((exec) => (
                          <tr key={exec.id}>
                            <td style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                              {exec.id.slice(0, 8)}...
                            </td>
                            <td style={{ fontWeight: 700 }}>{exec.symbol}</td>
                            <td>
                              <span className={`tradelog-badge ${exec.side.toLowerCase()}`}>
                                {exec.side}
                              </span>
                            </td>
                            <td>{exec.qty}</td>
                            <td style={{ fontWeight: 700 }}>₹{exec.price.toFixed(2)}</td>
                            <td>₹{exec.commission.toFixed(2)}</td>
                            <td>{new Date(exec.execution_time).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {/* 3. STRATEGY ALERTS TAB */}
                {tradeLogTab === 'strategyRuns' && (
                  strategyRunsList.length === 0 ? (
                    <div className="empty-panel-state">
                      <i className="fas fa-bell"></i>
                      <span>No TradingView webhook alerts received yet.</span>
                    </div>
                  ) : (
                    <table className="tradelog-table">
                      <thead>
                        <tr>
                          <th>STRATEGY NAME</th>
                          <th>SYMBOL</th>
                          <th>SIGNAL TYPE</th>
                          <th>STATUS</th>
                          <th>OUTCOME / ERROR</th>
                          <th>PAYLOAD</th>
                          <th>INGESTION TIME</th>
                        </tr>
                      </thead>
                      <tbody>
                        {strategyRunsList.map((run) => (
                          <tr key={run.id}>
                            <td style={{ fontWeight: 700 }}>{run.strategy_name}</td>
                            <td>{run.symbol}</td>
                            <td>
                              <span className="tradelog-badge open" style={{ padding: '2px 8px' }}>
                                {run.signal_type}
                              </span>
                            </td>
                            <td>
                              <span className={`tradelog-badge ${run.status.toLowerCase()}`}>
                                {run.status}
                              </span>
                            </td>
                            <td style={{ color: run.status === 'FAILED' ? 'var(--negative-text)' : 'inherit' }}>
                              {run.error_message || 'Order placed successfully'}
                            </td>
                            <td>
                              <div className="code-payload-preview" title={JSON.stringify(run.payload)}>
                                {JSON.stringify(run.payload)}
                              </div>
                            </td>
                            <td>{new Date(run.created_at).toLocaleString('en-IN')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {/* 4. WEBHOOK TOKEN INFORMATION TAB */}
                {tradeLogTab === 'webhookToken' && (
                  <div className="webhook-token-container">
                    <div className="webhook-token-card">
                      <h3 className="webhook-token-title">Your Secret Webhook Token</h3>
                      <p className="webhook-token-desc">
                        Use this token in your TradingView alert definitions to trigger automated strategy order placements on MarginApex. Keep this token confidential.
                      </p>
                      <div className="webhook-token-row">
                        <div className="webhook-token-box">
                          {webhookToken || 'Loading token...'}
                        </div>
                        <button
                          className="webhook-copy-btn"
                          onClick={handleCopyWebhookToken}
                          disabled={!webhookToken}
                        >
                          <i className={`fas ${copySuccess ? 'fa-check' : 'fa-copy'}`}></i>
                          {copySuccess ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <div className="webhook-instructions">
                      <h4>How to Set Up TradingView Alerts:</h4>
                      <ol className="webhook-steps">
                        <li>
                          Set the **Webhook URL** in your TradingView alert settings to:
                          <div className="webhook-code-block">
                            {typeof window !== 'undefined'
                              ? `${window.location.protocol}//${window.location.host}/webhooks/tradingview?token=${webhookToken || 'YOUR_TOKEN'}`
                              : `https://your-domain.com/webhooks/tradingview?token=${webhookToken || 'YOUR_TOKEN'}`}
                          </div>
                        </li>
                        <li>
                          Set the alert **Message** payload using JSON structure below:
                          <div className="webhook-code-block">
{`{
  "symbol": "NSE:RELIANCE", 
  "action": "BUY", 
  "qty": 10,
  "order_type": "MARKET",
  "strategy_name": "RSI Breakout Strategy"
}`}
                          </div>
                        </li>
                        <li>
                          **Supported Actions**: `BUY`, `SELL`, `LONG`, `SHORT`, `BUY_EXIT` (exits short), `SELL_EXIT` (exits long), `EXIT` / `CLOSE` (FIFO exits active open positions).
                        </li>
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer activeTab="home" hideDrawer={true} />
    </div>
  );
}
