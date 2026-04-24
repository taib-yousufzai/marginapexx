'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Footer from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import { useKitePositions, KitePosition } from '@/hooks/useKitePositions';
import KiteConnectButton from '@/components/KiteConnectButton';
import '../watchlist/page.css';
import './page.css';

type Position = {
  id: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  avgPrice: number;
  qty: number;
  pnl: number;
  pnlPercent: number;
  ltp: number;
  orderType: string;
};

type DetailedPosition = {
  id: number;
  symbol: string;
  side: 'LONG' | 'SHORT';
  qty: number;
  entryPrice: number;
  exitPrice: number | null;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  status: 'OPEN' | 'CLOSED';
  date: string;
  entryTime?: string;
  exitTime?: string;
  intradayMargin?: number;
  carryMargin?: number;
};

type ClosedPosition = {
  symbol: string;
  side: 'LONG' | 'SHORT';
  avgPrice: number;
  qty: number;
  pnl: number;
  pnlPercent: number;
  ltp: number;
  orderType: string;
  status: string;
  entryTime?: string;
  exitTime?: string;
  exitPrice?: number;
  exitReason?: 'TP' | 'SL' | 'Manual';
};

// Map a Kite net position → cumulative open card shape
function toOpenPosition(p: KitePosition, idx: number): Position {
  const side: 'LONG' | 'SHORT' = p.quantity > 0 ? 'LONG' : 'SHORT';
  const qty = Math.abs(p.quantity);
  const pnlPct = p.average_price > 0 ? (p.pnl / (p.average_price * qty * p.multiplier)) * 100 : 0;
  return {
    id: idx,
    symbol: `${p.exchange}:${p.tradingsymbol}`,
    side,
    avgPrice: p.average_price,
    qty,
    pnl: p.pnl,
    pnlPercent: parseFloat(pnlPct.toFixed(2)),
    ltp: p.last_price,
    orderType: p.product,
  };
}

// Map a Kite day position (squared off today) → cumulative closed card shape
function toClosedPosition(p: KitePosition): ClosedPosition {
  const side: 'LONG' | 'SHORT' = p.buy_quantity >= p.sell_quantity ? 'LONG' : 'SHORT';
  const qty = Math.max(p.buy_quantity, p.sell_quantity);
  const avgPrice = side === 'LONG' ? p.buy_price : p.sell_price;
  const exitPrice = side === 'LONG' ? p.sell_price : p.buy_price;
  const pnlPct = avgPrice > 0 ? (p.pnl / (avgPrice * qty)) * 100 : 0;
  return {
    symbol: `${p.exchange}:${p.tradingsymbol}`,
    side,
    avgPrice,
    qty,
    pnl: p.pnl,
    pnlPercent: parseFloat(pnlPct.toFixed(2)),
    ltp: p.last_price,
    orderType: p.product,
    status: 'COMPLETED',
    exitPrice,
  };
}

// Map a Kite day position → detailed card shape
function toDetailedPosition(p: KitePosition, idx: number): DetailedPosition {
  const isOpen = p.quantity !== 0;
  const side: 'LONG' | 'SHORT' = p.quantity >= 0 ? 'LONG' : 'SHORT';
  const qty = Math.abs(p.quantity) || Math.max(p.buy_quantity, p.sell_quantity);
  const entryPrice = side === 'LONG' ? p.buy_price : p.sell_price;
  const exitPrice = isOpen ? null : (side === 'LONG' ? p.sell_price : p.buy_price);
  const pnlPct = entryPrice > 0 ? (p.pnl / (entryPrice * qty)) * 100 : 0;
  return {
    id: idx,
    symbol: `${p.exchange}:${p.tradingsymbol}`,
    side,
    qty,
    entryPrice,
    exitPrice,
    currentPrice: p.last_price,
    pnl: p.pnl,
    pnlPercent: parseFloat(pnlPct.toFixed(2)),
    status: isOpen ? 'OPEN' : 'CLOSED',
    date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
  };
}

