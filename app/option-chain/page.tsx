'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOrderEntry, OrderSide, OrderType, ProductType } from '@/hooks/useOrderEntry';
import { useActivePositions } from '@/hooks/useActivePositions';
import { useKiteQuotes } from '@/hooks/useKiteQuotes';
import OptionChainTable from './OptionChainTable';
import Footer from '@/components/Footer';
import TradingSegmentsDrawer from '@/components/TradingSegmentsDrawer';
import './option-chain.css';

function addToWatchlist(item: {
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
}, userId?: string) {
  const WATCHLIST_KEY = 'marginApex_watchlist';
  try {
    const key = userId ? `${WATCHLIST_KEY}_${userId}` : WATCHLIST_KEY;
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];

    const targetCat = item.category || 'WATCHLIST';
    // Check if already exists in the selected watchlist
    const exists = list.some((i: any) => i.symbol === item.symbol && (i.category || 'WATCHLIST') === targetCat);
    if (exists) return false;

    const newItem = { ...item, category: targetCat };
    list.push(newItem);
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

declare global {
  interface Window {
    __optionChainCache?: Record<string, any>;
  }
}

function OptionChainContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const symbol = (searchParams.get('symbol') || 'NIFTY').toUpperCase();

  const [isDark, setIsDark] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsDark(document.body.classList.contains('dark'));
    check();
    const observer = new MutationObserver(check);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => { setMounted(true); }, []);

  const { placeOrder, loading: placingOrder, error: orderError, setError: setOrderError } = useOrderEntry();

  const [selectedContract, setSelectedContract] = useState<{ symbol: string, type: 'CE' | 'PE', strike: number } | null>(null);
  const [orderQty, setOrderQty] = useState(25);
  const { positions: activePositions, refreshPositions } = useActivePositions();
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [productType, setProductType] = useState<ProductType>('INTRADAY');
  const [limitPrice, setLimitPrice] = useState('');

  // Dual popup and Trade Sheet States
  const [sheetView, setSheetView] = useState<'DETAILS' | 'ORDER'>('DETAILS');
  const [sheetSide, setSheetSide] = useState<'BUY' | 'SELL'>('BUY');
  const [orderUnit, setOrderUnit] = useState<'qty' | 'lot'>('qty');
  const [qtyInput, setQtyInput] = useState('25');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');
  const [showWatchlistSelector, setShowWatchlistSelector] = useState(false);
  const [pendingWatchlistItem, setPendingWatchlistItem] = useState<any>(null);
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    async function fetchUserId() {
      try {
        const { supabase: sb } = await import('@/lib/supabaseClient');
        const { data: { session } } = await sb.auth.getSession();
        if (session) {
          setUserId(session.user.id);
        }
      } catch (err) {
        console.error('Failed to get session user id', err);
      }
    }
    fetchUserId();
  }, []);

  const lotSize = symbol === 'NIFTY' ? 25 : (symbol === 'BANKNIFTY' ? 15 : (symbol === 'SENSEX' ? 10 : 25));

  const stepQty = (dir: number) => {
    const step = orderUnit === 'lot' ? 1 : lotSize;
    const currentVal = parseInt(qtyInput) || lotSize;
    const newVal = Math.max(step, currentVal + (dir * step));
    setOrderQty(newVal);
    setQtyInput(String(newVal));
  };

  const handleQtyChange = (val: string) => {
    setQtyInput(val);
    const parsed = parseInt(val) || 0;
    if (parsed > 0) {
      setOrderQty(parsed);
    }
  };

  const handleAddToWatchlistClick = () => {
    if (!selectedContract) return;
    const strikeMatch = data?.strikes.find(s => s.ce?.symbol === selectedContract.symbol || s.pe?.symbol === selectedContract.symbol);
    const contractData = selectedContract.type === 'CE' ? strikeMatch?.ce : strikeMatch?.pe;
    if (!contractData) return;

    const kiteId = contractData.id;
    const quote = kiteId ? quotes[kiteId] : null;
    const price = quote ? quote.lastPrice : 0;
    const change = quote ? `${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent.toFixed(2)}%` : '0.00%';
    const open = quote ? quote.open : 0;
    const high = quote ? quote.high : 0;
    const low = quote ? quote.low : 0;
    const close = quote ? quote.close : 0;

    setPendingWatchlistItem({
      name: `${symbol} ${selectedContract.strike.toLocaleString('en-IN')} ${selectedContract.type}`,
      symbol: selectedContract.symbol,
      kiteSymbol: kiteId || selectedContract.symbol,
      price,
      change,
      segment: symbol.includes('SENSEX') || symbol.includes('BANKEX') ? 'BFO' : 'NFO',
      contractDate: selectedExpiry ? selectedExpiry : '',
      open,
      high,
      low,
      close,
    });
    setShowWatchlistSelector(true);
  };

  const confirmAddToWatchlist = (category: string) => {
    if (!pendingWatchlistItem) return;

    const success = addToWatchlist({ ...pendingWatchlistItem, category }, userId);

    setShowWatchlistSelector(false);
    setPendingWatchlistItem(null);

    if (success) {
      showToast('Added to ' + (category === 'WATCHLIST' ? 'Watchlist' : category), false);
    } else {
      showToast('Already added to this watchlist', true);
    }
  };

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

  // Normalization for MIDCAP
  const normalizedSymbol = symbol === 'MIDCAP' ? 'MIDCPNIFTY' : symbol;

  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);

  const cacheKey = `${normalizedSymbol}_${selectedExpiry || 'default'}`;
  
  const [data, setData] = useState<{
    expiries: string[];
    strikes: any[];
    expiry: string;
  } | null>(typeof window !== 'undefined' ? window.__optionChainCache?.[cacheKey] || null : null);
  
  const [loading, setLoading] = useState(!(typeof window !== 'undefined' && window.__optionChainCache?.[cacheKey]));
  const [isSegmentsOpen, setIsSegmentsOpen] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);


  // Refresh positions when selected contract changes
  useEffect(() => {
    refreshPositions();
    const interval = setInterval(refreshPositions, 5000);
    return () => clearInterval(interval);
  }, [selectedContract, refreshPositions]);

  // Fetch initial option chain data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setData(null);
      setLoadingError(null);
      try {
        const { supabase: sb } = await import('@/lib/supabaseClient');
        const { data: { session } } = await sb.auth.getSession();
        const headers: Record<string, string> = {};
        if (session) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }
        const url = `/api/market/option-chain?symbol=${normalizedSymbol}${selectedExpiry ? `&expiry=${selectedExpiry}` : ''}`;
        const res = await fetch(url, { headers });
        if (res.status === 403) {
          setLoadingError('locked');
          return;
        }
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            window.__optionChainCache = window.__optionChainCache || {};
            window.__optionChainCache[cacheKey] = json;
            setData(json);
            if (!selectedExpiry) setSelectedExpiry(json.expiry);
          } else {
            setLoadingError(json.error || 'Failed to fetch option chain');
          }
        } else {
          setLoadingError('Failed to fetch option chain');
        }
      } catch (err) {
        console.error('Failed to fetch option chain', err);
        setLoadingError('Failed to fetch option chain');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [normalizedSymbol, selectedExpiry, cacheKey]);

  // Extract all instrument IDs for real-time quotes
  const instrumentIds = React.useMemo(() => {
    if (!data) return [];
    const underlyingId = symbol === 'NIFTY' ? 'NSE:NIFTY 50' :
      symbol === 'BANKNIFTY' ? 'NSE:NIFTY BANK' :
        symbol === 'FINNIFTY' ? 'NSE:NIFTY FIN SERVICE' :
          symbol === 'MIDCAP' || symbol === 'MIDCPNIFTY' ? 'NSE:NIFTY MID SELECT' :
            symbol === 'SENSEX' ? 'BSE:SENSEX' :
              symbol === 'BANKEX' ? 'BSE:BANKEX' : null;
    const ids: string[] = underlyingId ? [underlyingId] : [];
    data.strikes.forEach(s => {
      if (s.ce?.id) ids.push(s.ce.id);
      if (s.pe?.id) ids.push(s.pe.id);
    });
    return ids;
  }, [data, symbol]);

  const { quotes, connected } = useKiteQuotes(instrumentIds, 2000);

  const underlyingId = symbol === 'NIFTY' ? 'NSE:NIFTY 50' :
    symbol === 'BANKNIFTY' ? 'NSE:NIFTY BANK' :
      symbol === 'FINNIFTY' ? 'NSE:NIFTY FIN SERVICE' :
        symbol === 'MIDCAP' || symbol === 'MIDCPNIFTY' ? 'NSE:NIFTY MID SELECT' :
          symbol === 'SENSEX' ? 'BSE:SENSEX' :
            symbol === 'BANKEX' ? 'BSE:BANKEX' : null;

  const spotPrice = React.useMemo(() => {
    if (!underlyingId) return 0;
    return (quotes[underlyingId] || quotes[underlyingId.split(':')[1] || ''])?.lastPrice || 0;
  }, [underlyingId, quotes]);

  const handleTrade = (instrSymbol: string, side: 'BUY' | 'SELL') => {
    const strikeMatch = data?.strikes.find(s => s.ce?.symbol === instrSymbol || s.pe?.symbol === instrSymbol);
    if (strikeMatch) {
      const type = strikeMatch.ce?.symbol === instrSymbol ? 'CE' : 'PE';
      setSelectedContract({ symbol: instrSymbol, type, strike: strikeMatch.strike });
      const defaultQty = lotSize;
      setOrderQty(defaultQty);
      setQtyInput(String(defaultQty));
      setOrderUnit('qty');
      setSheetView('DETAILS');
      setSheetSide(side);
      setShowWatchlistSelector(false);
    }
  };

  const closeTradeSheet = () => {
    setSelectedContract(null);
    setShowWatchlistSelector(false);
  };

  const handlePlaceOrder = async (side: OrderSide) => {
    if (!selectedContract) return;
    
    const activePos = activePositions.find(p =>
      (p.status === 'open' || p.status === 'OPEN') && p.qty_open > 0 && p.symbol === selectedContract.symbol
    );
    const isExitOrder = (side === 'BUY' && activePos?.side === 'SELL') || (side === 'SELL' && activePos?.side === 'BUY');

    const kiteId = data?.strikes.find(s => s.ce?.symbol === selectedContract.symbol || s.pe?.symbol === selectedContract.symbol)?.[selectedContract.type.toLowerCase()]?.id;
    const currentPrice = kiteId ? (quotes[kiteId]?.lastPrice || 0) : 0;
    const actualQty = orderUnit === 'lot' ? orderQty * lotSize : orderQty;
    const actualLots = orderUnit === 'lot' ? orderQty : Math.floor(orderQty / lotSize);
    const result = await placeOrder({
      symbol: selectedContract.symbol,
      kite_instrument: kiteId || selectedContract.symbol,
      segment: symbol.includes('SENSEX') || symbol.includes('BANKEX') ? 'BFO' : 'NFO',
      side,
      qty: actualQty,
      lots: actualLots,
      order_type: orderType,
      product_type: productType,
      client_price: orderType === 'LIMIT' ? parseFloat(limitPrice) : currentPrice,
      is_exit: isExitOrder
    });
    if (result.success) {
      showToast(`No. ${side} Order Executed!`, false);
      closeTradeSheet();
    } else {
      showToast(`Order Failed: ${result.error}`, true);
    }
  };

  const [priceMode, setPriceMode] = useState<'BA' | 'LTP'>('BA');

  return (
    <div className={`oc-app-container${mounted && isDark ? ' dark' : ''}`}>
      <header className="app-header premium-header">
        <div className="header-wrapper">
          <div className="oc-capsule-header">
            {/* Left: back btn + symbol info */}
            <div className="oc-capsule-left">
              <div className="premium-back-btn" onClick={() => router.back()}>
                <i className="fas fa-arrow-left" style={{ fontSize: '0.9rem' }}></i>
              </div>
              <div className="oc-capsule-info">
                <div className="premium-symbol-name">{symbol}</div>
                <div className="oc-capsule-sub">
                  <span className="premium-badge">OPTION CHAIN</span>
                  {connected ? (
                    <div className="pulsing-dot connected"></div>
                  ) : (
                    <>
                      <div className="pulsing-dot connecting"></div>
                      <span className="connecting-text">Connecting...</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            {/* Right: B/A + LTP toggle */}
            <div className="oc-capsule-right">
              <div className="oc-mode-toggle">
                {(['BA', 'LTP'] as const).map(m => (
                  <button key={m} className={`oc-mode-btn${priceMode === m ? ' active' : ''}`} onClick={() => setPriceMode(m)}>
                    {m === 'BA' ? 'B/A' : 'LTP'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="main-content">
        <div className="content-wrapper">
          {/* Expiry Strip — capsule container with spot + dates */}
          <div className="expiry-strip">
            <div className="expiry-capsule-bar">
              {/* Spot Price — inner capsule like dates */}
              <div className="expiry-spot-inner-capsule">
                <div className="expiry-spot-pill">
                  <span className="expiry-spot-label">Spot</span>
                  <span className="expiry-spot-val">
                    ₹{spotPrice > 0 ? spotPrice.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '---'}
                  </span>
                </div>
              </div>
              {/* Divider */}
              <div className="expiry-divider"></div>
              {/* Date pills — inner capsule like B/A toggle */}
              <div className="expiry-dates-inner-capsule">
                <div className="expiry-dates-scroll">
                  {data?.expiries.map((exp) => {
                    const [year, monthNum, dayNum] = exp.split('-').map(Number);
                    const dateObj = new Date(year, monthNum - 1, dayNum);
                    const day = dateObj.getDate();
                    const month = dateObj.toLocaleDateString('en-IN', { month: 'short' });
                    const yr = String(year).slice(2);
                    return (
                      <button
                        key={exp}
                        className={`expiry-date-btn${selectedExpiry === exp ? ' active' : ''}`}
                        onClick={() => setSelectedExpiry(exp)}
                      >
                        {day} {month} {yr}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="oc-table-wrapper">
            {loading ? (
              <div className="loading-state">
                <div className="red-spinner"></div>
                <p>Gathering strikes...</p>
              </div>
            ) : loadingError === 'locked' ? (
              <div className="premium-lock-container">
                <div className="premium-lock-card">
                  <div className="premium-lock-icon">
                    <i className="fas fa-lock"></i>
                  </div>
                  <h3 className="premium-lock-title">Segment Restricted</h3>
                  <p className="premium-lock-text">
                    You do not have access to trade in <strong>{symbol.includes('SENSEX') || symbol.includes('BANKEX') ? 'BSE Options' : 'NSE Options'}</strong>.
                  </p>
                  <div className="premium-lock-divider"></div>
                  <p className="premium-lock-hint">
                    Please contact your administrator or update your profile settings to enable this trading segment.
                  </p>
                  <button className="premium-lock-btn" onClick={() => router.push('/profile')}>
                    <i className="fas fa-user-cog"></i> Go to Profile Settings
                  </button>
                </div>
              </div>
            ) : (
              <>
                {(data?.strikes || []).length === 0 ? (
                  <div className="no-data-state">
                    <i className="fas fa-search"></i>
                    <p>No options found for {symbol}</p>
                    <p className="sub">Try syncing instruments or check the symbol name.</p>
                  </div>
                ) : (
                  <>
                    {/* Toast Notification */}
                    {toast.visible && (
                      <div className={`toast-msg${toast.isError ? ' error' : ''}`}>
                        {toast.msg}
                      </div>
                    )}

                    <OptionChainTable
                      strikes={data?.strikes || []}
                      quotes={quotes}
                      spotPrice={spotPrice}
                      onTrade={handleTrade}
                      priceMode={priceMode}
                    />
                  </>
                )}
              </>
            )}
          </div>

          <Footer activeTab="watchlist" />
        </div>
      </main>

      {/* Critical CSS inlined — prevents FOUC when CSS chunk loads late during client navigation */}
      <style>{`
        .expiry-half-drawer-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.55); z-index: 1000;
          opacity: 0; visibility: hidden; pointer-events: none;
          transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        .expiry-half-drawer-overlay.active {
          opacity: 1; visibility: visible; pointer-events: auto;
        }
        .expiry-half-sheet {
          background: var(--card-bg, #F5F7FB);
          border-radius: 20px 20px 0 0;
          width: 100%; max-width: 500px; max-height: 85dvh;
          overflow-y: auto;
          box-shadow: 0 -8px 40px rgba(0,0,0,0.18);
          padding-bottom: env(safe-area-inset-bottom, 0px);
          position: fixed; bottom: 0; left: 0; right: 0; margin: 0 auto;
          transform: translateY(100%); visibility: hidden;
          transition: transform 0.38s cubic-bezier(0.25, 0.9, 0.35, 1.05), visibility 0s linear 0.38s;
          z-index: 1001;
        }
        .expiry-half-drawer-overlay.active .expiry-half-sheet {
          transform: translateY(0); visibility: visible;
          transition: transform 0.38s cubic-bezier(0.25, 0.9, 0.35, 1.05), visibility 0s linear 0s;
        }
        @media (max-width: 500px) { .expiry-half-sheet { max-width: 100%; } }
        .os-handle { display: flex; justify-content: center; padding: 10px 0 6px; }
        .os-handle-bar { width: 40px; height: 4px; background: var(--border-card, #e2e6ea); border-radius: 4px; }
        .os-sheet-header { padding: 14px 16px; border-bottom: 1px solid var(--border-light, #e8ecf0); display: flex; align-items: center; gap: 10px; }
        .os-back-btn { background: var(--icon-bg, #f0f2f5); border: none; width: 34px; height: 34px; border-radius: 50%; font-size: 0.9rem; cursor: pointer; color: var(--text-secondary, #6b7280); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .os-sheet-left { flex: 1; }
        .os-sheet-name { font-size: 1rem; font-weight: 800; color: var(--text-primary, #1a1a1a); margin-bottom: 4px; }
        .os-sheet-segment { display: inline-block; font-size: 0.6rem; font-weight: 600; color: #C62E2E; background: #FEF0F0; padding: 3px 10px; border-radius: 20px; }
        .os-sheet-right { text-align: right; }
        .os-cmp-label { font-size: 0.55rem; color: var(--text-muted, #9ca3af); text-transform: uppercase; }
        .os-cmp-val { font-size: 1.2rem; font-weight: 800; color: var(--text-primary, #1a1a1a); }
        .os-cmp-chg { font-size: 0.65rem; font-weight: 600; padding: 2px 8px; border-radius: 30px; display: inline-block; margin-top: 2px; }
        .os-cmp-chg.pos { color: #2C8E5A; background: #E9F6EF; }
        .os-cmp-chg.neg { color: #C62E2E; background: #FEF0F0; }
        .os-bidask { background: var(--card-alt-bg, #f8f9fb); margin: 10px 16px; padding: 10px 16px; border-radius: 20px; display: flex; justify-content: space-between; align-items: center; }
        .os-ba-col { flex: 1; text-align: center; }
        .os-ba-label { font-size: 0.6rem; color: var(--text-muted, #9ca3af); text-transform: uppercase; margin-bottom: 3px; }
        .os-ba-val { font-size: 1rem; font-weight: 700; }
        .os-ba-val.pos { color: #2C8E5A; }
        .os-ba-val.neg { color: #C62E2E; }
        .os-ba-divider { width: 1px; height: 32px; background: var(--border-light, #e8ecf0); margin: 0 8px; }
        .os-qty-section { background: var(--card-alt-bg, #f8f9fb); padding: 10px 14px; border-radius: 18px; margin: 0 16px 12px; box-sizing: border-box; }
        .os-qty-label { font-size: 0.7rem; font-weight: 500; color: var(--text-muted, #9ca3af); margin-bottom: 8px; }
        .os-qty-control { display: flex; align-items: center; justify-content: space-between; background: var(--card-bg, #fff); border-radius: 40px; padding: 3px; border: 1px solid var(--border-light, #e8ecf0); width: 100%; box-sizing: border-box; overflow: hidden; }
        .os-qty-btn { width: 38px; height: 38px; min-width: 38px; background: var(--icon-bg, #f0f2f5); border: none; border-radius: 30px; font-size: 1rem; font-weight: 600; color: #C62E2E; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .os-qty-input { flex: 1; min-width: 0; text-align: center; font-size: 1rem; font-weight: 700; border: none; outline: none; background: transparent; color: var(--text-primary, #1a1a1a); font-family: inherit; }
        .os-type-section { background: var(--card-alt-bg, #f8f9fb); padding: 10px 14px; border-radius: 18px; margin: 0 16px 12px; }
        .os-section-lbl { font-size: 0.7rem; font-weight: 500; color: var(--text-muted, #9ca3af); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
        .os-type-btns { display: flex; gap: 8px; }
        .os-type-btn { flex: 1; padding: 8px; border: 1px solid var(--border-light, #e8ecf0); background: var(--card-bg, #fff); border-radius: 30px; font-size: 0.7rem; font-weight: 600; cursor: pointer; text-align: center; color: var(--text-secondary, #6b7280); font-family: inherit; transition: 0.15s; }
        .os-type-btn.active { background: #C62E2E; color: white; border-color: #C62E2E; }
        .os-price-input { width: 100%; margin-top: 10px; padding: 10px; border-radius: 30px; border: 1px solid var(--border-light, #e8ecf0); font-size: 0.85rem; background: var(--card-bg, #fff); color: var(--text-primary, #1a1a1a); outline: none; font-family: inherit; box-sizing: border-box; }
        .os-actions { padding: 4px 16px calc(16px + env(safe-area-inset-bottom, 0px)); display: flex; gap: 10px; }
        .os-btn-buy, .os-btn-sell { flex: 1; padding: 14px; border: none; border-radius: 40px; font-size: 0.9rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-family: inherit; transition: 0.15s; }
        .os-btn-buy { background: #2C8E5A; color: white; }
        .os-btn-sell { background: #C62E2E; color: white; }
        .os-btn-buy:disabled, .os-btn-sell:disabled { opacity: 0.6; cursor: not-allowed; }

        .premium-lock-container {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          min-height: 400px;
          width: 100%;
          box-sizing: border-box;
        }
        .premium-lock-card {
          background: #ffffff;
          border: 1px solid var(--border-light, #e8ecf0);
          border-radius: 24px;
          padding: 32px 24px;
          width: 100%;
          max-width: 380px;
          text-align: center;
          box-shadow: 0 10px 30px rgba(0,0,0,0.05);
          transition: transform 0.3s ease;
        }
        :global(.dark) .premium-lock-card {
          background: #1f2937;
          border-color: #374151;
          box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        }
        .premium-lock-icon {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #fecfef 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          font-size: 1.5rem;
          color: #e11d48;
          box-shadow: 0 8px 20px rgba(225, 29, 72, 0.15);
          animation: pulseGlow 2s infinite ease-in-out;
        }
        @keyframes pulseGlow {
          0% { transform: scale(1); box-shadow: 0 8px 20px rgba(225, 29, 72, 0.15); }
          50% { transform: scale(1.05); box-shadow: 0 8px 25px rgba(225, 29, 72, 0.3); }
          100% { transform: scale(1); box-shadow: 0 8px 20px rgba(225, 29, 72, 0.15); }
        }
        .premium-lock-title {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--text-primary, #111827);
          margin: 0 0 10px 0;
        }
        :global(.dark) .premium-lock-title {
          color: #f9fafb;
        }
        .premium-lock-text {
          font-size: 0.88rem;
          color: var(--text-secondary, #4b5563);
          line-height: 1.5;
          margin: 0 0 20px 0;
        }
        :global(.dark) .premium-lock-text {
          color: #d1d5db;
        }
        .premium-lock-divider {
          height: 1px;
          background: var(--border-light, #e8ecf0);
          margin: 20px 0;
        }
        :global(.dark) .premium-lock-divider {
          background: #374151;
        }
        .premium-lock-hint {
          font-size: 0.78rem;
          color: var(--text-muted, #9ca3af);
          line-height: 1.4;
          margin: 0 0 24px 0;
        }
        .premium-lock-btn {
          width: 100%;
          padding: 14px;
          background: linear-gradient(135deg, #e11d48 0%, #be123c 100%);
          color: white;
          border: none;
          border-radius: 30px;
          font-size: 0.88rem;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 4px 12px rgba(225, 29, 72, 0.25);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .premium-lock-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(225, 29, 72, 0.35);
        }
        .premium-lock-btn:active {
          transform: translateY(0);
        }
      `}</style>

      {/* Contract Order Sheet Overlay */}
      <div
        className={`trade-sheet-overlay${selectedContract ? ' active' : ''}`}
        id={sheetView === 'ORDER' ? 'tradeSheetOverlay' : 'detailSheetOverlay'}
        onClick={() => setSelectedContract(null)}
      ></div>

      {/* Contract Order Sheet */}
      <div
        className={`trade-sheet${selectedContract ? ' open' : ''}${sheetView === 'DETAILS' ? ' detail-sheet' : ''}`}
        id={sheetView === 'ORDER' ? 'tradeSheet' : 'detailSheet'}
        style={sheetView === 'DETAILS' ? { height: 'auto', maxHeight: '72dvh', paddingBottom: '16px' } : undefined}
      >
        {selectedContract && (() => {
          const kiteId = data?.strikes.find(s => s.ce?.symbol === selectedContract.symbol || s.pe?.symbol === selectedContract.symbol)?.[selectedContract.type.toLowerCase()]?.id;
          const kiteToken = data?.strikes.find(s => s.ce?.symbol === selectedContract.symbol || s.pe?.symbol === selectedContract.symbol)?.[selectedContract.type.toLowerCase()]?.token;

          const getQuoteHelper = (id?: string, token?: number) => {
            if (!id && !token) return null;
            if (id && quotes[id]) return quotes[id];
            if (token && quotes[String(token)]) return quotes[String(token)];
            if (id) {
              const parts = id.split(':');
              const symbolOnly = parts.length > 1 ? parts[1] : id;
              if (quotes[symbolOnly]) return quotes[symbolOnly];
            }
            return null;
          };

          const quote = getQuoteHelper(kiteId, kiteToken);
          const strikeMatch = data?.strikes.find(s => s.ce?.symbol === selectedContract.symbol || s.pe?.symbol === selectedContract.symbol);
          const contractData = selectedContract.type === 'CE' ? strikeMatch?.ce : strikeMatch?.pe;

          const ltp = quote ? quote.lastPrice : (contractData?.price || 0);
          const chgPct = quote ? quote.changePercent : (contractData?.change || 0);
          const bid = ltp > 0 ? ltp - 0.05 : 0;
          const ask = ltp > 0 ? ltp + 0.05 : 0;

          // Find active opposite positions for options direction guards
          const activePos = activePositions.find(p =>
            (p.status === 'open' || p.status === 'OPEN') && p.qty_open > 0 && p.symbol === selectedContract.symbol
          );

          if (sheetView === 'DETAILS') {
            return (
              <div style={{ padding: '0' }}>
                <div className="sheet-handle" style={{ display: 'flex' }}><div className="handle-bar" style={{ display: 'block' }}></div></div>
                <div style={{ padding: '12px 14px 4px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                    <div>
                      <div style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '3px', lineHeight: '1.1', letterSpacing: '-0.3px' }}>{symbol} {selectedContract.strike.toLocaleString('en-IN')} {selectedContract.type}</div>
                      <span style={{ fontSize: '0.55rem', fontWeight: '700', color: '#DC2626', background: '#FEF2F2', padding: '3px 8px', borderRadius: '20px', lineHeight: '1', display: 'inline-block', letterSpacing: '0.5px' }}>{selectedContract.symbol}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                    <div style={{ fontSize: '0.5rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1px', letterSpacing: '0.5px' }}>CMP</div>
                    <div style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-primary)', marginBottom: '4px', lineHeight: '1', letterSpacing: '-0.5px' }}>₹{ltp.toFixed(2)}</div>
                    <span style={{ fontSize: '0.65rem', fontWeight: '800', padding: '4px 8px', borderRadius: '6px', lineHeight: '1', color: chgPct >= 0 ? '#059669' : '#DC2626', background: chgPct >= 0 ? '#ECFDF5' : '#FEF2F2' }}>
                      {chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%
                    </span>
                  </div>
                </div>
                <div style={{ height: '1px', background: 'var(--border-light)', margin: '0 0 6px', width: '100%' }}></div>
                <div style={{ padding: '0 12px 10px 12px' }}>
                  <div style={{ background: 'var(--card-alt-bg)', border: '1px solid var(--border-card)', borderRadius: '14px', padding: '8px 12px', display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.58rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '3px' }}>BID</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#059669' }}>₹{bid.toFixed(2)}</div>
                    </div>
                    <div style={{ width: '1px', background: 'var(--border-card)', height: '24px' }}></div>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                      <div style={{ fontSize: '0.58rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '3px' }}>ASK</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#DC2626' }}>₹{ask.toFixed(2)}</div>
                    </div>
                  </div>

                  {/* ADD TO WATCHLIST */}
                  <div style={{ marginBottom: '8px' }}>
                    <div style={{ fontSize: '0.52rem', fontWeight: '700', color: 'var(--text-secondary)', marginBottom: '6px' }}>ADD TO WATCHLIST</div>
                    {!showWatchlistSelector ? (
                      <button
                        onClick={handleAddToWatchlistClick}
                        style={{
                          width: '100%',
                          padding: '10.5px',
                          background: '#2C8E5A',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '14px',
                          fontWeight: '700',
                          fontSize: '0.8rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px',
                          boxShadow: '0 2px 8px rgba(44,142,90,0.2)',
                          fontFamily: 'Inter, sans-serif',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <i className="fas fa-plus"></i> Add to Watchlist
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {['WATCHLIST', 'WATCHLIST-1', 'WATCHLIST-2', 'WATCHLIST-3'].map(wl => (
                          <button
                            key={wl}
                            onClick={() => confirmAddToWatchlist(wl)}
                            style={{
                              padding: '12px 14px',
                              background: 'var(--card-alt-bg)',
                              border: '1px solid var(--border-card)',
                              borderRadius: '12px',
                              textAlign: 'left',
                              fontSize: '0.85rem',
                              fontWeight: 700,
                              color: 'var(--text-primary)',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              transition: 'background 0.15s ease'
                            }}
                          >
                            <i className="fas fa-list" style={{ color: '#2C8E5A', fontSize: '0.8rem' }}></i>
                            {wl === 'WATCHLIST' ? 'Default Watchlist' : wl}
                          </button>
                        ))}
                        <button
                          onClick={() => setShowWatchlistSelector(false)}
                          style={{
                            padding: '8px',
                            background: 'transparent',
                            border: 'none',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                            textAlign: 'center'
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Open Trading Chart Button */}
                  <button
                    style={{
                      width: '100%',
                      padding: '9px',
                      borderRadius: '14px',
                      border: '1.5px solid #2C8E5A',
                      background: '#ffffff',
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
                    onClick={() => showToast("Opening Trading Chart for " + selectedContract.symbol, false)}
                  >
                    <i className="fas fa-chart-line" />
                    Open Trading Chart
                  </button>



                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button 
                      style={{ 
                        flex: 1, 
                        background: activePos?.side === 'SELL' ? '#C62E2E' : '#15803D', 
                        color: 'white', 
                        border: 'none', 
                        padding: '11px 0', 
                        borderRadius: '30px', 
                        fontSize: '0.9rem', 
                        fontWeight: '800', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        gap: '6px'
                      }} 
                      onClick={() => { setSheetSide('BUY'); setSheetView('ORDER'); }}
                    >
                      {activePos?.side === 'SELL' ? 'EXIT SELL' : <><i className="fas fa-arrow-up"></i> BUY</>}
                    </button>
                    <button 
                      style={{ 
                        flex: 1, 
                        background: activePos?.side === 'BUY' ? '#2C8E5A' : '#B91C1C', 
                        color: 'white', 
                        border: 'none', 
                        padding: '11px 0', 
                        borderRadius: '30px', 
                        fontSize: '0.9rem', 
                        fontWeight: '800', 
                        cursor: 'pointer', 
                        display: 'flex', 
                        justifyContent: 'center', 
                        alignItems: 'center', 
                        gap: '6px'
                      }} 
                      onClick={() => { setSheetSide('SELL'); setSheetView('ORDER'); }}
                    >
                      {activePos?.side === 'BUY' ? 'EXIT BUY' : <><i className="fas fa-arrow-down"></i> SELL</>}
                    </button>
                  </div>
                </div>
              </div>
            );
          }

          // ORDER / TRADE SHEET VIEW
          const totalQty = orderUnit === 'lot' ? orderQty * lotSize : orderQty;
          const calculatedRequiredMargin = (ltp || 10) * totalQty;

          return (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="ts-header">
                <button className="ts-back-btn" onClick={() => setSheetView('DETAILS')} suppressHydrationWarning>
                  <i className="fas fa-chevron-left"></i>
                </button>
                <div className="ts-name-block">
                  <div className="ts-instr-name">{selectedContract.strike.toLocaleString('en-IN')} {selectedContract.type}</div>
                  <span className="ts-segment-badge">{selectedContract.symbol}</span>
                </div>
                <div className="ts-price-block">
                  <div className="ts-price-value">₹{ltp.toFixed(2)}</div>
                  <span className={`ts-change-badge ${chgPct < 0 ? 'negative' : 'positive'}`}>
                    {chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%
                  </span>
                </div>
              </div>

              <div className="ts-bidask-row">
                <div className="ts-ba-cell">
                  <span className="ts-ba-label">BID</span>
                  <span className="ts-ba-val bid-val">₹{bid.toFixed(2)}</span>
                </div>
                <div className="ts-ba-divider"></div>
                <div className="ts-ba-cell">
                  <span className="ts-ba-label">ASK</span>
                  <span className="ts-ba-val ask-val">₹{ask.toFixed(2)}</span>
                </div>
              </div>

              <div className="sheet-content-scroll">
                <div className="ts-body">
                  {/* QTY / LOT Switch card */}
                  <div className="ts-section-card">
                    <div className="ts-qty-lot-row">
                      <span className="ts-section-label" style={{ marginBottom: 0 }}>Order Unit</span>
                      <div className="ts-toggle-switch">
                        <button
                          className={`ts-toggle-opt ${orderUnit === 'qty' ? 'active' : ''}`}
                          onClick={() => { setOrderUnit('qty'); setOrderQty(lotSize); setQtyInput(String(lotSize)); }}
                          suppressHydrationWarning
                        >QTY</button>
                        <button
                          className={`ts-toggle-opt ${orderUnit === 'lot' ? 'active' : ''}`}
                          onClick={() => { setOrderUnit('lot'); setOrderQty(1); setQtyInput('1'); }}
                          suppressHydrationWarning
                        >LOT</button>
                      </div>
                    </div>
                  </div>

                  {/* Lot Info summary */}
                  <div className="ts-info-cards-wrap">
                    <div className="ts-info-cards">
                      <div className="ts-info-card"><div className="ts-ic-label">Lot Size</div><div className="ts-ic-val">{lotSize}</div></div>
                      <div className="ts-info-card"><div className="ts-ic-label">Max Lots</div><div className="ts-ic-val">--</div></div>
                      <div className="ts-info-card"><div className="ts-ic-label">Order Lots</div><div className="ts-ic-val">{orderUnit === 'lot' ? orderQty : '--'}</div></div>
                      <div className="ts-info-card"><div className="ts-ic-label">Total Qty</div><div className="ts-ic-val">{totalQty}</div></div>
                    </div>
                  </div>

                  {/* Stepper Card */}
                  <div className="ts-qty-container">
                    <div className="ts-section-label">{orderUnit === 'lot' ? 'Lot' : 'Quantity'}</div>
                    <div className="ts-qty-stepper">
                      <button className="ts-qty-btn" onClick={() => stepQty(-1)} suppressHydrationWarning><i className="fas fa-minus"></i></button>
                      <input
                        className="ts-qty-val"
                        type="number"
                        value={qtyInput}
                        onChange={e => handleQtyChange(e.target.value)}
                        onBlur={() => {
                          if (!qtyInput || parseInt(qtyInput) < 1) setQtyInput(String(orderQty));
                        }}
                        suppressHydrationWarning
                      />
                      <button className="ts-qty-btn" onClick={() => stepQty(1)} suppressHydrationWarning><i className="fas fa-plus"></i></button>
                    </div>
                    <div className="ts-qty-hint">
                      {orderUnit === 'lot' ? `${orderQty} Lots` : `${orderQty} Qty`}
                    </div>
                  </div>

                  {/* Order Type pills */}
                  <div className="ts-section-card">
                    <div className="ts-section-label">Order Type</div>
                    <div className="ts-pill-group">
                      {(['MARKET', 'LIMIT', 'SLM', 'GTT'] as OrderType[]).map(type => (
                        <button
                          key={type}
                          className={`ts-pill ${orderType === type ? 'active' : ''}`}
                          onClick={() => setOrderType(type)}
                        >{type}</button>
                      ))}
                    </div>
                  </div>

                  {/* Limit Price Input Card */}
                  {(orderType === 'LIMIT' || orderType === 'GTT') && (
                    <div className="ts-section-card">
                      <div className="ts-section-label">Price <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
                      <input
                        type="number"
                        placeholder="0.00"
                        className="price-input"
                        style={{ width: '100%', boxSizing: 'border-box', borderRadius: '12px', padding: '12px 14px', fontSize: '1rem', fontWeight: 700, border: '1px solid #E5E7EB', background: 'var(--card-bg)' }}
                        value={limitPrice}
                        onChange={(e) => setLimitPrice(e.target.value)}
                        suppressHydrationWarning
                      />
                    </div>
                  )}

                  {/* Trigger Price Card */}
                  {orderType === 'SLM' && (
                    <div className="ts-section-card">
                      <div className="ts-section-label">Trigger Price <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
                      <input
                        type="number"
                        placeholder="0.00"
                        className="price-input"
                        style={{ width: '100%', boxSizing: 'border-box', borderRadius: '12px', padding: '12px 14px', fontSize: '1rem', fontWeight: 700, border: '1px solid #E5E7EB', background: 'var(--card-bg)' }}
                        value={triggerPrice}
                        onChange={e => setTriggerPrice(e.target.value)}
                        suppressHydrationWarning
                      />
                    </div>
                  )}

                  {/* SL / TP inputs for GTT order */}
                  {orderType === 'GTT' && (
                    <div className="ts-section-card">
                      <div className="ts-section-label">SL / Limit / Target</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'row', gap: '12px' }}>
                          <div style={{ flex: 1 }}>
                            <div className="ts-section-label">Stop Loss <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
                            <input
                              type="number"
                              placeholder="0.00"
                              className="price-input"
                              value={slPrice}
                              onChange={e => setSlPrice(e.target.value)}
                              style={{ width: '100%', boxSizing: 'border-box', borderRadius: '12px', padding: '12px 14px', fontSize: '1rem', fontWeight: 700, border: '1px solid #E5E7EB', background: 'var(--card-bg)' }}
                              suppressHydrationWarning
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <div className="ts-section-label">Target <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
                            <input
                              type="number"
                              placeholder="0.00"
                              className="price-input"
                              value={tpPrice}
                              onChange={e => setTpPrice(e.target.value)}
                              style={{ width: '100%', boxSizing: 'border-box', borderRadius: '12px', padding: '12px 14px', fontSize: '1rem', fontWeight: 700, border: '1px solid #E5E7EB', background: 'var(--card-bg)' }}
                              suppressHydrationWarning
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Product Type Card */}
                  <div className="ts-section-card">
                    <div className="ts-section-label">Product Type</div>
                    <div className="ts-pill-group">
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

                  {/* Margin Info Card */}
                  <div className="ts-margin-card">
                    <div className="ts-margin-row">
                      <span className="ts-ml">Available</span>
                      <span className="ts-mv avail">₹ 30,670.32</span>
                    </div>
                    <div className="ts-margin-row">
                      <span className="ts-ml">Required Margin</span>
                      <span className="ts-mv required">₹ {calculatedRequiredMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="ts-margin-row">
                      <span className="ts-ml">Carry Charges</span>
                      <span className="ts-mv carry">₹ 0.00</span>
                    </div>
                  </div>
                  <div style={{ height: '8px' }}></div>
                </div>
              </div>

              {/* Sticky Execution Button */}
              <div className="ts-sticky-footer visible" style={{ flexShrink: 0 }}>
                {sheetSide === 'BUY' ? (
                  <button
                    className="ts-btn ts-btn-buy"
                    disabled={placingOrder}
                    onClick={() => handlePlaceOrder('BUY')}
                  >
                    {placingOrder ? 'PLACING...' : activePos?.side === 'SELL' ? 'EXIT SELL' : 'BUY'}
                  </button>
                ) : (
                  <button
                    className="ts-btn ts-btn-sell"
                    disabled={placingOrder}
                    onClick={() => handlePlaceOrder('SELL')}
                  >
                    {placingOrder ? 'PLACING...' : activePos?.side === 'BUY' ? 'EXIT BUY' : 'SELL'}
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {/* Order Entry Sheet */}

      {/* Order Entry Sheet removed — expiry-half-sheet handles all order entry */}

      <div className={`pos-toast${toast.visible ? ' show' : ''}`} style={{
        position: 'fixed', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
        background: toast.isError ? '#C62E2E' : '#2C8E5A', color: '#fff',
        padding: '12px 24px', borderRadius: '40px', fontWeight: '600', zIndex: 9999,
        boxShadow: '0 4px 20px rgba(0,0,0,0.2)', opacity: toast.visible ? 1 : 0,
        visibility: toast.visible ? 'visible' : 'hidden', transition: 'all 0.3s ease'
      }}>
        {toast.msg}
      </div>

      <TradingSegmentsDrawer
        isOpen={isSegmentsOpen}
        onClose={() => setIsSegmentsOpen(false)}
        onSelect={(item) => {
          if (item.segment.includes('Options')) {
            const newSymbol = item.name.split(' ')[0];
            router.push(`/option-chain?symbol=${newSymbol}`);
            setIsSegmentsOpen(false);
          }
        }}
      />
    </div>
  );
}

export default function OptionChainPage() {
  return (
    <Suspense fallback={<div className="loading-state">Loading...</div>}>
      <OptionChainContent />
    </Suspense>
  );
}
