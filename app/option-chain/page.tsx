'use client';

import React, { useState, useEffect, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOrderEntry, OrderSide, OrderType, ProductType } from '@/hooks/useOrderEntry';
import { useKiteQuotes } from '@/hooks/useKiteQuotes';
import OptionChainTable from './OptionChainTable';
import Footer from '@/components/Footer';
import Sidebar from '@/components/Sidebar';
import TradingSegmentsDrawer from '@/components/TradingSegmentsDrawer';
import './page.css';

function OptionChainContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const symbol = (searchParams.get('symbol') || 'NIFTY').toUpperCase();
  
  const { placeOrder, loading: placingOrder, error: orderError } = useOrderEntry();
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
  
  const spotPrice = underlyingId ? quotes[underlyingId]?.lastPrice || 0 : 0;
  const spotChange = underlyingId ? quotes[underlyingId]?.changePercent || 0 : 0;

  const handleTrade = (instrSymbol: string, side: 'BUY' | 'SELL') => {
    const strikeMatch = data?.strikes.find(s => s.ce?.symbol === instrSymbol || s.pe?.symbol === instrSymbol);
    if (strikeMatch) {
      const type = strikeMatch.ce?.symbol === instrSymbol ? 'CE' : 'PE';
      setSelectedContract({ symbol: instrSymbol, type, strike: strikeMatch.strike });
      const defaultQty = symbol === 'NIFTY' ? 50 : (symbol === 'BANKNIFTY' ? 15 : (symbol === 'SENSEX' ? 10 : 25));
      setOrderQty(defaultQty);
      
      // Open sheet visually
      const sheet = document.getElementById('tradeSheet');
      const overlay = document.getElementById('tradeSheetOverlay');
      if (sheet) sheet.classList.add('open');
      if (overlay) overlay.classList.add('active');
    }
  };

  const closeTradeSheet = () => {
    const sheet = document.getElementById('tradeSheet');
    const overlay = document.getElementById('tradeSheetOverlay');
    if (sheet) sheet.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
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
      showToast(`✅ ${side} Order Executed!`, false);
      closeTradeSheet();
    } else {
      showToast(`❌ Failed: ${result.error}`, true);
    }
  };

  return (
    <div className="desktop-layout">
      <Sidebar />
      
      <main className="main-viewport">
        <div className="oc-app-container">
          {/* Header */}
          <div className="app-header premium-header">
            <div className="header-wrapper" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div className="premium-back-btn" onClick={() => router.back()}>
                  <i className="fas fa-chevron-left"></i>
                </div>
                <div>
                  <div className="premium-symbol-name">{symbol}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                    <span className="premium-badge">OPTION CHAIN</span>
                    {connected ? (
                      <div className="pulsing-dot connected"></div>
                    ) : (
                      <div className="pulsing-dot connecting"></div>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <div className="premium-spot-label">SPOT PRICE</div>
                <div className="premium-spot-price">{spotPrice > 0 ? spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '---'}</div>
                <div className={`premium-spot-change ${spotChange >= 0 ? 'pos' : 'neg'}`}>
                  {spotChange >= 0 ? '+' : ''}{spotChange.toFixed(2)}%
                </div>
              </div>
            </div>
          </div>

          <div className="content-wrapper">
            <div className="expiry-strip">
              <div className="strip-scroll">
                {data?.expiries.map((exp) => {
                  const [year, monthNum, dayNum] = exp.split('-').map(Number);
                  const dateObj = new Date(year, monthNum - 1, dayNum);
                  const day = dateObj.getDate();
                  const month = dateObj.toLocaleDateString('en-IN', { month: 'short' }).toUpperCase();
                  return (
                    <button 
                      key={exp}
                      className={`expiry-pill ${selectedExpiry === exp ? 'active' : ''}`}
                      onClick={() => setSelectedExpiry(exp)}
                    >
                      <div className="day">{day}</div>
                      <div className="month">{month}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="oc-table-wrapper">
              {loading ? (
                <div className="loading-state">
                  <div className="red-spinner"></div>
                  <p>Gathering strikes...</p>
                </div>
              ) : (
                <OptionChainTable 
                  strikes={data?.strikes || []} 
                  quotes={quotes}
                  spotPrice={spotPrice}
                  expiryDate={selectedExpiry}
                  onTrade={handleTrade}
                />
              )}
            </div>
          </div>

          <Footer activeTab="watchlist" />
        </div>
      </main>

      {/* Order Entry Sheet */}
      <div id="tradeSheetOverlay" className="trade-sheet-overlay" onClick={closeTradeSheet}></div>
      <div id="tradeSheet" className="trade-sheet">
        <div className="sheet-handle"><div className="handle-bar"></div></div>
        {selectedContract && (
          <div className="ts-content" style={{ padding: '0 20px 20px' }}>
            <div className="ts-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <div className="ts-symbol" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>{selectedContract.strike} {selectedContract.type}</div>
                <div className="ts-exchange" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{symbol} OPTION</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="ts-ltp" style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {(() => {
                    const kiteId = data?.strikes.find(s => s.ce?.symbol === selectedContract.symbol || s.pe?.symbol === selectedContract.symbol)?.[selectedContract.type.toLowerCase()]?.id;
                    return quotes[kiteId || '']?.lastPrice?.toFixed(2) || '---';
                  })()}
                </div>
              </div>
            </div>

            <div className="ts-order-options" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="ts-row">
                <div className="ts-label">Quantity</div>
                <div className="ts-qty-selector" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button className="qty-btn" onClick={() => setOrderQty(q => Math.max(1, q - 1))}>-</button>
                  <input type="number" className="qty-input" value={orderQty} onChange={e => setOrderQty(parseInt(e.target.value) || 1)} />
                  <button className="qty-btn" onClick={() => setOrderQty(q => q + 1)}>+</button>
                </div>
              </div>

              <div className="ts-row">
                <div className="ts-label">Order Type</div>
                <div className="pill-group">
                  {['MARKET', 'LIMIT'].map(t => (
                    <button key={t} className={`pill-btn ${orderType === t ? 'active' : ''}`} onClick={() => setOrderType(t as OrderType)}>{t}</button>
                  ))}
                </div>
              </div>

              {orderType === 'LIMIT' && (
                <div className="ts-row">
                  <div className="ts-label">Price</div>
                  <input type="number" className="price-input" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} placeholder="0.00" />
                </div>
              )}

              <div className="ts-row">
                <div className="ts-label">Product</div>
                <div className="pill-group">
                  {['INTRADAY', 'CARRY'].map(p => (
                    <button key={p} className={`pill-btn ${productType === p ? 'active' : ''}`} onClick={() => setProductType(p as ProductType)}>{p}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="ts-footer" style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button className="ts-btn ts-btn-buy" onClick={() => handlePlaceOrder('BUY')} disabled={placingOrder}>{placingOrder ? '...' : 'BUY'}</button>
              <button className="ts-btn ts-btn-sell" onClick={() => handlePlaceOrder('SELL')} disabled={placingOrder}>{placingOrder ? '...' : 'SELL'}</button>
            </div>
          </div>
        )}
      </div>

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
