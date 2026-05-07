'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOrderEntry, OrderSide, OrderType, ProductType } from '@/hooks/useOrderEntry';
import { useKiteQuotes } from '@/hooks/useKiteQuotes';
import OptionChainTable from './OptionChainTable';
import { kiteLogin } from '@/lib/kiteClient';
import Footer from '@/components/Footer';
import TradingSegmentsDrawer from '@/components/TradingSegmentsDrawer';

function OptionChainContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const symbol = (searchParams.get('symbol') || 'NIFTY').toUpperCase();
  
  const { placeOrder, loading: placingOrder, error: orderError, setError: setOrderError } = useOrderEntry();
  const [selectedContract, setSelectedContract] = useState<{ symbol: string, type: 'CE' | 'PE', strike: number } | null>(null);
  const [orderQty, setOrderQty] = useState(25);
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [productType, setProductType] = useState<ProductType>('INTRADAY');
  const [limitPrice, setLimitPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [showToast, setShowToast] = useState<{ msg: string, isError: boolean } | null>(null);

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
      try {
        const url = `/api/market/option-chain?symbol=${normalizedSymbol}${selectedExpiry ? `&expiry=${selectedExpiry}` : ''}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.success) {
          setData(json);
          if (!selectedExpiry) setSelectedExpiry(json.expiry);
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
    // Find the strike and type from instrument symbol
    const strikeMatch = data?.strikes.find(s => s.ce?.symbol === instrSymbol || s.pe?.symbol === instrSymbol);
    if (strikeMatch) {
        const type = strikeMatch.ce?.symbol === instrSymbol ? 'CE' : 'PE';
        setSelectedContract({ symbol: instrSymbol, type, strike: strikeMatch.strike });
        // Set default quantity based on index
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

  return (
    <div className="oc-app-container">
      <div className="nav-bar-full">
        <div className="nav-group">
          <button className="back-btn" onClick={() => router.back()} style={{ background: 'var(--card-alt-bg)', border: '1px solid var(--border-light)', width: '36px', height: '36px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', cursor: 'pointer' }}>
            <i className="fas fa-arrow-left"></i>
          </button>
        </div>
        <div className="title-grp" style={{ textAlign: 'center' }}>
          <div className="nav-app-name" style={{ margin: 0 }}>{symbol}</div>
          <div className="status-row" style={{ justifyContent: 'center' }}>
            <span className="sub-tag">Option Chain</span>
            <div className={`status-indicator ${connected ? 'online' : 'offline'}`} title={connected ? 'Kite Live' : 'Kite Disconnected'}></div>
          </div>
        </div>
        <div className="nav-group">
          <div className="library-btn" onClick={() => setIsSegmentsOpen(true)} style={{ cursor: 'pointer', background: 'rgba(198,46,46,0.1)', color: '#C62E2E', border: '1px solid rgba(198,46,46,0.2)', padding: '5px 12px', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
            <i className="fas fa-folder"></i>
            <span>Library</span>
          </div>
          <div className="nav-icon-btn" onClick={() => router.push('/profile')}><i className="fas fa-user-cog"></i></div>
        </div>
      </div>

      <main className="main-content">
        <div className="content-wrapper">
            <div className="expiry-strip">
            <div className="strip-scroll">
                {data?.expiries.map(exp => {
                    // Use splitting to avoid timezone shifts from local interpretation
                    const [year, monthNum, dayNum] = exp.split('-').map(Number);
                    const dateObj = new Date(year, monthNum - 1, dayNum);
                    
                    const day = dateObj.getDate();
                    const month = dateObj.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase();
                    return (
                        <button 
                            key={exp}
                            className={`expiry-tab ${selectedExpiry === exp ? 'active' : ''}`}
                            onClick={() => setSelectedExpiry(exp)}
                        >
                            <span className="tab-day">{day}</span>
                            <span className="tab-month">{month}</span>
                        </button>
                    );
                })}
            </div>
            </div>

            <div className="oc-table-wrapper">
            {loading ? (
                <div className="loading-state">
                <div className="pulse-logo">
                    <i className="fas fa-circle-notch fa-spin"></i>
                </div>
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
                          {/* Order Entry Drawer */}
      <div className={`expiry-half-drawer-overlay ${selectedContract ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setSelectedContract(null); }}>
        <div className={`expiry-half-sheet order-sheet ${selectedContract ? 'open' : ''}`}>
          <div className="expiry-sheet-header">
            <div className="order-title">
              <span className={`type-badge ${selectedContract?.type}`}>{selectedContract?.type}</span>
              <div className="order-name-grp">
                <h3>{selectedContract?.strike} {selectedContract?.type}</h3>
                <p>{selectedContract?.symbol}</p>
              </div>
            </div>
            <div className="expiry-sheet-close" onClick={() => setSelectedContract(null)}><i className="fas fa-times"></i></div>
          </div>
          
          <div className="order-sheet-content">
            <div className="order-price-row">
              <div className="price-label">LTP</div>
              <div className="price-val">
                ₹{selectedContract && data?.strikes.find(s => s.ce?.symbol === selectedContract.symbol || s.pe?.symbol === selectedContract.symbol)?.[selectedContract.type.toLowerCase()]?.id ? 
                  (quotes[data?.strikes.find(s => s.ce?.symbol === selectedContract.symbol || s.pe?.symbol === selectedContract.symbol)?.[selectedContract.type.toLowerCase()]?.id]?.lastPrice || 0).toFixed(2) : '0.00'}
              </div>
            </div>

            <div className="order-input-section">
                <div className="input-group">
                    <label>Quantity</label>
                    <div className="qty-stepper">
                        <button onClick={() => setOrderQty(Math.max(1, orderQty - 1))}><i className="fas fa-minus"></i></button>
                        <input type="number" value={orderQty} onChange={(e) => setOrderQty(parseInt(e.target.value) || 0)} />
                        <button onClick={() => setOrderQty(orderQty + 1)}><i className="fas fa-plus"></i></button>
                    </div>
                </div>

                <div className="input-group">
                    <label>Order Type</label>
                    <div className="pill-group" style={{ flexWrap: 'wrap' }}>
                        {['MARKET', 'LIMIT', 'SL', 'SLM', 'GTT'].map(t => (
                            <button 
                                key={t} 
                                className={orderType === t ? 'active' : ''} 
                                onClick={() => setOrderType(t as OrderType)}
                                style={{ minWidth: '60px', flex: '1 0 30%' }}
                            >
                                {t}
                            </button>
                        ))}
                    </div>
                </div>

                {(orderType === 'LIMIT' || orderType === 'SL') && (
                    <div className="input-group">
                        <label>Price</label>
                        <input className="price-input" type="number" value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} placeholder="0.00" />
                    </div>
                )}

                {(orderType === 'SL' || orderType === 'SLM' || orderType === 'GTT') && (
                    <div className="input-group">
                        <label>Trigger Price</label>
                        <input className="price-input" type="number" value={triggerPrice} onChange={(e) => setTriggerPrice(e.target.value)} placeholder="0.00" />
                    </div>
                )}

                <div className="input-group">
                    <label>Product</label>
                    <div className="pill-group">
                        {['INTRADAY', 'CARRY'].map(t => (
                            <button key={t} className={productType === t ? 'active' : ''} onClick={() => setProductType(t as ProductType)}>{t}</button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="order-actions">
                <button className="buy-btn" onClick={() => handlePlaceOrder('BUY')} disabled={placingOrder}>
                    {placingOrder ? <i className="fas fa-spinner fa-spin"></i> : 'BUY'}
                </button>
                <button className="sell-btn" onClick={() => handlePlaceOrder('SELL')} disabled={placingOrder}>
                    {placingOrder ? <i className="fas fa-spinner fa-spin"></i> : 'SELL'}
                </button>
            </div>
          </div>
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
                        expiryDate={selectedExpiry}
                        onTrade={handleTrade}
                        />
                        </>
                    )}
                </>
            )}
            </div>
        </div>
      <TradingSegmentsDrawer 
        isOpen={isSegmentsOpen} 
        onClose={() => setIsSegmentsOpen(false)}
        onSelect={(item) => {
            if (item.segment.includes('Options')) {
                // For options, we might want to switch the index
                const newSymbol = item.name.split(' ')[0];
                router.push(`/option-chain?symbol=${newSymbol}`);
                setIsSegmentsOpen(false);
            } else {
                setShowToast({ msg: `Added ${item.name} to Watchlist (Demo)`, isError: false });
                setTimeout(() => setShowToast(null), 2000);
            }
        }}
      />
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
          background: var(--container-bg);
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-light);
          flex-shrink: 0;
          z-index: 30;
        }

        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .logo-area {
          display: flex;
          align-items: center;
          gap: 14px;
        }

        .back-btn {
          background: var(--card-alt-bg);
          border: 1px solid var(--border-light);
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-primary);
          cursor: pointer;
          transition: all 0.2s;
        }
        .back-btn:active { transform: scale(0.92); }

        .title-grp {
          display: flex;
          flex-direction: column;
        }

        .logo-text {
          font-weight: 800;
          font-size: 1.2rem;
          color: var(--text-primary);
          line-height: 1.1;
          letter-spacing: -0.5px;
        }

        .status-row {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-top: 2px;
        }

        .sub-tag {
          font-size: 0.65rem;
          font-weight: 800;
          color: #C62E2E;
          text-transform: uppercase;
          letter-spacing: 1px;
        }

        .status-indicator {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            box-shadow: 0 0 8px rgba(0,0,0,0.2);
        }
        .status-indicator.online { 
            background: #22c55e; 
            box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
            animation: pulse-green 2s infinite;
        }
        .status-indicator.offline { 
            background: #ef4444; 
            box-shadow: 0 0 8px rgba(239, 68, 68, 0.5);
        }

        @keyframes pulse-green {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }

        .quote-count {
            font-size: 0.6rem;
            font-weight: 700;
            color: var(--text-muted);
            background: var(--card-alt-bg);
            padding: 2px 6px;
            border-radius: 4px;
            border: 1px solid var(--border-light);
        }

        .kite-reconnect-btn {
            background: rgba(198, 46, 46, 0.1);
            color: #C62E2E;
            border: 1px solid rgba(198, 46, 46, 0.2);
            width: 32px;
            height: 32px;
            border-radius: 50%;
            font-size: 0.75rem;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .library-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            background: var(--card-alt-bg);
            padding: 8px 12px;
            border-radius: 50px;
            font-size: 0.7rem;
            font-weight: 800;
            color: var(--text-primary);
            cursor: pointer;
            border: 1px solid var(--border-light);
            transition: all 0.2s;
        }
        .library-btn:active { transform: scale(0.95); }
        .library-btn i:first-child { color: #C62E2E; }
        .library-btn i:last-child { color: var(--text-muted); font-size: 0.6rem; }

        .spot-area {
          text-align: right;
        }

        .spot-label {
          font-size: 0.6rem;
          font-weight: 900;
          color: var(--text-muted);
          display: block;
          letter-spacing: 1px;
        }

        .spot-vals {
          display: flex;
          flex-direction: column;
          margin-top: 2px;
        }

        .spot-price {
          font-weight: 800;
          font-size: 1.05rem;
          color: var(--text-primary);
          font-family: 'JetBrains Mono', monospace;
        }

        .spot-chg {
          font-size: 0.75rem;
          font-weight: 700;
        }

        .pos { color: var(--positive-text); }
        .neg { color: var(--negative-text); }

        .today-badge {
            font-size: 0.6rem;
            font-weight: 800;
            color: white;
            background: #22c55e;
            padding: 1px 6px;
            border-radius: 4px;
            display: inline-block;
            margin-bottom: 4px;
            letter-spacing: 0.5px;
        }

        .main-content {
          flex: 1;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          scrollbar-width: none;
        }
        .main-content::-webkit-scrollbar { display: none; }

        .expiry-strip {
          background: var(--container-bg);
          padding: 14px 20px;
          border-bottom: 1px solid var(--border-light);
          overflow-x: auto;
          scrollbar-width: none;
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .expiry-strip::-webkit-scrollbar { display: none; }

        .strip-scroll {
          display: flex;
          gap: 12px;
        }

        .expiry-tab {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 10px 18px;
          background: var(--card-alt-bg);
          border: 1px solid var(--border-light);
          border-radius: 16px;
          min-width: 65px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1);
        }

        .expiry-tab.active {
          background: #C62E2E;
          border-color: #C62E2E;
          transform: translateY(-2px);
          box-shadow: 0 8px 16px rgba(198, 46, 46, 0.2);
        }

        .tab-day {
            font-size: 1.1rem;
            font-weight: 800;
            color: var(--text-primary);
        }
        .tab-month {
            font-size: 0.6rem;
            font-weight: 700;
            color: var(--text-muted);
            margin-top: 2px;
        }
        .expiry-tab.active .tab-day,
        .expiry-tab.active .tab-month {
            color: white;
        }

        .oc-table-wrapper {
          flex: 1;
          background: var(--card-bg);
          padding-bottom: 20px;
        }

        .loading-state, .no-data-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 80px 40px;
            text-align: center;
        }

        .pulse-logo {
            font-size: 2.5rem;
            color: #C62E2E;
            margin-bottom: 20px;
        }

        .loading-state p {
            font-weight: 700;
            color: var(--text-primary);
            margin: 0;
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

        .order-sheet {
            background: var(--card-bg);
            border-top-left-radius: 30px;
            border-top-right-radius: 30px;
            padding: 24px;
            max-height: 85vh;
            overflow-y: auto;
            position: fixed;
            bottom: -100%;
            left: 0;
            width: 100%;
            z-index: 1001;
            transition: bottom 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }

        .order-sheet.open {
            bottom: 0;
        }

        .order-title {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .type-badge {
            font-size: 0.7rem;
            font-weight: 800;
            padding: 4px 10px;
            border-radius: 6px;
            color: white;
        }
        .type-badge.CE { background: #2c8e5a; }
        .type-badge.PE { background: #c62e2e; }

        .order-name-grp h3 { font-size: 1.1rem; margin: 0; color: var(--text-primary); }
        .order-name-grp p { font-size: 0.65rem; color: var(--text-secondary); margin: 0; }

        .order-sheet-content {
            padding: 20px 0 10px;
        }

        .order-price-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: var(--card-alt-bg);
            padding: 12px 16px;
            border-radius: 12px;
            margin-bottom: 20px;
        }
        .price-label { font-size: 0.7rem; font-weight: 700; color: var(--text-muted); }
        .price-val { font-size: 1.2rem; font-weight: 800; color: var(--text-primary); font-family: 'JetBrains Mono', monospace; }

        .input-group {
            margin-bottom: 16px;
        }
        .input-group label {
            display: block;
            font-size: 0.65rem;
            font-weight: 800;
            color: var(--text-muted);
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }

        .qty-stepper {
            display: flex;
            align-items: center;
            background: var(--card-alt-bg);
            border-radius: 12px;
            overflow: hidden;
            border: 1px solid var(--border-card);
        }
        .qty-stepper button {
            background: none;
            border: none;
            padding: 12px 20px;
            color: var(--text-primary);
            cursor: pointer;
        }
        .qty-stepper input {
            flex: 1;
            background: none;
            border: none;
            text-align: center;
            font-weight: 800;
            font-size: 1.1rem;
            color: var(--text-primary);
            width: 60px;
        }

        .pill-group {
            display: flex;
            gap: 8px;
        }
        .pill-group button {
            flex: 1;
            padding: 10px;
            border-radius: 10px;
            border: 1px solid var(--border-card);
            background: var(--card-bg);
            font-size: 0.75rem;
            font-weight: 700;
            color: var(--text-secondary);
            cursor: pointer;
        }
        .pill-group button.active {
            background: var(--chip-active-bg);
            color: var(--chip-active-text);
            border-color: var(--chip-active-bg);
        }

        .price-input {
            width: 100%;
            padding: 12px;
            border-radius: 12px;
            border: 1px solid var(--border-card);
            background: var(--card-alt-bg);
            font-weight: 800;
            font-size: 1.1rem;
            color: var(--text-primary);
        }

        .order-actions {
            display: flex;
            gap: 12px;
            margin-top: 24px;
        }
        .buy-btn, .sell-btn {
            flex: 1;
            padding: 16px;
            border-radius: 16px;
            border: none;
            font-weight: 800;
            font-size: 1rem;
            color: white;
            cursor: pointer;
            transition: transform 0.1s;
        }
        .buy-btn { background: #2c8e5a; box-shadow: 0 4px 12px rgba(44, 142, 90, 0.3); }
        .sell-btn { background: #c62e2e; box-shadow: 0 4px 12px rgba(198, 46, 46, 0.3); }
        .buy-btn:active, .sell-btn:active { transform: scale(0.96); }

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
