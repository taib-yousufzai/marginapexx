'use client';

import { useState, useEffect } from 'react';
import { useOrderEntry, OrderType, ProductType } from '@/hooks/useOrderEntry';
import { supabase } from '@/lib/supabaseClient';

export interface TradeSheetItem {
  name: string;
  symbol: string;
  kiteSymbol: string;
  segment: string;
  price: number;
  change?: string;
}

interface TradeSheetProps {
  item: TradeSheetItem | null;
  side: 'BUY' | 'SELL' | 'BOTH';
  onClose: () => void;
  onSuccess?: () => void;
  /** When true: hides GTT order type and hides Product Type section entirely */
  exitMode?: boolean;
}

function getLotSize(name: string): number {
  const n = name.toUpperCase();
  if (n.includes('BANKNIFTY') || n.includes('BANKEX')) return 15;
  if (n.includes('FINNIFTY')) return 40;
  if (n.includes('MIDCP') || n.includes('MIDCAP')) return 75;
  if (n.includes('SENSEX')) return 10;
  if (n.includes('NIFTY')) return 25;
  return 1;
}

export default function TradeSheet({ item, side, onClose, onSuccess, exitMode = false }: TradeSheetProps) {
  const { placeOrder, loading: placingOrder } = useOrderEntry();

  const [orderUnit, setOrderUnit] = useState<'qty' | 'lot'>('qty');
  const [orderQty, setOrderQty] = useState(1);
  const [qtyInput, setQtyInput] = useState('1'); // string for free typing
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [productType, setProductType] = useState<ProductType>('INTRADAY');
  const [limitPrice, setLimitPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [tpPrice, setTpPrice] = useState('');
  const [availableBalance, setAvailableBalance] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isOpen = !!item;
  const lotSize = item ? getLotSize(item.name) : 1;
  const currentLtp = item?.price ?? 0;
  const bidPrice = currentLtp > 0 ? currentLtp - currentLtp * 0.001 : 0;
  const askPrice = currentLtp > 0 ? currentLtp + currentLtp * 0.001 : 0;
  const totalQty = orderUnit === 'lot' ? orderQty * lotSize : orderQty;
  const requiredMargin = orderType === 'LIMIT' && limitPrice
    ? totalQty * parseFloat(limitPrice)
    : totalQty * currentLtp;

  // Sync qtyInput → orderQty when input is a valid number
  const handleQtyChange = (val: string) => {
    setQtyInput(val);
    const n = parseInt(val);
    if (!isNaN(n) && n > 0) setOrderQty(n);
  };

  // Stepper buttons update both
  const stepQty = (delta: number) => {
    const step = orderUnit === 'qty' ? lotSize : 1;
    const next = Math.max(step, orderQty + delta * step);
    setOrderQty(next);
    setQtyInput(String(next));
  };

  // Reset state when item changes
  useEffect(() => {
    if (item) {
      const ls = getLotSize(item.name);
      setOrderQty(ls);
      setQtyInput(String(ls));
      setOrderUnit('qty');
      setOrderType('MARKET');
      setProductType('INTRADAY');
      setLimitPrice('');
      setTriggerPrice('');
      setSlPrice('');
      setTpPrice('');
    }
  }, [item?.symbol]);

  // Fetch balance
  useEffect(() => {
    if (!isOpen) return;
    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      fetch('/api/pay/balance', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(data => { if (typeof data.balance === 'number') setAvailableBalance(data.balance); })
        .catch(() => {});
    });
  }, [isOpen]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handlePlace = async (placeSide: 'BUY' | 'SELL') => {
    if (!item) return;
    const res = await placeOrder({
      symbol: item.symbol,
      kite_instrument: item.kiteSymbol || item.symbol,
      segment: item.segment,
      side: placeSide,
      qty: totalQty,
      lots: orderUnit === 'lot' ? orderQty : 0,
      order_type: orderType,
      product_type: exitMode ? 'INTRADAY' : productType,
      client_price: ['LIMIT', 'SL', 'GTT'].includes(orderType) ? parseFloat(limitPrice) || 0 : currentLtp,
      trigger_price: parseFloat(triggerPrice) || undefined,
      stop_loss: parseFloat(slPrice) || undefined,
      target: parseFloat(tpPrice) || undefined,
    });
    if (res.success) {
      showToast(`✅ ${placeSide} order placed for ${item.symbol}`);
      onSuccess?.();
      onClose();
    } else {
      showToast(`❌ ${res.error}`);
    }
  };

  const fmt = (n: number) =>
    n > 0 ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---';

  return (
    <>
      <style>{`
        .ts2-overlay {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.55);
          z-index: 9998;
          opacity: 0; visibility: hidden;
          transition: opacity 0.3s ease, visibility 0.3s ease;
        }
        .ts2-overlay.active { opacity: 1; visibility: visible; }

        .ts2-sheet {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          width: 100%; max-width: 500px; margin: 0 auto;
          background: #F5F7FB;
          z-index: 9999;
          transform: translateY(100%);
          transition: transform 0.38s cubic-bezier(0.25, 0.9, 0.35, 1.05);
          display: flex; flex-direction: column;
          overflow: hidden;
        }
        @media (max-width: 500px) { .ts2-sheet { max-width: 100%; } }
        .ts2-sheet.open { transform: translateY(0); }

        .ts2-header {
          background: #fff; padding: 10px 14px 12px;
          display: flex; align-items: center; gap: 12px;
          border-bottom: 1px solid #EEF2F8; flex-shrink: 0;
        }
        .ts2-back-btn {
          width: 36px; height: 36px; border-radius: 50%;
          background: #F1F5F9; border: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #374151; font-size: 0.9rem;
        }
        .ts2-name-block { flex: 1; min-width: 0; }
        .ts2-instr-name {
          font-size: 1rem; font-weight: 800; color: #111827;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ts2-segment-badge {
          display: inline-block; margin-top: 4px;
          font-size: 0.6rem; font-weight: 700;
          color: #C62E2E; background: #FEF2F2;
          padding: 2px 10px; border-radius: 30px;
        }
        .ts2-price-block { text-align: right; flex-shrink: 0; }
        .ts2-price-value { font-size: 1.35rem; font-weight: 800; color: #111827; }
        .ts2-change-badge {
          display: inline-block; margin-top: 3px;
          font-size: 0.62rem; font-weight: 700;
          padding: 2px 8px; border-radius: 30px;
          background: #DCFCE7; color: #059669;
        }
        .ts2-change-badge.neg { background: #FEF2F2; color: #C62E2E; }

        .ts2-bidask {
          background: #fff; display: flex; align-items: center;
          padding: 8px 16px; border-bottom: 1px solid #EEF2F8; flex-shrink: 0;
        }
        .ts2-ba-cell {
          flex: 1; display: flex; justify-content: space-between;
          align-items: center; padding: 0 4px;
        }
        .ts2-ba-label {
          font-size: 0.6rem; font-weight: 700; color: #6B7280;
          text-transform: uppercase; letter-spacing: 0.5px;
        }
        .ts2-ba-bid { font-size: 0.82rem; font-weight: 700; color: #059669; }
        .ts2-ba-ask { font-size: 0.82rem; font-weight: 700; color: #DC2626; }
        .ts2-ba-divider { width: 1px; height: 20px; background: #E5E7EB; margin: 0 8px; }

        .ts2-scroll { flex: 1; overflow-y: auto; padding-bottom: 90px; }
        .ts2-scroll::-webkit-scrollbar { display: none; }
        .ts2-body { padding: 12px; display: flex; flex-direction: column; gap: 12px; }

        .ts2-card {
          background: #fff; border-radius: 14px;
          padding: 12px 14px; border: 1px solid #F1F5F9;
        }
        .ts2-label {
          font-size: 0.62rem; font-weight: 700; color: #6B7280;
          text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 10px;
        }
        .ts2-unit-row { display: flex; align-items: center; justify-content: space-between; }
        .ts2-toggle {
          display: flex; background: #F1F5F9; border-radius: 30px; padding: 3px; gap: 2px;
        }
        .ts2-toggle-opt {
          padding: 5px 16px; border-radius: 30px;
          font-size: 0.65rem; font-weight: 700; color: #6B7280;
          cursor: pointer; border: none; background: transparent; transition: all 0.2s;
        }
        .ts2-toggle-opt.active {
          background: #fff; color: #111827;
          box-shadow: 0 1px 4px rgba(0,0,0,0.1);
        }

        .ts2-info-wrap { background: #F1F5F9; border-radius: 14px; padding: 8px; }
        .ts2-info-grid { display: grid; grid-template-columns: repeat(4,1fr); gap: 6px; }
        .ts2-info-card { background: #fff; border-radius: 10px; padding: 8px 6px; text-align: center; }
        .ts2-ic-label {
          font-size: 0.55rem; font-weight: 600; color: #6B7280;
          text-transform: uppercase; margin-bottom: 4px;
        }
        .ts2-ic-val { font-size: 0.82rem; font-weight: 800; color: #111827; }

        .ts2-stepper {
          display: flex; align-items: center;
          background: #F8FAFF; border: 1.5px solid #E5E7EB;
          border-radius: 50px; overflow: hidden; height: 52px;
        }
        .ts2-qty-btn {
          width: 52px; height: 52px; flex-shrink: 0;
          border: none; background: transparent;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; font-size: 1rem; color: #374151; border-radius: 50%;
        }
        .ts2-qty-btn:active { background: #E5E7EB; }
        .ts2-qty-val {
          flex: 1; text-align: center; font-size: 1.25rem; font-weight: 800;
          color: #111827; border: none; background: transparent; outline: none;
          font-family: inherit; min-width: 0;
          -moz-appearance: textfield;
        }
        .ts2-qty-val::-webkit-outer-spin-button,
        .ts2-qty-val::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .ts2-qty-hint { font-size: 0.6rem; color: #9CA3AF; margin-top: 7px; text-align: center; }

        .ts2-pills { display: flex; gap: 6px; flex-wrap: wrap; }
        .ts2-pill {
          flex: 1; min-width: 60px; padding: 8px 4px; border-radius: 50px;
          font-size: 0.65rem; font-weight: 700; text-align: center; cursor: pointer;
          border: 1.5px solid #E5E7EB; background: #fff; color: #374151;
          transition: all 0.18s; white-space: nowrap;
        }
        .ts2-pill.active {
          background: #DC2626; color: #fff; border-color: #DC2626;
          box-shadow: 0 2px 8px rgba(220,38,38,0.25);
        }

        .ts2-price-input {
          width: 100%; box-sizing: border-box; border-radius: 12px;
          padding: 12px 14px; font-size: 1rem; font-weight: 700;
          border: 1.5px solid #E5E7EB; background: #F8FAFF;
          color: #111827; outline: none; margin-top: 10px; font-family: inherit;
        }

        .ts2-field-input {
          width: 100%; box-sizing: border-box;
          background: #FFFFFF;
          border: 1px solid #DCE3EC;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 0.9rem;
          font-weight: 700;
          color: #1A1E2B;
          outline: none;
          transition: border-color 0.2s;
          font-family: inherit;
        }
        .ts2-field-input:focus {
          border-color: #006400;
          box-shadow: 0 0 0 2px rgba(0,100,0,0.1);
        }

        .ts2-margin-card {
          background: #fff; border-radius: 14px; border: 1px solid #F1F5F9; overflow: hidden;
        }
        .ts2-margin-row {
          display: flex; justify-content: space-between; align-items: center; padding: 11px 14px;
        }
        .ts2-margin-row + .ts2-margin-row { border-top: 1px solid #F1F5F9; }
        .ts2-ml { font-size: 0.68rem; font-weight: 600; color: #6B7280; }
        .ts2-mv { font-size: 0.78rem; font-weight: 700; color: #111827; }
        .ts2-mv-avail {
          background: #DCFCE7; color: #15803D;
          padding: 3px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 700;
        }

        .ts2-footer {
          position: fixed; bottom: 0; left: 0; right: 0;
          max-width: 500px; margin: 0 auto; z-index: 10001;
          background: #fff; padding: 12px 14px 24px;
          display: flex; gap: 8px;
        }
        @media (max-width: 500px) { .ts2-footer { max-width: 100%; } }
        .ts2-btn {
          flex: 1; height: 52px; border: none; border-radius: 50px;
          font-size: 1rem; font-weight: 800; letter-spacing: 0.5px;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: transform 0.15s;
        }
        .ts2-btn:active { transform: scale(0.96); }
        .ts2-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .ts2-btn-buy { background: #15803D; color: #fff; box-shadow: 0 6px 16px rgba(21,128,61,0.35); }
        .ts2-btn-sell { background: #B91C1C; color: #fff; box-shadow: 0 6px 16px rgba(185,28,28,0.35); }

        .ts2-toast {
          position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%) translateY(20px);
          background: #1F2937; color: #fff; padding: 10px 20px; border-radius: 30px;
          font-size: 0.82rem; font-weight: 600; z-index: 10002;
          opacity: 0; transition: opacity 0.3s, transform 0.3s; pointer-events: none;
          white-space: nowrap;
        }
        .ts2-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }

        @media (min-width: 768px) {
          .ts2-sheet {
            position: fixed !important; top: 0 !important; bottom: unset !important;
            height: 100vh !important; max-width: 500px !important;
            left: unset !important; right: 0 !important; margin: 0 !important;
            border-radius: 0 !important; transform: translateX(100%) !important;
          }
          .ts2-sheet.open { transform: translateX(0) !important; }
          .ts2-footer { right: 0; left: unset; width: 500px; }
        }
      `}</style>

      <div className={`ts2-overlay${isOpen ? ' active' : ''}`} onClick={onClose} />

      <div className={`ts2-sheet${isOpen ? ' open' : ''}`}>
        {item && (
          <>
            {/* Header */}
            <div className="ts2-header">
              <button className="ts2-back-btn" onClick={onClose}>
                <i className="fas fa-chevron-down" />
              </button>
              <div className="ts2-name-block">
                <div className="ts2-instr-name">{item.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  <span className="ts2-segment-badge">{item.segment}</span>
                  {exitMode && (
                    <span style={{
                      display: 'inline-block',
                      fontSize: '0.6rem', fontWeight: 700,
                      color: '#B91C1C', background: '#FEF2F2',
                      padding: '2px 8px', borderRadius: '30px',
                      textTransform: 'uppercase', letterSpacing: '0.3px'
                    }}>Exit Position</span>
                  )}
                  {!exitMode && (
                    <span style={{
                      display: 'inline-block',
                      fontSize: '0.6rem', fontWeight: 700,
                      color: '#15803D', background: '#DCFCE7',
                      padding: '2px 8px', borderRadius: '30px',
                      textTransform: 'uppercase', letterSpacing: '0.3px'
                    }}>Add More</span>
                  )}
                </div>
              </div>
              <div className="ts2-price-block">
                <div className="ts2-price-value">{fmt(currentLtp)}</div>
                <span className={`ts2-change-badge${(item.change || '').startsWith('-') ? ' neg' : ''}`}>
                  {item.change || '0.00%'}
                </span>
              </div>
            </div>

            {/* Bid / Ask */}
            <div className="ts2-bidask">
              <div className="ts2-ba-cell">
                <span className="ts2-ba-label">BID</span>
                <span className="ts2-ba-bid">{fmt(bidPrice)}</span>
              </div>
              <div className="ts2-ba-divider" />
              <div className="ts2-ba-cell">
                <span className="ts2-ba-label">ASK</span>
                <span className="ts2-ba-ask">{fmt(askPrice)}</span>
              </div>
            </div>

            <div className="ts2-scroll">
              <div className="ts2-body">

                {/* Order Unit */}
                <div className="ts2-card">
                  <div className="ts2-unit-row">
                    <span className="ts2-label" style={{ marginBottom: 0 }}>Order Unit</span>
                    <div className="ts2-toggle">
                      <button
                        className={`ts2-toggle-opt${orderUnit === 'qty' ? ' active' : ''}`}
                        onClick={() => { setOrderUnit('qty'); setOrderQty(lotSize); setQtyInput(String(lotSize)); }}
                      >QTY</button>
                      <button
                        className={`ts2-toggle-opt${orderUnit === 'lot' ? ' active' : ''}`}
                        onClick={() => { setOrderUnit('lot'); setOrderQty(1); setQtyInput('1'); }}
                      >LOT</button>
                    </div>
                  </div>
                </div>

                {/* Info cards */}
                <div className="ts2-info-wrap">
                  <div className="ts2-info-grid">
                    <div className="ts2-info-card">
                      <div className="ts2-ic-label">Lot Size</div>
                      <div className="ts2-ic-val">{lotSize}</div>
                    </div>
                    <div className="ts2-info-card">
                      <div className="ts2-ic-label">Max Lots</div>
                      <div className="ts2-ic-val">--</div>
                    </div>
                    <div className="ts2-info-card">
                      <div className="ts2-ic-label">Order Lots</div>
                      <div className="ts2-ic-val">{orderUnit === 'lot' ? orderQty : '--'}</div>
                    </div>
                    <div className="ts2-info-card">
                      <div className="ts2-ic-label">Total Qty</div>
                      <div className="ts2-ic-val">{totalQty}</div>
                    </div>
                  </div>
                </div>

                {/* Quantity stepper */}
                <div className="ts2-card">
                  <div className="ts2-label">{orderUnit === 'lot' ? 'Lot' : 'Quantity'}</div>
                  <div className="ts2-stepper">
                    <button className="ts2-qty-btn" onClick={() => stepQty(-1)}>
                      <i className="fas fa-minus" />
                    </button>
                    <input
                      className="ts2-qty-val"
                      type="number"
                      value={qtyInput}
                      onChange={e => handleQtyChange(e.target.value)}
                      onBlur={() => {
                        // On blur, if empty or invalid, reset to current orderQty
                        if (!qtyInput || parseInt(qtyInput) < 1) {
                          setQtyInput(String(orderQty));
                        }
                      }}
                    />
                    <button className="ts2-qty-btn" onClick={() => stepQty(1)}>
                      <i className="fas fa-plus" />
                    </button>
                  </div>
                  <div className="ts2-qty-hint">{orderUnit === 'lot' ? `${orderQty} Lots` : `${orderQty} Qty`}</div>
                </div>

                {/* Order Type */}
                <div className="ts2-card">
                  <div className="ts2-label">Order Type</div>
                  <div className="ts2-pills">
                    {(exitMode
                      ? (['MARKET', 'LIMIT', 'SLM'] as OrderType[])
                      : (['MARKET', 'LIMIT', 'SLM', 'GTT'] as OrderType[])
                    ).map(t => (
                      <button key={t} className={`ts2-pill${orderType === t ? ' active' : ''}`} onClick={() => setOrderType(t)}>{t}</button>
                    ))}
                  </div>
                </div>

                {/* LIMIT — Price input (separate card, matches watchlist) */}
                {(orderType === 'LIMIT' || orderType === 'SL') && (
                  <div className="ts2-card">
                    <div className="ts2-label">Price <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
                    <input
                      className="ts2-field-input"
                      type="number"
                      placeholder="0.00"
                      value={limitPrice}
                      onChange={e => setLimitPrice(e.target.value)}
                    />
                  </div>
                )}

                {/* Trigger Price — SLM (separate card, matches watchlist) */}
                {orderType === 'SLM' && (
                  <div className="ts2-card">
                    <div className="ts2-label">Trigger Price <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
                    <input
                      className="ts2-field-input"
                      type="number"
                      placeholder="0.00"
                      value={triggerPrice}
                      onChange={e => setTriggerPrice(e.target.value)}
                    />
                  </div>
                )}

                {/* GTT — Stop Loss / Target / Limit (separate card, matches watchlist) */}
                {orderType === 'GTT' && (
                  <div className="ts2-card">
                    <div className="ts2-label">SL / Limit / Target</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ flex: 1 }}>
                          <div className="ts2-label" style={{ marginBottom: 6 }}>Stop Loss <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
                          <input
                            className="ts2-field-input"
                            type="number"
                            placeholder="0.00"
                            value={slPrice}
                            onChange={e => setSlPrice(e.target.value)}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div className="ts2-label" style={{ marginBottom: 6 }}>Target <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
                          <input
                            className="ts2-field-input"
                            type="number"
                            placeholder="0.00"
                            value={tpPrice}
                            onChange={e => setTpPrice(e.target.value)}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="ts2-label" style={{ marginBottom: 6 }}>Buy at Limit <span style={{ color: '#9CA3AF', textTransform: 'none', fontWeight: 500 }}>(₹)</span></div>
                        <input
                          className="ts2-field-input"
                          type="number"
                          placeholder="0.00"
                          value={limitPrice}
                          onChange={e => setLimitPrice(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Product Type */}
                {!exitMode && (
                <div className="ts2-card">
                  <div className="ts2-label">Product Type</div>
                  <div className="ts2-pills">
                    {(['INTRADAY', 'CARRY'] as ProductType[]).map(p => (
                      <button key={p} className={`ts2-pill${productType === p ? ' active' : ''}`} onClick={() => setProductType(p)}>{p}</button>
                    ))}
                  </div>
                </div>
                )}

                {/* Margin */}
                <div className="ts2-margin-card">
                  <div className="ts2-margin-row">
                    <span className="ts2-ml">Available</span>
                    <span className="ts2-mv-avail">
                      {availableBalance !== null ? `₹ ${availableBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '--'}
                    </span>
                  </div>
                  <div className="ts2-margin-row">
                    <span className="ts2-ml">Required Margin</span>
                    <span className="ts2-mv">₹ {requiredMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="ts2-margin-row">
                    <span className="ts2-ml">Carry Charges</span>
                    <span className="ts2-mv" style={{ color: '#6B7280' }}>₹ 0.00</span>
                  </div>
                </div>

                <div style={{ height: 8 }} />
              </div>
            </div>

            {/* Footer */}
            <div className="ts2-footer">
              {(side === 'BUY' || side === 'BOTH') && (
                <button
                  className={`ts2-btn${exitMode ? ' ts2-btn-sell' : ' ts2-btn-buy'}`}
                  disabled={placingOrder}
                  onClick={() => handlePlace('BUY')}
                >
                  {placingOrder ? 'PLACING...' : exitMode ? 'EXIT' : 'BUY'}
                </button>
              )}
              {(side === 'SELL' || side === 'BOTH') && (
                <button
                  className="ts2-btn ts2-btn-sell"
                  disabled={placingOrder}
                  onClick={() => handlePlace('SELL')}
                >
                  {placingOrder ? 'PLACING...' : exitMode ? 'EXIT' : 'SELL'}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className={`ts2-toast${toast ? ' show' : ''}`}>{toast}</div>
    </>
  );
}
