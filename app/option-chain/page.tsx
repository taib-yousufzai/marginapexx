'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOrderEntry, OrderSide, OrderType, ProductType } from '@/hooks/useOrderEntry';
import { useKiteQuotes } from '@/hooks/useKiteQuotes';
import OptionChainTable from './OptionChainTable';
import { kiteLogin } from '@/lib/kiteClient';
import Footer from '@/components/Footer';

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
  const [showToast, setShowToast] = useState<{ msg: string, isError: boolean } | null>(null);

  const [data, setData] = useState<{
    expiries: string[];
    strikes: any[];
    expiry: string;
  } | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Normalization for MIDCAP
  const normalizedSymbol = symbol === 'MIDCAP' ? 'MIDCPNIFTY' : symbol;

  // Fetch initial option chain data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const url = `/api/market/option-chain?symbol=${normalizedSymbol}${selectedExpiry ? `&expiry=${selectedExpiry}` : ''}`;
        const res = await fetch(url);
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          if (json.success) {
            setData(json);
            if (!selectedExpiry) setSelectedExpiry(json.expiry);
          } else {
            console.error('API returned success: false', json);
          }
        } catch (parseError) {
          console.error('Failed to parse option chain JSON. Response:', text.substring(0, 200));
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
    
    // Start with the underlying index to ensure it's fetched first (priority)
    const underlyingId = symbol === 'NIFTY' ? 'NSE:NIFTY 50' : 
                         symbol === 'BANKNIFTY' ? 'NSE:NIFTY BANK' : 
                         symbol === 'FINNIFTY' ? 'NSE:NIFTY FIN SERVICE' : 
                         symbol === 'MIDCAP' || symbol === 'MIDCPNIFTY' ? 'NSE:NIFTY MID SELECT' :
                         symbol === 'SENSEX' ? 'BSE:SENSEX' :
                         symbol === 'BANKEX' ? 'BSE:BANKEX' : null;

    const ids: string[] = underlyingId ? [underlyingId] : [];

    // Add options
    data.strikes.forEach(s => {
      if (s.ce?.id) ids.push(s.ce.id);
      if (s.pe?.id) ids.push(s.pe.id);
    });
    
    return ids;
  }, [data, symbol]);

  const { quotes, connected, loading: quotesLoading } = useKiteQuotes(instrumentIds, 2000);

  const underlyingId = symbol === 'NIFTY' ? 'NSE:NIFTY 50' : 
                       symbol === 'BANKNIFTY' ? 'NSE:NIFTY BANK' : 
                       symbol === 'FINNIFTY' ? 'NSE:NIFTY FIN SERVICE' : 
                       symbol === 'MIDCAP' || symbol === 'MIDCPNIFTY' ? 'NSE:NIFTY MID SELECT' :
                       symbol === 'SENSEX' ? 'BSE:SENSEX' :
                       symbol === 'BANKEX' ? 'BSE:BANKEX' : null;
  
  const spotPrice = underlyingId ? quotes[underlyingId]?.lastPrice || 0 : 0;
  const spotChange = underlyingId ? quotes[underlyingId]?.changePercent || 0 : 0;

  const handleTrade = (instrSymbol: string, side: 'BUY' | 'SELL') => {
    const strikeMatch = data?.strikes.find(s => s.ce?.symbol === instrSymbol || s.pe?.symbol === instrSymbol);
    if (strikeMatch) {
        const type = strikeMatch.ce?.symbol === instrSymbol ? 'CE' : 'PE';
        setSelectedContract({ symbol: instrSymbol, type, strike: strikeMatch.strike });
        const defaultQty = symbol === 'NIFTY' ? 50 : (symbol === 'BANKNIFTY' ? 15 : (symbol === 'SENSEX' ? 10 : 25));
        setOrderQty(defaultQty);
    }
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
      setShowToast({ msg: `✅ ${side} Order Executed!`, isError: false });
      setSelectedContract(null);
    } else {
      setShowToast({ msg: `❌ Failed: ${result.error}`, isError: true });
    }

    setTimeout(() => setShowToast(null), 3000);
  };

  const strikes = data?.strikes || [];

  const handleKiteLogin = async () => {
    try {
        await kiteLogin();
    } catch (err) {
        console.error('Kite login failed', err);
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
                <button
                  className={`oc-mode-btn${priceMode === 'BA' ? ' active' : ''}`}
                  onClick={() => setPriceMode('BA')}
                >B/A</button>
                <button
                  className={`oc-mode-btn${priceMode === 'LTP' ? ' active' : ''}`}
                  onClick={() => setPriceMode('LTP')}
                >LTP</button>
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
                    {strikes.length === 0 ? (
                        <div className="no-data-state">
                            <i className="fas fa-search"></i>
                            <p>No options found for {symbol}</p>
                            <p className="sub">Try syncing instruments or check the symbol name.</p>
                        </div>
                    ) : (
                        <>
                          {/* Single combined popup */}
                          <div className={`expiry-half-drawer-overlay ${selectedContract ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setSelectedContract(null); }}>
                            <div className={`expiry-half-sheet detail-sheet ${selectedContract ? 'open' : ''}`}>
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
                                      <div className="os-section-lbl"><i className="fas fa-layer-group"></i> ORDER TYPE</div>
                                      <div className="os-type-btns">
                                        {(['MARKET', 'LIMIT'] as OrderType[]).map(t => (
                                          <button key={t} className={`os-type-btn${orderType === t ? ' active' : ''}`} onClick={() => setOrderType(t)}>{t}</button>
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

                          {/* Toast Notification */}
                          {showToast && (
                            <div className={`toast-msg ${showToast.isError ? 'error' : ''}`}>
                              {showToast.msg}
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
        </div>
      </main>

      <style jsx>{`
        .oc-app-container {
          display: flex;
          flex-direction: column;
          height: 100dvh;
          width: 100%;
          background: var(--bg-body);
          position: relative;
          overflow: hidden;
        }

        .header-wrapper, .content-wrapper {
            width: 100%;
            max-width: 1100px;
            margin: 0 auto;
        }

        .app-header {
          background: var(--bg-body);
          padding: 12px 10px 0 10px;
          flex-shrink: 0;
          z-index: 30;
        }

        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .back-icon {
          color: var(--text-primary);
          font-size: 1.1rem;
          cursor: pointer;
        }

        .user-profile {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
        }

        .avatar-img {
          width: 34px;
          height: 34px;
          background: #2A2A2A;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.9rem;
          color: #A0A0A0;
          border: none;
        }

        .user-name {
          font-weight: 800;
          font-size: 1.05rem;
          color: #4ade80;
          letter-spacing: 0.5px;
        }

        .header-actions i {
          font-size: 1.2rem;
          color: var(--text-primary);
          cursor: pointer;
        }

        .index-info-area {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 8px;
        }

        .index-title-col {
          display: flex;
          flex-direction: column;
        }

        .index-label {
          font-size: 0.65rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 1px;
          margin-bottom: 4px;
        }

        .index-name {
          font-weight: 800;
          font-size: 2.2rem;
          color: var(--text-primary);
          line-height: 1;
          margin: 0;
          letter-spacing: -1px;
        }

        .index-price-col {
          text-align: right;
        }

        .index-price-val {
          font-weight: 800;
          font-size: 1.5rem;
          color: var(--text-primary);
          font-family: 'Inter', sans-serif;
          line-height: 1.2;
        }

        .index-price-chg {
          font-size: 0.8rem;
          font-weight: 700;
        }
        .pos { color: #22c55e; }
        .neg { color: #ef4444; }

        .main-content {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          scrollbar-width: none;
        }
        .main-content::-webkit-scrollbar { display: none; }

        .expiry-strip {
          padding: 4px 10px 10px 10px;
          position: sticky;
          top: 0;
          z-index: 20;
          background: var(--bg-body);
        }

        /* ── Capsule bar: Spot + Dates ── */
        .expiry-capsule-bar {
          display: flex;
          align-items: center;
          background: #fff;
          border: 1px solid #e8eaf0;
          border-radius: 9999px;
          padding: 5px 5px 5px 14px;
          gap: 0;
          box-shadow: 0 2px 10px rgba(0,0,0,0.05);
          min-width: 0;
        }

        .dark .expiry-capsule-bar {
          background: #1e1e1e;
          border-color: #2a2a2a;
          box-shadow: 0 2px 10px rgba(0,0,0,0.3);
        }

        /* Spot price section — always visible, never scrolls */
        .expiry-spot-inner-capsule {
          flex-shrink: 0;
          background: transparent;
          border-radius: 9999px;
          padding: 0;
        }

        .expiry-spot-pill {
          display: flex;
          align-items: baseline;
          gap: 5px;
          flex-shrink: 0;
          padding: 5px 14px 5px 4px;
        }

        .expiry-spot-label {
          font-size: 0.8rem;
          font-weight: 600;
          color: #555;
        }

        .expiry-spot-val {
          font-size: 1.05rem;
          font-weight: 800;
          color: #C62E2E;
        }

        .dark .expiry-spot-label { color: #888; }
        .dark .expiry-spot-val { color: #C62E2E; }

        /* Vertical divider — always visible */
        .expiry-divider {
          width: 1px;
          height: 28px;
          background: #e8eaf0;
          margin: 0 8px;
          flex-shrink: 0;
        }

        .dark .expiry-divider {
          background: #333;
        }

        /* Scrollable dates area — only this part scrolls */
        .expiry-dates-inner-capsule {
          width: fit-content;
          max-width: 100%;
          min-width: 0;
          margin-left: auto;
          background: #f0f2f5;
          border: 1px solid #e8eaf0;
          border-radius: 9999px;
          padding: 3px;
          overflow: hidden;
        }

        .dark .expiry-dates-inner-capsule {
          background: #2a2a2a;
          border-color: #3a3a3a;
        }

        .expiry-dates-scroll {
          display: flex;
          align-items: center;
          gap: 2px;
          overflow-x: auto;
          scrollbar-width: none;
        }
        .expiry-dates-scroll::-webkit-scrollbar { display: none; }

        /* Individual date button */
        .expiry-date-btn {
          flex-shrink: 0;
          padding: 7px 16px;
          border-radius: 9999px;
          font-size: 0.8rem;
          font-weight: 700;
          border: none;
          cursor: pointer;
          background: transparent;
          color: #1a1a1a;
          transition: all 0.2s ease;
          font-family: inherit;
          white-space: nowrap;
        }

        .expiry-date-btn.active {
          background: #C62E2E;
          color: #fff;
          box-shadow: 0 3px 10px rgba(198, 46, 46, 0.35);
        }

        .dark .expiry-date-btn {
          color: #aaa;
        }

        .dark .expiry-date-btn.active {
          background: #C62E2E;
          color: #fff;
        }

        /* PREMIUM UI ELEMENTS */
        .premium-header {
          padding: 12px 10px 8px 10px;
          background: var(--bg-body);
        }

        /* ── Capsule Header ── */
        .oc-capsule-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #fff;
          border: 1px solid #e8eaf0;
          border-radius: 9999px;
          padding: 10px 14px 10px 10px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.06);
        }

        .dark .oc-capsule-header {
          background: #1e1e1e;
          border-color: #2a2a2a;
          box-shadow: 0 2px 16px rgba(0,0,0,0.4);
        }

        .oc-capsule-left {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          min-width: 0;
        }

        .oc-capsule-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }

        .oc-capsule-sub {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }

        .oc-capsule-right {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        /* ── B/A + LTP Toggle ── */
        .oc-mode-toggle {
          display: flex;
          align-items: center;
          background: #f0f2f5;
          border-radius: 9999px;
          padding: 3px;
          gap: 2px;
          border: 1px solid #e8eaf0;
        }

        .dark .oc-mode-toggle {
          background: #2a2a2a;
          border-color: #3a3a3a;
        }

        .oc-mode-btn {
          padding: 6px 16px;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 800;
          border: none;
          cursor: pointer;
          background: transparent;
          color: #6b7280;
          transition: all 0.2s ease;
          letter-spacing: 0.3px;
          font-family: inherit;
        }

        .oc-mode-btn.active {
          background: #C62E2E;
          color: #fff;
          box-shadow: 0 2px 8px rgba(198, 46, 46, 0.35);
        }

        .dark .oc-mode-btn {
          color: #666;
        }

        .dark .oc-mode-btn.active {
          background: #C62E2E;
          color: #fff;
        }

        .premium-back-btn {
          width: 42px;
          height: 42px;
          background: var(--icon-bg, #f0f2f5);
          border: 1px solid #e8eaf0;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
          color: var(--text-primary);
          transition: all 0.2s ease;
        }
        .premium-back-btn:active {
          transform: scale(0.95);
        }

        .dark .premium-back-btn {
          background: #2a2a2a;
          border-color: #3a3a3a;
          color: #e0e0e0;
        }

        .premium-symbol-name {
          font-size: 1.5rem;
          font-weight: 800;
          color: #C62E2E;
          text-transform: uppercase;
          line-height: 1.1;
          letter-spacing: -0.5px;
        }

        .premium-spot-label {
          font-size: 0.6rem;
          font-weight: 700;
          color: var(--text-muted);
          letter-spacing: 1px;
        }

        .connecting-text {
          color: #9ca3af;
          font-size: 0.65rem;
          font-weight: 600;
        }

        .dark .connecting-text {
          color: #666;
        }

        .premium-badge {
          background: rgba(34, 197, 94, 0.12);
          color: #16a34a;
          padding: 3px 10px;
          border-radius: 12px;
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.5px;
          border: 1px solid rgba(34, 197, 94, 0.25);
          white-space: nowrap;
        }

        .dark .premium-badge {
          background: rgba(34, 197, 94, 0.12);
          color: #4ade80;
          border-color: rgba(34, 197, 94, 0.25);
        }

        .pulsing-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .pulsing-dot.connected {
          background: #4ade80;
          box-shadow: 0 0 10px rgba(74, 222, 128, 0.5);
          animation: pulse-green 2s infinite;
        }
        .pulsing-dot.connecting {
          background: #eab308;
          box-shadow: 0 0 10px rgba(234, 179, 8, 0.5);
          animation: pulse-yellow 1.5s infinite;
        }

        @keyframes pulse-green {
          0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(74, 222, 128, 0); }
          100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
        }
        @keyframes pulse-yellow {
          0% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0.4); }
          70% { box-shadow: 0 0 0 6px rgba(234, 179, 8, 0); }
          100% { box-shadow: 0 0 0 0 rgba(234, 179, 8, 0); }
        }

        .premium-expiry-badge {
          background: linear-gradient(90deg, #22c55e 0%, #16a34a 100%);
          color: #000;
          font-size: 0.6rem;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 6px;
          box-shadow: 0 2px 8px rgba(34, 197, 94, 0.3);
        }

        .premium-spot-price {
          font-size: 1.35rem;
          font-weight: 800;
          color: var(--text-primary);
          line-height: 1;
        }
        
        .premium-spot-change {
          font-size: 0.8rem;
          font-weight: 800;
        }
        .premium-spot-change.pos { color: #22c55e; }
        .premium-spot-change.neg { color: #ef4444; }

        .oc-table-wrapper {
          flex: 1;
          padding: 0 10px 80px 10px;
        }

        .loading-state, .no-data-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 80px 40px;
            text-align: center;
        }

        .red-spinner {
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: conic-gradient(from 0deg, transparent 0%, transparent 40%, #ef4444 100%);
            -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 4px));
            mask: radial-gradient(farthest-side, transparent calc(100% - 4px), black calc(100% - 4px));
            animation: spin 1s linear infinite;
            margin-bottom: 24px;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-state p {
            font-weight: 800;
            color: var(--text-primary);
            font-size: 1.1rem;
            margin: 0;
            letter-spacing: 0.5px;
        }

        .no-data-state i {
            font-size: 3rem;
            color: var(--border-light);
            margin-bottom: 20px;
        }
        .no-data-state p {
            font-weight: 800;
            font-size: 1.1rem;
            color: var(--text-primary);
            margin: 0 0 8px;
        }
        .no-data-state .sub {
            font-size: 0.8rem;
            color: var(--text-muted);
            font-weight: 500;
        }

        .detail-sheet {
            background: var(--card-bg);
            border-top-left-radius: 24px;
            border-top-right-radius: 24px;
            padding: 0 0 0;
            position: fixed;
            bottom: -100%;
            left: 0;
            right: 0;
            width: 100%;
            max-width: 100%;
            margin-bottom: 0 !important;
            border-bottom: none !important;
            z-index: 1001;
            transition: bottom 0.3s cubic-bezier(0.25, 1, 0.5, 1);
            display: flex;
            flex-direction: column;
            box-shadow: 0 -10px 40px rgba(0,0,0,0.15);
        }

        .detail-sheet.open {
            bottom: 0;
        }

        /* ── Order Sheet — watchlist style ── */
        .os-handle { display: flex; justify-content: center; padding: 10px 0 6px; }
        .os-handle-bar { width: 40px; height: 4px; background: var(--border-card); border-radius: 4px; }

        .os-sheet-header { padding: 14px 16px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; gap: 10px; }
        .os-back-btn { background: var(--icon-bg); border: none; width: 34px; height: 34px; border-radius: 50%; font-size: 0.9rem; cursor: pointer; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .os-sheet-left { flex: 1; }
        .os-sheet-name { font-size: 1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px; }
        .os-sheet-segment { display: inline-block; font-size: 0.6rem; font-weight: 600; color: #C62E2E; background: #FEF0F0; padding: 3px 10px; border-radius: 20px; }
        .os-sheet-right { text-align: right; }
        .os-cmp-label { font-size: 0.55rem; color: var(--text-muted); text-transform: uppercase; }
        .os-cmp-val { font-size: 1.2rem; font-weight: 800; color: var(--text-primary); }
        .os-cmp-chg { font-size: 0.65rem; font-weight: 600; padding: 2px 8px; border-radius: 30px; display: inline-block; margin-top: 2px; }
        .os-cmp-chg.pos { color: #2C8E5A; background: #E9F6EF; }
        .os-cmp-chg.neg { color: #C62E2E; background: #FEF0F0; }

        .os-bidask { background: var(--card-alt-bg); margin: 10px 16px; padding: 10px 16px; border-radius: 20px; display: flex; justify-content: space-between; align-items: center; }
        .os-ba-col { flex: 1; text-align: center; }
        .os-ba-label { font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; margin-bottom: 3px; }
        .os-ba-val { font-size: 1rem; font-weight: 700; }
        .os-ba-val.pos { color: #2C8E5A; }
        .os-ba-val.neg { color: #C62E2E; }
        .os-ba-divider { width: 1px; height: 32px; background: var(--border-light); margin: 0 8px; }

        .os-actions { padding: 4px 16px calc(16px + env(safe-area-inset-bottom, 0px)); display: flex; gap: 10px; }
        .os-btn-buy, .os-btn-sell { flex: 1; padding: 14px; border: none; border-radius: 40px; font-size: 0.9rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-family: inherit; transition: 0.15s; }
        .os-btn-buy { background: #2C8E5A; color: white; }
        .os-btn-sell { background: #C62E2E; color: white; }
        .os-btn-buy:active, .os-btn-sell:active { transform: scale(0.97); }
        .os-btn-buy:disabled, .os-btn-sell:disabled { opacity: 0.6; cursor: not-allowed; }

        /* ── Quantity + Order/Product type — watchlist style ── */
        .os-qty-section { background: var(--card-alt-bg); padding: 10px 14px; border-radius: 18px; margin: 0 16px 12px; }
        .os-qty-label { font-size: 0.7rem; font-weight: 500; color: var(--text-muted); margin-bottom: 8px; }
        .os-qty-control { display: flex; align-items: center; justify-content: space-between; background: var(--card-bg); border-radius: 40px; padding: 3px; border: 1px solid var(--border-light); }
        .os-qty-btn { width: 38px; height: 38px; background: var(--icon-bg); border: none; border-radius: 30px; font-size: 1rem; font-weight: 600; color: #C62E2E; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .os-qty-btn:active { opacity: 0.7; }
        .os-qty-input { flex: 1; text-align: center; font-size: 1rem; font-weight: 700; border: none; outline: none; background: transparent; color: var(--text-primary); font-family: inherit; }

        .os-type-section { background: var(--card-alt-bg); padding: 10px 14px; border-radius: 18px; margin: 0 16px 12px; }
        .os-section-lbl { font-size: 0.7rem; font-weight: 500; color: var(--text-muted); margin-bottom: 10px; display: flex; align-items: center; gap: 6px; }
        .os-type-btns { display: flex; gap: 8px; }
        .os-type-btn { flex: 1; padding: 8px; border: 1px solid var(--border-light); background: var(--card-bg); border-radius: 30px; font-size: 0.7rem; font-weight: 600; cursor: pointer; text-align: center; color: var(--text-secondary); font-family: inherit; transition: 0.15s; }
        .os-type-btn.active { background: #C62E2E; color: white; border-color: #C62E2E; }
        .os-price-input { width: 100%; margin-top: 10px; padding: 10px; border-radius: 30px; border: 1px solid var(--border-light); font-size: 0.85rem; background: var(--card-bg); color: var(--text-primary); outline: none; font-family: inherit; box-sizing: border-box; }
        .oc-order-fullpage { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: var(--container-bg); z-index: 2001; display: flex; flex-direction: column; overflow-y: auto; animation: oc-slide-in 0.3s ease; }
        @keyframes oc-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }

        .oc-order-header { padding: 14px 18px; border-bottom: 1px solid var(--border-light); display: flex; align-items: center; justify-content: space-between; background: var(--container-bg); position: sticky; top: 0; z-index: 10; }
        .oc-back-icon { background: var(--icon-bg); border: none; width: 36px; height: 36px; border-radius: 30px; font-size: 1rem; cursor: pointer; color: var(--text-secondary); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 10px; }
        .oc-order-script-info { flex: 1; }
        .oc-order-name { font-size: 1.1rem; font-weight: 800; color: var(--text-primary); margin-bottom: 4px; }
        .oc-order-segment { font-size: 0.65rem; color: #C62E2E; background: #FEF0F0; padding: 3px 10px; border-radius: 20px; display: inline-block; }
        .oc-order-right { text-align: right; }
        .oc-order-cmp { font-size: 1.2rem; font-weight: 800; color: var(--text-primary); }
        .oc-order-chg { font-size: 0.65rem; font-weight: 600; padding: 2px 8px; border-radius: 30px; display: inline-block; margin-top: 2px; }
        .oc-order-chg.pos { color: #2C8E5A; background: #E9F6EF; }
        .oc-order-chg.neg { color: #C62E2E; background: #FEF0F0; }
        .oc-order-bidask-mini { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
        .oc-ba-mini { font-size: 0.6rem; background: var(--card-alt-bg); padding: 3px 8px; border-radius: 20px; display: flex; gap: 4px; }
        .oc-ba-mini-lbl { color: var(--text-muted); }

        .oc-order-content { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
        .oc-order-section { background: var(--card-alt-bg); padding: 10px 14px; border-radius: 18px; }
        .oc-order-section-lbl { font-size: 0.7rem; font-weight: 500; color: var(--text-muted); margin-bottom: 8px; }
        .oc-qty-control { display: flex; align-items: center; justify-content: space-between; background: var(--card-bg); border-radius: 40px; padding: 3px; border: 1px solid var(--border-light); }
        .oc-qty-btn { width: 38px; height: 38px; background: var(--icon-bg); border: none; border-radius: 30px; font-size: 1rem; font-weight: 600; color: #C62E2E; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .oc-qty-input { flex: 1; text-align: center; font-size: 1rem; font-weight: 700; border: none; outline: none; background: transparent; color: var(--text-primary); font-family: inherit; }
        .oc-type-btns { display: flex; gap: 8px; flex-wrap: wrap; }
        .oc-type-btn { flex: 1; min-width: 70px; padding: 8px; border: 1px solid var(--border-light); background: var(--card-bg); border-radius: 30px; font-size: 0.7rem; font-weight: 600; cursor: pointer; text-align: center; color: var(--text-secondary); font-family: inherit; }
        .oc-type-btn.active { background: #C62E2E; color: white; border-color: #C62E2E; }
        .oc-price-input { width: 100%; margin-top: 10px; padding: 10px; border-radius: 30px; border: 1px solid var(--border-light); font-size: 0.85rem; background: var(--card-bg); color: var(--text-primary); outline: none; font-family: inherit; box-sizing: border-box; }
        .oc-order-actions { display: flex; gap: 12px; margin-top: 4px; }
        .oc-confirm-buy, .oc-confirm-sell { flex: 1; padding: 14px; border: none; border-radius: 40px; font-size: 0.9rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-family: inherit; transition: 0.15s; color: white; }
        .oc-confirm-buy { background: #2C8E5A; }
        .oc-confirm-sell { background: #C62E2E; }
        .oc-confirm-buy:active, .oc-confirm-sell:active { transform: scale(0.97); }
        .oc-confirm-buy:disabled, .oc-confirm-sell:disabled { opacity: 0.6; cursor: not-allowed; }

        .detail-header {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 24px;
        }

        .detail-back-btn {
            background: var(--card-alt-bg);
            border: 1px solid var(--border-card);
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--text-primary);
            cursor: pointer;
            font-size: 1rem;
        }

        .detail-title-area {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .detail-title-area h3 {
            font-size: 1.1rem;
            font-weight: 800;
            color: var(--text-primary);
            margin: 0;
            line-height: 1.2;
        }

        .detail-tag {
            font-size: 0.65rem;
            font-weight: 800;
            color: #c62e2e;
        }

        .detail-price-area {
            text-align: right;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 2px;
        }

        .cmp-label {
            font-size: 0.55rem;
            font-weight: 800;
            color: var(--text-muted);
        }

        .cmp-val {
            font-size: 1.3rem;
            font-weight: 800;
            color: var(--text-primary);
            line-height: 1;
            font-family: 'Inter', sans-serif;
        }

        .cmp-chg {
            font-size: 0.75rem;
            font-weight: 700;
        }

        .detail-box {
            border: 1px solid var(--border-card);
            border-radius: 16px;
            background: transparent;
            padding: 16px;
            margin-bottom: 20px;
        }

        .bid-ask-box {
            display: flex;
            align-items: center;
        }

        .ba-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
        }

        .ba-label {
            font-size: 0.65rem;
            font-weight: 800;
            color: var(--text-muted);
        }

        .ba-val {
            font-size: 1.1rem;
            font-weight: 800;
            font-family: 'Inter', sans-serif;
        }

        .ba-divider {
            width: 1px;
            height: 40px;
            background: var(--border-card);
        }

        .detail-section-title {
            font-size: 0.7rem;
            font-weight: 800;
            color: var(--text-secondary);
            margin-bottom: 12px;
            text-transform: uppercase;
        }

        .ohlc-box {
            display: flex;
            justify-content: space-between;
        }

        .ohlc-col {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 6px;
        }

        .ohlc-label {
            font-size: 0.65rem;
            font-weight: 800;
            color: var(--text-muted);
        }

        .ohlc-val {
            font-size: 0.85rem;
            font-weight: 800;
            color: var(--text-primary);
            font-family: 'Inter', sans-serif;
        }

        .date-box {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 16px;
        }

        .date-left {
            font-size: 0.7rem;
            font-weight: 800;
            color: var(--text-muted);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .date-right {
            font-size: 0.85rem;
            font-weight: 800;
            color: var(--text-primary);
        }

        .detail-actions {
            display: flex;
            gap: 16px;
            margin-top: 8px;
        }

        .btn-buy, .btn-sell {
            flex: 1;
            padding: 16px;
            border-radius: 30px;
            border: none;
            font-size: 1rem;
            font-weight: 800;
            color: white;
            cursor: pointer;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 8px;
            transition: transform 0.1s;
        }

        .btn-buy { background: #1B8751; box-shadow: 0 4px 12px rgba(27, 135, 81, 0.3); }
        .btn-sell { background: #C62E2E; box-shadow: 0 4px 12px rgba(198, 46, 46, 0.3); }
        .btn-buy:active, .btn-sell:active { transform: scale(0.96); }

        .toast-msg {
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: #1A1A1A;
            color: white;
            padding: 12px 24px;
            border-radius: 50px;
            font-size: 0.85rem;
            font-weight: 600;
            z-index: 2000;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
            white-space: nowrap;
        }
        .toast-msg.error { background: #c62e2e; }
        
        :global(body.dark) .user-name { color: #4ade80; }
        :global(body.dark) .index-price-chg.pos { color: #4ade80; }
      `}</style>
      <Footer activeTab="home" />
    </div>
  );
}

export default function OptionChainPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OptionChainContent />
    </Suspense>
  );
}
