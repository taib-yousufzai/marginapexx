'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOrderEntry, OrderSide, OrderType, ProductType } from '@/hooks/useOrderEntry';
import { useKiteQuotes } from '@/hooks/useKiteQuotes';
import OptionChainTable from './OptionChainTable';
import Footer from '@/components/Footer';
import TradingSegmentsDrawer from '@/components/TradingSegmentsDrawer';
import './option-chain.css';

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
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [productType, setProductType] = useState<ProductType>('INTRADAY');
  const [limitPrice, setLimitPrice] = useState('');

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

  const [data, setData] = useState<{
    expiries: string[];
    strikes: any[];
    expiry: string;
  } | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSegmentsOpen, setIsSegmentsOpen] = useState(false);

  // Normalization for MIDCAP
  const normalizedSymbol = symbol === 'MIDCAP' ? 'MIDCPNIFTY' : symbol;

  // Fetch initial option chain data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setData(null);
      try {
        const url = `/api/market/option-chain?symbol=${normalizedSymbol}${selectedExpiry ? `&expiry=${selectedExpiry}` : ''}`;
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (json.success) {
            setData(json);
            if (!selectedExpiry) setSelectedExpiry(json.expiry);
          }
        }
      } catch (err) {
        console.error('Failed to fetch option chain', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [normalizedSymbol, selectedExpiry]);

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
      const defaultQty = symbol === 'NIFTY' ? 50 : (symbol === 'BANKNIFTY' ? 15 : (symbol === 'SENSEX' ? 10 : 25));
      setOrderQty(defaultQty);
    }
  };

  const closeTradeSheet = () => {
    setSelectedContract(null);
  };

  const handlePlaceOrder = async (side: OrderSide) => {
    if (!selectedContract) return;
    const kiteId = data?.strikes.find(s => s.ce?.symbol === selectedContract.symbol || s.pe?.symbol === selectedContract.symbol)?.[selectedContract.type.toLowerCase()]?.id;
    const currentPrice = kiteId ? (quotes[kiteId]?.lastPrice || 0) : 0;
    const result = await placeOrder({
      symbol: selectedContract.symbol,
      kite_instrument: kiteId || selectedContract.symbol,
      segment: symbol.includes('SENSEX') || symbol.includes('BANKEX') ? 'BFO' : 'NFO',
      side,
      qty: orderQty,
      lots: 0,
      order_type: orderType,
      product_type: productType,
      client_price: orderType === 'LIMIT' ? parseFloat(limitPrice) : currentPrice
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
      `}</style>

      {/* Contract Order Sheet — outside all overflow/transform containers so position:fixed works */}
      <div
        className={`expiry-half-drawer-overlay${selectedContract ? ' active' : ''}`}
        onClick={(e) => { if (e.target === e.currentTarget) setSelectedContract(null); }}
      >
        <div className="expiry-half-sheet">
          {selectedContract && (() => {
                          const kiteId = data?.strikes.find(s => s.ce?.symbol === selectedContract.symbol || s.pe?.symbol === selectedContract.symbol)?.[selectedContract.type.toLowerCase()]?.id;
                          const quote = kiteId ? quotes[kiteId] : null;
                          const ltp = quote ? quote.lastPrice : 0;
                          const chgPct = quote ? quote.changePercent : 0;
                          const bid = ltp > 0 ? ltp - 0.20 : 0;
                          const ask = ltp > 0 ? ltp + 0.20 : 0;
                          return (
                            <>
                              {/* Header with back arrow — watchlist style */}
                              <div className="os-sheet-header">
                                <button className="os-back-btn" onClick={() => setSelectedContract(null)}>
                                  <i className="fas fa-chevron-left"></i>
                                </button>
                                <div className="os-sheet-left">
                                  <div className="os-sheet-name">{selectedContract.strike.toLocaleString('en-IN')} {selectedContract.type}</div>
                                  <span className="os-sheet-segment">{selectedContract.symbol}</span>
                                </div>
                                <div className="os-sheet-right">
                                  <div className="os-cmp-label">CMP</div>
                                  <div className="os-cmp-val">{ltp > 0 ? `₹${ltp.toFixed(2)}` : '---'}</div>
                                  <div className={`os-cmp-chg ${chgPct < 0 ? 'neg' : 'pos'}`}>{chgPct > 0 ? '+' : ''}{chgPct.toFixed(2)}%</div>
                                </div>
                              </div>
                              {/* BID / ASK */}
                              <div className="os-bidask">
                                <div className="os-ba-col">
                                  <div className="os-ba-label">BID</div>
                                  <div className="os-ba-val pos">{bid > 0 ? bid.toFixed(2) : '---'}</div>
                                </div>
                                <div className="os-ba-divider"></div>
                                <div className="os-ba-col">
                                  <div className="os-ba-label">ASK</div>
                                  <div className="os-ba-val neg">{ask > 0 ? ask.toFixed(2) : '---'}</div>
                                </div>
                              </div>
                              {/* Quantity */}
                              <div className="os-qty-section">
                                <div className="os-qty-label">QUANTITY</div>
                                <div className="os-qty-control">
                                  <button className="os-qty-btn" onClick={() => setOrderQty(q => Math.max(1, q - 1))}><i className="fas fa-minus"></i></button>
                                  <input className="os-qty-input" type="number" value={orderQty} onChange={e => setOrderQty(Math.max(1, parseInt(e.target.value) || 1))} />
                                  <button className="os-qty-btn" onClick={() => setOrderQty(q => q + 1)}><i className="fas fa-plus"></i></button>
                                </div>
                              </div>
                              {/* Order Type */}
                              <div className="os-type-section">
                                <div className="os-section-lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <i className="fas fa-layer-group"></i> ORDER TYPE
                                  </span>
                                </div>
                                <div className="os-type-btns">
                                  {(['MARKET', 'LIMIT'] as OrderType[]).map(t => (
                                    <button key={t} className={`os-type-btn${orderType === t ? ' active' : ''}`} onClick={() => { setOrderType(t); }}>{t}</button>
                                  ))}
                                </div>
                                {orderType === 'LIMIT' && (
                                  <input className="os-price-input" type="number" placeholder="Limit Price (₹)" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} />
                                )}
                              </div>
                              {/* Product Type */}
                              <div className="os-type-section">
                                <div className="os-section-lbl"><i className="fas fa-clock"></i> PRODUCT TYPE</div>
                                <div className="os-type-btns">
                                  {(['INTRADAY', 'CARRY'] as ProductType[]).map(p => (
                                    <button key={p} className={`os-type-btn${productType === p ? ' active' : ''}`} onClick={() => setProductType(p)}>{p}</button>
                                  ))}
                                </div>
                              </div>
                              {/* BUY / SELL */}
                              <div className="os-actions">
                                <button className="os-btn-buy" onClick={() => { handlePlaceOrder('BUY'); setSelectedContract(null); }} disabled={placingOrder}>
                                  {placingOrder ? <i className="fas fa-circle-notch fa-spin"></i> : <><i className="fas fa-arrow-up"></i> BUY</>}
                                </button>
                                <button className="os-btn-sell" onClick={() => { handlePlaceOrder('SELL'); setSelectedContract(null); }} disabled={placingOrder}>
                                  {placingOrder ? <i className="fas fa-circle-notch fa-spin"></i> : <><i className="fas fa-arrow-down"></i> SELL</>}
                                </button>
                              </div>
                            </>
                          );
                        })()}
        </div>
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