export default function PositionPage() {
  const router = useRouter();
  useAuth();
  const [currentMain, setCurrentMain] = useState<'cumulative' | 'detailed'>('cumulative');
  const [currentSub, setCurrentSub] = useState<'open' | 'closed'>('open');
  const [toast, setToast] = useState<string | null>(null);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selectedPos, setSelectedPos] = useState<Position | DetailedPosition | ClosedPosition | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const [isTradeSheetOpen, setIsTradeSheetOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'buy' | 'sell' | null>(null);
  const [tradeQty, setTradeQty] = useState(1);

  // Live Kite positions
  const { netPositions, dayPositions, connected: kiteConnected, loading: kiteLoading } = useKitePositions(5000);

  // Derive display data from Kite positions
  const openPositions: Position[] = netPositions
    .filter(p => p.quantity !== 0)
    .map(toOpenPosition);

  const closedPositions: ClosedPosition[] = dayPositions
    .filter(p => p.quantity === 0)
    .map(toClosedPosition);

  const detailedPositions: DetailedPosition[] = dayPositions
    .map(toDetailedPosition);

  useEffect(() => {
    const saved = localStorage.getItem('marginApexTheme');
    if (saved === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const exitAllPositions = () => {
    showToast('To exit all positions, place opposite orders via Zerodha Kite.');
  };

  const filteredOpen = openPositions;
  const filteredClosed = closedPositions;
  const filteredDetailed = detailedPositions;

  const handleRowClick = (pos: Position | DetailedPosition | ClosedPosition) => {
    setSelectedPos(pos);
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    setTimeout(() => setSelectedPos(null), 350);
  };

  const openTradeSheet = (action: 'buy' | 'sell') => {
    setSelectedAction(action);
    setTradeQty(selectedPos ? selectedPos.qty : 1);
    setIsSheetOpen(false);
    setTimeout(() => setIsTradeSheetOpen(true), 300);
  };

  const closeTradeSheet = () => {
    setIsTradeSheetOpen(false);
    setTimeout(() => { setSelectedAction(null); }, 350);
  };

  const executeTrade = () => {
    showToast(`${selectedAction?.toUpperCase()} order placed successfully.`);
    closeTradeSheet();
  };

  // Totals from live Kite data
  const realized = dayPositions.reduce((s, p) => s + p.realised, 0);
  const unrealized = netPositions.reduce((s, p) => s + p.unrealised, 0);
  const totalPnl = realized + unrealized;

  const fmtUSD = (v: number) => (v >= 0 ? '+' : '') + '₹' + Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPrice = (v: number) => '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 5 });

  const hasOpenPositions = openPositions.length > 0;

  // Detailed: showing all items
  const detailedDisplayed = filteredDetailed;

  return (
    <div className="pos-root">
      <div className="pos-shell">

        {/* ── Header ── */}
        <div className="pos-header">
          <div className="pos-header-left">
            <div className="pos-brand">
              <span>MARGIN<span className="apex-text">APEX</span></span>
            </div>
            <div className="pos-brand-sub">Position Management • Real-time P&amp;L</div>
          </div>
          <button
            className={`pos-exit-btn${!hasOpenPositions ? ' disabled' : ''}`}
            onClick={() => { if (hasOpenPositions && !showExitConfirm) setShowExitConfirm(true); }}
          >
            <i className="fas fa-sign-out-alt" />
            <span>Exit All</span>
          </button>
        </div>


        {/* ── Main Tabs ── */}
        <div className="pos-main-tabs">
          <div
            className={`pos-main-tab${currentMain === 'cumulative' ? ' active' : ''}`}
            onClick={() => setCurrentMain('cumulative')}
          >
            Cumulative P&amp;L
          </div>
          <div
            className={`pos-main-tab${currentMain === 'detailed' ? ' active' : ''}`}
            onClick={() => setCurrentMain('detailed')}
          >
            Detailed P&amp;L
          </div>
        </div>

        {/* ── Sticky Sub-Header (P&L + Sub-Tabs) ── */}
        <div className="pos-sticky-subheader">
          {/* P&L Summary Card — always visible */}
          <div className="pos-pnl-card">
            <div className="pos-pnl-card-title">Today's P&amp;L</div>
            <div className="pos-pnl-card-body">
              <div className="pos-pnl-col left">
                <div className="pos-pnl-label">Realized</div>
                <div className={`pos-pnl-val${realized >= 0 ? ' green' : ' red'}`}>{fmtUSD(realized)}</div>
              </div>
              <div className="pos-pnl-col center">
                <div className={`pos-pnl-total${totalPnl >= 0 ? ' green' : ' red'}`}>{fmtUSD(totalPnl)}</div>
              </div>
              <div className="pos-pnl-col right">
                <div className="pos-pnl-label">Unrealized</div>
                <div className={`pos-pnl-val${unrealized >= 0 ? ' green' : ' red'}`}>{fmtUSD(unrealized)}</div>
              </div>
            </div>
          </div>

          {/* ── Cumulative Sub-Tabs ── */}
          {currentMain === 'cumulative' && (
            <div className="pos-sub-tabs">
              <div
                className={`pos-sub-tab${currentSub === 'open' ? ' active' : ''}`}
                onClick={() => setCurrentSub('open')}
              >
                Open Positions
              </div>
              <div
                className={`pos-sub-tab${currentSub === 'closed' ? ' active' : ''}`}
                onClick={() => setCurrentSub('closed')}
              >
                Closed Positions
              </div>
            </div>
          )}
        </div>

        {/* ── Scrollable Content ── */}
        <div className="pos-content">

          {/* Loading state */}
          {kiteLoading && (
            <div className="pos-empty">
              <i className="fas fa-circle-notch fa-spin" />
              <p>Loading positions…</p>
            </div>
          )}

          {/* Not connected state */}
          {!kiteLoading && !kiteConnected && (
            <div className="pos-empty" style={{ gap: 16 }}>
              <i className="fas fa-plug" style={{ fontSize: '2rem', color: 'var(--text-muted)' }} />
              <p style={{ fontWeight: 700 }}>No live data</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: 240, textAlign: 'center' }}>
                Connect your Zerodha account to see real positions and P&amp;L.
              </p>
              <KiteConnectButton />
            </div>
          )}

          {/* Live content */}
          {!kiteLoading && kiteConnected && (<>

          {/* ── Cumulative View ── */}
          {currentMain === 'cumulative' && (
            currentSub === 'open' ? (
              filteredOpen.length === 0 ? (
                <div className="pos-empty">
                  <i className="fas fa-chart-simple" />
                  <p>No open positions</p>
                </div>
              ) : filteredOpen.map(pos => (
                <div key={pos.id} className="pos-card" onClick={() => handleRowClick(pos)} style={{ cursor: 'pointer' }}>
                  <div className="pos-card-left">
                    <div className="pos-card-symbol">{pos.symbol}</div>
                    <div className="pos-card-details">
                      <span>Avg Price: <strong>{fmtPrice(pos.avgPrice)}</strong></span>
                      <span>Qty: <strong>{pos.qty.toLocaleString('en-US', { maximumFractionDigits: 4 })}</strong></span>
                    </div>
                  </div>
                  <div className="pos-card-right">
                    <span className={`pos-badge${pos.side === 'LONG' ? ' long' : ' short'}`}>
                      {pos.side} • {pos.orderType}
                    </span>
                    <div className={`pos-card-pnl${pos.pnl >= 0 ? ' green' : ' red'}`}>
                      P&amp;L: {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)} ({pos.pnlPercent > 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%)
                    </div>
                    <div className="pos-card-ltp">LTP: <strong>{fmtPrice(pos.ltp)}</strong></div>
                  </div>
                </div>
              ))
            ) : (
              filteredClosed.length === 0 ? (
                <div className="pos-empty">
                  <i className="fas fa-history" />
                  <p>No closed positions</p>
                </div>
              ) : filteredClosed.map((pos, i) => (
                <div key={i} className="pos-card" onClick={() => handleRowClick(pos)} style={{ cursor: 'pointer' }}>
                  <div className="pos-card-left">
                    <div className="pos-card-symbol">{pos.symbol}</div>
                    <div className="pos-card-details">
                      <span>Avg Price: <strong>{fmtPrice(pos.avgPrice)}</strong></span>
                      <span>Qty: <strong>{pos.qty.toLocaleString('en-US', { maximumFractionDigits: 4 })}</strong></span>
                    </div>
                  </div>
                  <div className="pos-card-right">
                    <span className={`pos-badge${pos.side === 'LONG' ? ' long' : ' short'}`}>
                      {pos.side} • {pos.orderType}
                    </span>
                    <div className={`pos-card-pnl${pos.pnl >= 0 ? ' green' : ' red'}`}>
                      P&amp;L: {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)} ({pos.pnlPercent > 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%)
                    </div>
                    <div className="pos-card-ltp">Exit: <strong>{fmtPrice(pos.ltp)}</strong></div>
                  </div>
                </div>
              ))
            )
          )}

          {/* ── Detailed View ── */}
          {currentMain === 'detailed' && (
            detailedDisplayed.length === 0 ? (
              <div className="pos-empty">
                <i className="fas fa-list" />
                <p>No trades available</p>
              </div>
            ) : detailedDisplayed.map(pos => (
              <div key={pos.id} className="pos-detail-card" onClick={() => handleRowClick(pos)} style={{ cursor: 'pointer' }}>

                {/* Group 1: Header — Symbol | P&L | Status */}
                <div className="pos-detail-header-row">
                  <div className="pos-detail-symbol">
                    {pos.symbol} <span className="pos-detail-side">{pos.side}</span>
                  </div>
                  <div className="pos-detail-right">
                    <div className={`pos-detail-pnl${pos.pnl >= 0 ? ' green' : ' red'}`}>
                      {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                    </div>
                    <div className="pos-detail-pct">{pos.pnlPercent > 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%</div>
                    <span className={`pos-status-badge${pos.status === 'OPEN' ? ' active' : ' closed'}`}>
                      {pos.status === 'OPEN' ? 'Active' : 'Closed'}
                    </span>
                  </div>
                </div>

                {/* Group 2: Qty | Entry | Exit/Current */}
                <div className="pos-detail-meta">
                  <span>Qty: <strong>{pos.qty.toFixed(4)}</strong></span>
                  <span>Entry: <strong>{fmtPrice(pos.entryPrice)}</strong></span>
                  {pos.status === 'OPEN'
                    ? <span>Current: <strong>{fmtPrice(pos.currentPrice)}</strong></span>
                    : <span>Exit: <strong>{fmtPrice(pos.exitPrice!)}</strong></span>
                  }
                </div>

                {/* Group 3: Time | Date */}
                <div className="pos-detail-meta">
                  <span>Time: <strong>{pos.status === 'OPEN' ? pos.entryTime : pos.exitTime}</strong></span>
                  <span>Date: <strong>{pos.date}</strong></span>
                </div>

                {/* Group 4: Margin rows */}
                <div className="pos-detail-margin-row">
                  <span className="pos-detail-margin-label">
                    Intraday Margin: <strong className="pos-detail-margin-val">${(pos.intradayMargin ?? 0).toFixed(2)}</strong>
                  </span>
                  <span className="pos-detail-margin-label">
                    Carry Margin: <strong className="pos-detail-margin-val">${(pos.carryMargin ?? 0).toFixed(2)}</strong>
                  </span>
                </div>

              </div>
            ))
          )}

          </>)}{/* end kiteConnected */}

        </div>{/* end pos-content */}

        <Footer activeTab="position" />
      </div>

      {/* Toast */}
      <div className={`pos-toast${toast ? ' show' : ''}`}>
        <i className="fas fa-circle-info" />
        <span>{toast}</span>
      </div>

      {/* ── Bottom Sheet Overlay ── */}
      <div className={`pos-sheet-overlay${isSheetOpen ? ' open' : ''}`} onClick={closeSheet} />

      {/* ── Bottom Sheet ── */}
      <div className={`pos-sheet${isSheetOpen ? ' open' : ''}`}>
        <div className="pos-sheet-handle">
          <div className="pos-sheet-handle-bar" />
        </div>

        {selectedPos && (() => {
          let posLtp = 0;
          let posPnl = 0;
          let posPnlPercent = 0;
          let posSide = selectedPos.side;
          let posSymbol = selectedPos.symbol;

          if ('ltp' in selectedPos) {
            posLtp = selectedPos.ltp;
            posPnl = selectedPos.pnl;
            posPnlPercent = selectedPos.pnlPercent;
          } else {
            posLtp = selectedPos.currentPrice;
            posPnl = selectedPos.pnl;
            posPnlPercent = selectedPos.pnlPercent;
          }

          const bidVal = (posLtp * 0.999).toFixed(2);
          const askVal = (posLtp * 1.001).toFixed(2);
          const changeVal = (posLtp * (Math.abs(posPnlPercent) / 100)).toFixed(2);
          const isGreen = posPnl >= 0;

          return (
            <div className="pos-sheet-content">

              {'status' in selectedPos && (selectedPos.status === 'COMPLETED' || selectedPos.status === 'CLOSED') ? (
                /* ── CLOSED POSITION DETAIL SHEET ── */
                (() => {
                  // Normalize both ClosedPosition and DetailedPosition into one shape
                  const isDetailed = 'entryPrice' in selectedPos;
                  const cp = {
                    symbol: selectedPos.symbol,
                    side: selectedPos.side,
                    pnl: selectedPos.pnl,
                    pnlPercent: selectedPos.pnlPercent,
                    qty: selectedPos.qty,
                    avgPrice: isDetailed ? (selectedPos as any).entryPrice : (selectedPos as any).avgPrice,
                    exitPrice: isDetailed ? (selectedPos as any).exitPrice : ((selectedPos as any).exitPrice ?? (selectedPos as any).ltp),
                    ltp: isDetailed ? (selectedPos as any).currentPrice : (selectedPos as any).ltp,
                    orderType: isDetailed ? '—' : (selectedPos as any).orderType,
                    entryTime: (selectedPos as any).entryTime,
                    exitTime: (selectedPos as any).exitTime,
                    exitReason: (selectedPos as any).exitReason as 'TP' | 'SL' | 'Manual' | undefined,
                  };
                  const fees = parseFloat((Math.abs(cp.pnl) * 0.002).toFixed(2));
                  const netPnl = parseFloat((cp.pnl - fees).toFixed(2));
                  const netGreen = netPnl >= 0;
                  const exit = cp.exitPrice ?? cp.ltp;

                  // Duration
                  const toMins = (t?: string) => {
                    if (!t) return 0;
                    const [time, mer] = t.split(' ');
                    let [h, m] = time.split(':').map(Number);
                    if (mer === 'PM' && h !== 12) h += 12;
                    if (mer === 'AM' && h === 12) h = 0;
                    return h * 60 + m;
                  };
                  const diffMins = Math.abs(toMins(cp.exitTime) - toMins(cp.entryTime));
                  const duration = diffMins >= 60 ? `${Math.floor(diffMins/60)}h ${diffMins%60}m` : `${diffMins}m`;
                  const exitLabel = cp.exitReason === 'TP' ? 'Exited via Take Profit' : cp.exitReason === 'SL' ? 'Exited via Stop Loss' : 'Exited Manually';
                  const exitColor = cp.exitReason === 'TP' ? '#059669' : cp.exitReason === 'SL' ? '#B22234' : '#6B7280';

                  return (
                    <>
                      {/* Header: symbol + exit price */}
                      <div className="ps-header-row">
                        <div className="ps-header-left">
                          <div className="ps-symbol">{cp.symbol}</div>
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }}>
                            <span className={`pos-badge${cp.side === 'LONG' ? ' long' : ' short'}`}>{cp.side}</span>
                            <span style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8' }}>{cp.orderType}</span>
                            <span style={{ fontSize: '0.65rem', fontWeight: '600', color: exitColor }}>· {cp.exitReason === 'TP' ? 'Take Profit' : cp.exitReason === 'SL' ? 'Stop Loss' : 'Manual'}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.6rem', fontWeight: '600', color: '#8C94A8', textTransform: 'uppercase', marginBottom: '2px' }}>Exit Price</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#1A1E2B' }}>{fmtPrice(exit)}</div>
                          <div className={isGreen ? 'ps-green' : 'ps-red'} style={{ fontSize: '0.7rem', fontWeight: '700' }}>
                            {isGreen ? '+' : ''}{cp.pnlPercent.toFixed(2)}%
                          </div>
                        </div>
                      </div>

                      <div style={{ height: '1px', background: '#F0F2F8', margin: '0 -4px' }} />

                      {/* BID / ASK card */}
                      <div style={{ background: '#F8FAFF', borderRadius: '16px', padding: '14px 16px', display: 'flex', alignItems: 'center' }}>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8', marginBottom: '6px' }}>AVG PRICE</div>
                          <div style={{ fontSize: '1rem', fontWeight: '700', color: '#059669' }}>{fmtPrice(cp.avgPrice)}</div>
                        </div>
                        <div style={{ width: '1px', background: '#E2E8F0', height: '28px' }} />
                        <div style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8', marginBottom: '6px' }}>EXIT PRICE</div>
                          <div style={{ fontSize: '1rem', fontWeight: '700', color: '#DC2626' }}>{fmtPrice(exit)}</div>
                        </div>
                      </div>

                      {/* TRADE SUMMARY */}
                      <div>
                        <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#5B677E', marginBottom: '10px' }}>TRADE SUMMARY</div>
                        <div style={{ background: '#F8FAFF', borderRadius: '16px', padding: '14px 16px', display: 'flex', justifyContent: 'space-between' }}>
                          {[
                            { label: 'QUANTITY', val: cp.qty.toLocaleString('en-US', { maximumFractionDigits: 4 }), color: '#1A1E2B' },
                            { label: 'DURATION', val: duration, color: '#1A1E2B' },
                            { label: 'NET P&L',  val: `${netGreen ? '+' : '-'}$${Math.abs(netPnl).toFixed(2)}`, color: netGreen ? '#059669' : '#B22234' },
                            { label: 'FEES',     val: `$${fees.toFixed(2)}`, color: '#6B7280' },
                          ].map(({ label, val, color }) => (
                            <div key={label} style={{ textAlign: 'center' }}>
                              <div style={{ fontSize: '0.6rem', fontWeight: '600', color: '#8C94A8', marginBottom: '6px' }}>{label}</div>
                              <div style={{ fontSize: '0.82rem', fontWeight: '700', color }}>{val}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Entry / Exit time card */}
                      <div style={{ background: '#F8FAFF', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i className="far fa-clock" /> ENTRY → EXIT
                        </div>
                        <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1A1E2B' }}>
                          {cp.entryTime ?? '—'} → {cp.exitTime ?? '—'}
                        </div>
                      </div>

                      {/* Realised P&L row */}
                      <div style={{ background: '#F8FAFF', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8', marginBottom: '4px' }}>REALISED P&amp;L</div>
                          <div className={isGreen ? 'ps-green' : 'ps-red'} style={{ fontSize: '1.2rem', fontWeight: '800' }}>
                            {isGreen ? '+' : '-'}${Math.abs(cp.pnl).toFixed(2)}
                          </div>
                        </div>
                        <div className={isGreen ? 'ps-green' : 'ps-red'} style={{ fontSize: '1rem', fontWeight: '700' }}>
                          {isGreen ? '+' : ''}{cp.pnlPercent.toFixed(2)}%
                        </div>
                      </div>

                      {/* BUY / SELL buttons */}
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={() => openTradeSheet('buy')} style={{ flex: 1, background: '#15803D', color: 'white', border: 'none', padding: '14px 0', borderRadius: '30px', fontSize: '1rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                          <i className="fas fa-arrow-up"></i> BUY
                        </button>
                        <button onClick={() => openTradeSheet('sell')} style={{ flex: 1, background: '#B91C1C', color: 'white', border: 'none', padding: '14px 0', borderRadius: '30px', fontSize: '1rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                          <i className="fas fa-arrow-down"></i> SELL
                        </button>
                      </div>
                    </>
                  );
                })()
              ) : (
                /* ── OPEN POSITION DETAIL SHEET ── */
                <>
                  {/* HEADER SECTION */}
                  <div className="ps-header-row">
                    <div className="ps-header-left">
                      <div className="ps-symbol">{posSymbol}</div>
                      <div className="ps-segment">INDEX-OPT | MIS</div>
                    </div>
                    <div className="ps-header-right">
                      <div className={`ps-price ${isGreen ? 'ps-green' : 'ps-red'}`}>{fmtPrice(posLtp)}</div>
                      <div className={`ps-change ${isGreen ? 'ps-green' : 'ps-red'}`}>
                        {isGreen ? '+' : '-'}{changeVal} ({isGreen ? '+' : ''}{posPnlPercent.toFixed(2)}%)
                      </div>
                    </div>
                  </div>

                  {/* BID / ASK ROW */}
                  <div className="ps-bidask-row">
                    <span>Bid: <span className="ps-red-text">{bidVal}</span></span>
                    <span>Ask: <span className="ps-red-text">{askVal}</span></span>
                  </div>

                  {/* OHLC ROW */}
                  <div className="ps-ohlc-row">
                    <span>O: {fmtPrice(posLtp * 0.98)}</span>
                    <span>H: {fmtPrice(posLtp * 1.02)}</span>
                    <span>L: {fmtPrice(posLtp * 0.95)}</span>
                    <span>C: {fmtPrice(posLtp * 0.99)}</span>
                  </div>

                  {/* CURRENT P&L SECTION */}
                  <div className="ps-pnl-section" style={{ padding: '12px 0' }}>
                    <div className="ps-pnl-left">
                      <div className="ps-pnl-label">Current P&amp;L</div>
                      <div className={`ps-pnl-value ${isGreen ? 'ps-green' : 'ps-red'}`}>
                        {isGreen ? '+' : '-'}${Math.abs(posPnl).toFixed(2)}
                      </div>
                    </div>
                    <div className="ps-pnl-right">
                      <button className="ps-btn-exit" onClick={closeSheet}>Exit All</button>
                    </div>
                  </div>

                  {/* BOTTOM ACTION BUTTONS */}
                  <div className="ps-action-row" style={{ marginTop: 'auto', paddingBottom: '8px' }}>
                    <button className="ps-btn-add" onClick={() => openTradeSheet('buy')}>Add More</button>
                    <button className="ps-btn-partial" onClick={() => openTradeSheet('sell')}>Partial Exit</button>
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Trade Sheet Overlay ── */}
      <div className={`trade-sheet-overlay${isTradeSheetOpen ? ' active' : ''}`} onClick={closeTradeSheet}></div>

      {/* ── Trade Sheet ── */}
      <div className={`trade-sheet${isTradeSheetOpen ? ' open' : ''}`} style={isTradeSheetOpen ? { top: 0, height: '100vh', borderRadius: 0, position: 'fixed', left: 0, width: '100%', overflowY: 'auto', zIndex: 9999 } : {}}>
        <div className="sheet-handle"><div className="handle-bar"></div></div>

        {selectedPos && (() => {
          let posLtp = 0;
          let posPnlPercent = 0;
          let posSymbol = selectedPos.symbol;
          if ('ltp' in selectedPos) {
            posLtp = selectedPos.ltp;
            posPnlPercent = selectedPos.pnlPercent;
          } else {
            posLtp = selectedPos.currentPrice;
            posPnlPercent = selectedPos.pnlPercent;
          }
          const isGreen = posPnlPercent >= 0;

          return (
            <>
              {/* ── HEADER ── */}
              <div className="ts-header">
                <button className="ts-back-btn" onClick={closeTradeSheet}>
                  <i className="fas fa-chevron-down"></i>
                </button>
                <div className="ts-name-block">
                  <div className="ts-instr-name">{posSymbol}</div>
                  <span className="ts-segment-badge">INDEX-OPT | MIS</span>
                </div>
                <div className="ts-price-block">
                  <div className="ts-price-value">{fmtPrice(posLtp)}</div>
                  <span className={`ts-change-badge ${isGreen ? 'positive' : 'negative'}`}>
                    {isGreen ? '+' : ''}{posPnlPercent.toFixed(2)}%
                  </span>
                </div>
              </div>

              {/* ── BID / ASK ROW ── */}
              <div className="ts-bidask-row">
                <div className="ts-ba-cell">
                  <span className="ts-ba-label">BID</span>
                  <span className="ts-ba-val bid-val">{fmtPrice(posLtp * 0.999)}</span>
                </div>
                <div className="ts-ba-divider"></div>
                <div className="ts-ba-cell">
                  <span className="ts-ba-label">ASK</span>
                  <span className="ts-ba-val ask-val">{fmtPrice(posLtp * 1.001)}</span>
                </div>
              </div>

              {/* ── SCROLLABLE BODY ── */}
              <div className="sheet-content-scroll" style={{ paddingBottom: '100px' }}>
                <div className="ts-body">
                  {/* QTY / LOT TOGGLE SWITCH */}
                  <div className="ts-section-card">
                    <div className="ts-qty-lot-row">
                      <span className="ts-section-label" style={{ marginBottom: 0 }}>Order Unit</span>
                      <div className="ts-toggle-switch">
                        <button className="ts-toggle-opt active">QTY</button>
                        <button className="ts-toggle-opt">LOT</button>
                      </div>
                    </div>
                  </div>

                  {/* INFO CARDS ROW */}
                  <div className="ts-info-cards-wrap">
                    <div className="ts-info-cards">
                      <div className="ts-info-card">
                        <div className="ts-ic-label">Lot Size</div>
                        <div className="ts-ic-val">1</div>
                      </div>
                      <div className="ts-info-card">
                        <div className="ts-ic-label">Max Lots</div>
                        <div className="ts-ic-val">500</div>
                      </div>
                      <div className="ts-info-card">
                        <div className="ts-ic-label">Order Lots</div>
                        <div className="ts-ic-val">{Math.max(1, tradeQty)}</div>
                      </div>
                      <div className="ts-info-card">
                        <div className="ts-ic-label">Total Qty</div>
                        <div className="ts-ic-val">{tradeQty}</div>
                      </div>
                    </div>
                  </div>

                  {/* QUANTITY STEPPER */}
                  <div className="ts-qty-container">
                    <div className="ts-section-label">Quantity</div>
                    <div className="ts-qty-stepper">
                      <button className="ts-qty-btn" onClick={() => setTradeQty(Math.max(1, tradeQty - 1))}>
                        <i className="fas fa-minus"></i>
                      </button>
                      <div className="ts-qty-val">{tradeQty}</div>
                      <button className="ts-qty-btn" onClick={() => setTradeQty(tradeQty + 1)}>
                        <i className="fas fa-plus"></i>
                      </button>
                    </div>
                    <div className="ts-qty-hint">1 Lot × 1 = {tradeQty} Qty</div>
                  </div>

                  {/* ORDER TYPE PILLS */}
                  <div className="ts-section-card">
                    <div className="ts-section-label">Order Type</div>
                    <div className="ts-pill-group">
                      <button className="ts-pill active">MARKET</button>
                      <button className="ts-pill">LIMIT</button>
                      <button className="ts-pill">SL-M</button>
                      <button className="ts-pill">GTT</button>
                    </div>
                  </div>

                  {/* PRODUCT TYPE PILLS */}
                  <div className="ts-section-card">
                    <div className="ts-section-label">Product Type</div>
                    <div className="ts-pill-group">
                      <button className="ts-pill active">INTRADAY</button>
                      <button className="ts-pill">CARRY</button>
                    </div>
                  </div>

                  {/* MARGIN SECTION */}
                  <div className="ts-margin-card">
                    <div className="ts-margin-row">
                      <span className="ts-ml">Available</span>
                      <span className="ts-mv avail">₹ 4,50,000.00</span>
                    </div>
                    <div className="ts-margin-row">
                      <span className="ts-ml">Required Margin</span>
                      <span className="ts-mv required">₹ {(posLtp * tradeQty).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── STICKY BUY / SELL FOOTER ── */}
              <div className={`ts-sticky-footer ${isTradeSheetOpen ? 'visible' : ''}`}>
                {selectedAction === 'buy' && (
                  <button className="ts-btn ts-btn-buy" style={{ width: '100%' }} onClick={executeTrade}>BUY</button>
                )}
                {selectedAction === 'sell' && (
                  <button className="ts-btn ts-btn-sell" style={{ width: '100%' }} onClick={executeTrade}>SELL</button>
                )}
              </div>
            </>
          );
        })()}
      </div>
      {/* ── Exit All Confirmation Modal ── */}
      {showExitConfirm && (
        <div
          className="confirm-backdrop"
          onClick={() => setShowExitConfirm(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm exit all positions"
        >
          <div
            className="confirm-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-icon">
              <i className="fas fa-exclamation-triangle" />
            </div>
            <div className="confirm-title">Exit All Positions?</div>
            <div className="confirm-message">
              Are you sure you want to exit all positions? This action cannot be undone.
            </div>
            <div className="confirm-actions">
              <button
                className="confirm-btn confirm-btn-cancel"
                onClick={() => setShowExitConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="confirm-btn confirm-btn-exit"
                onClick={() => {
                  exitAllPositions();
                  setShowExitConfirm(false);
                }}
              >
                <i className="fas fa-sign-out-alt" />
                Yes, Exit All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
