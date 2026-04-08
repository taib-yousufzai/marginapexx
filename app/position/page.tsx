'use client';
import { useState, useEffect, useRef } from 'react';
import Footer from '@/components/Footer';
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
};

export default function PositionPage() {
  const [currentMain, setCurrentMain] = useState<'cumulative' | 'detailed'>('cumulative');
  const [currentSub, setCurrentSub] = useState<'open' | 'closed'>('open');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [openPositions, setOpenPositions] = useState<Position[]>([
    { id: 1, symbol: 'BTC/USD', side: 'LONG',  avgPrice: 61800.00, qty: 0.025, pnl: 36.25, pnlPercent: 2.34,  ltp: 63250.00, orderType: 'SLM' },
    { id: 2, symbol: 'ETH/USD', side: 'SHORT', avgPrice: 3150.50,  qty: 0.5,   pnl: 35.25, pnlPercent: 2.24,  ltp: 3080.00,  orderType: 'GTT' },
    { id: 3, symbol: 'SOL/USD', side: 'LONG',  avgPrice: 142.80,   qty: 2.25,  pnl: 12.83, pnlPercent: 3.99,  ltp: 148.50,   orderType: 'SLM' },
    { id: 4, symbol: 'DOGE/USD',side: 'LONG',  avgPrice: 0.1245,   qty: 1500,  pnl: 10.05, pnlPercent: 5.38,  ltp: 0.1312,   orderType: 'GTT' },
  ]);

  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([
    { symbol: 'BTC/USD',  side: 'LONG',  avgPrice: 60500.00, qty: 0.02, pnl: 55.00,  pnlPercent: 4.55,  ltp: 63250.00, orderType: 'SLM', status: 'COMPLETED' },
    { symbol: 'ETH/USD',  side: 'SHORT', avgPrice: 3220.50,  qty: 0.3,  pnl: 42.15,  pnlPercent: 4.36,  ltp: 3080.00,  orderType: 'GTT', status: 'COMPLETED' },
    { symbol: 'SOL/USD',  side: 'LONG',  avgPrice: 138.50,   qty: 1.5,  pnl: 15.00,  pnlPercent: 7.22,  ltp: 148.50,   orderType: 'SLM', status: 'COMPLETED' },
    { symbol: 'AVAX/USD', side: 'LONG',  avgPrice: 27.80,    qty: 8.0,  pnl: 13.60,  pnlPercent: 6.12,  ltp: 29.50,    orderType: 'GTT', status: 'COMPLETED' },
    { symbol: 'LINK/USD', side: 'SHORT', avgPrice: 13.85,    qty: 12.0, pnl: 7.20,   pnlPercent: 4.33,  ltp: 13.25,    orderType: 'SLM', status: 'COMPLETED' },
    { symbol: 'NEAR/USD', side: 'LONG',  avgPrice: 3.42,     qty: 25.0, pnl: 10.75,  pnlPercent: 12.57, ltp: 3.85,     orderType: 'GTT', status: 'COMPLETED' },
  ]);

  const [detailedPositions, setDetailedPositions] = useState<DetailedPosition[]>([
    { id: 1, symbol: 'BTC/USD', side: 'LONG',  qty: 0.015, entryPrice: 61200.00, exitPrice: 63250.00, currentPrice: 63250.00, pnl: 30.75, pnlPercent: 3.35, status: 'CLOSED', date: 'Mar 31', exitTime: '02:15 PM' },
    { id: 2, symbol: 'BTC/USD', side: 'LONG',  qty: 0.01,  entryPrice: 61800.00, exitPrice: null,     currentPrice: 63250.00, pnl: 14.50, pnlPercent: 2.35, status: 'OPEN',   date: 'Mar 31', entryTime: '11:30 AM' },
    { id: 3, symbol: 'ETH/USD', side: 'SHORT', qty: 0.3,   entryPrice: 3220.50,  exitPrice: 3080.00,  currentPrice: 3080.00,  pnl: 42.15, pnlPercent: 4.36, status: 'CLOSED', date: 'Mar 31', exitTime: '03:45 PM' },
    { id: 4, symbol: 'ETH/USD', side: 'SHORT', qty: 0.2,   entryPrice: 3150.50,  exitPrice: null,     currentPrice: 3080.00,  pnl: 14.10, pnlPercent: 2.24, status: 'OPEN',   date: 'Mar 31', entryTime: '10:15 AM' },
    { id: 5, symbol: 'SOL/USD', side: 'LONG',  qty: 1.5,   entryPrice: 138.50,   exitPrice: 148.50,   currentPrice: 148.50,   pnl: 15.00, pnlPercent: 7.22, status: 'CLOSED', date: 'Mar 30', exitTime: '01:30 PM' },
    { id: 6, symbol: 'SOL/USD', side: 'LONG',  qty: 0.75,  entryPrice: 142.80,   exitPrice: null,     currentPrice: 148.50,   pnl: 4.28,  pnlPercent: 4.00, status: 'OPEN',   date: 'Mar 30', entryTime: '09:45 AM' },
  ]);

  useEffect(() => {
    const saved = localStorage.getItem('marginApexTheme');
    if (saved === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
  }, []);

  // Live price simulation for open positions
  useEffect(() => {
    const interval = setInterval(() => {
      setOpenPositions(prev =>
        prev.map(pos => {
          const change = (Math.random() - 0.5) * (pos.symbol === 'BTC/USD' ? 200 : pos.symbol === 'ETH/USD' ? 30 : 5);
          const newLtp = Math.max(0.01, pos.ltp + change);
          const newPnl = pos.side === 'LONG' ? (newLtp - pos.avgPrice) * pos.qty : (pos.avgPrice - newLtp) * pos.qty;
          return { ...pos, ltp: newLtp, pnl: newPnl, pnlPercent: (newPnl / (pos.avgPrice * pos.qty)) * 100 };
        })
      );
      setDetailedPositions(prev =>
        prev.map(pos => {
          if (pos.status !== 'OPEN') return pos;
          const change = (Math.random() - 0.5) * (pos.symbol === 'BTC/USD' ? 200 : pos.symbol === 'ETH/USD' ? 30 : 5);
          const newCurrent = Math.max(0.01, pos.currentPrice + change);
          const newPnl = pos.side === 'LONG' ? (newCurrent - pos.entryPrice) * pos.qty : (pos.entryPrice - newCurrent) * pos.qty;
          return { ...pos, currentPrice: newCurrent, pnl: newPnl, pnlPercent: (newPnl / (pos.entryPrice * pos.qty)) * 100 };
        })
      );
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  };

  const exitAllPositions = () => {
    const hasOpen = openPositions.length > 0 || detailedPositions.some(p => p.status === 'OPEN');
    if (!hasOpen) { showToast('No open positions to exit'); return; }

    const total = openPositions.length + detailedPositions.filter(p => p.status === 'OPEN').length;
    const now = new Date();
    const exitTimeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

    setClosedPositions(prev => [
      ...openPositions.map(pos => ({
        symbol: pos.symbol, side: pos.side, avgPrice: pos.avgPrice,
        qty: pos.qty, pnl: pos.pnl, pnlPercent: pos.pnlPercent,
        ltp: pos.ltp, orderType: pos.orderType, status: 'COMPLETED',
      })),
      ...prev,
    ]);
    setOpenPositions([]);
    setDetailedPositions(prev =>
      prev.map(p =>
        p.status === 'OPEN'
          ? { ...p, status: 'CLOSED' as const, exitPrice: p.currentPrice, exitTime: exitTimeStr }
          : p
      )
    );
    showToast(`Exited ${total} position${total > 1 ? 's' : ''} successfully`);
  };

  const filteredOpen     = openPositions;
  const filteredClosed   = closedPositions;
  const filteredDetailed = detailedPositions;

  // Totals (always based on full data, not filtered)
  const realized   = closedPositions.reduce((s, p) => s + p.pnl, 0);
  const unrealized = openPositions.reduce((s, p) => s + p.pnl, 0);
  const totalPnl   = realized + unrealized;

  const fmtUSD   = (v: number) => (v >= 0 ? '+' : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPrice = (v: number) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 });

  const hasOpenPositions = openPositions.length > 0 || detailedPositions.some(p => p.status === 'OPEN');

  // Detailed: which list to show based on sub-tab
  const detailedTargetStatus = currentSub === 'open' ? 'OPEN' : 'CLOSED';
  const detailedDisplayed    = filteredDetailed.filter(p => p.status === detailedTargetStatus);

  return (
    <div className="pos-root">
      <div className="pos-shell">

        {/* ── Header ── */}
        <div className="pos-header">
          <div className="pos-header-left">
            <div className="pos-brand">
              <i className="fas fa-chart-line pos-brand-icon" />
              MARGIN APEX
            </div>
            <div className="pos-brand-sub">Position Management • Real-time P&amp;L</div>
          </div>
          <button
            className={`pos-exit-btn${!hasOpenPositions ? ' disabled' : ''}`}
            onClick={exitAllPositions}
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

        {/* ── Scrollable Content ── */}
        <div className="pos-content">

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

          {/* ── Shared Sub-Tabs (visible in BOTH views) ── */}
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

          {/* ── Cumulative View ── */}
          {currentMain === 'cumulative' && (
            currentSub === 'open' ? (
              filteredOpen.length === 0 ? (
                <div className="pos-empty">
                  <i className="fas fa-chart-simple" />
                  <p>No open positions</p>
                </div>
              ) : filteredOpen.map(pos => (
                <div key={pos.id} className="pos-card">
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
                <div key={i} className="pos-card">
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
                <i className={currentSub === 'open' ? 'fas fa-chart-line' : 'fas fa-history'} />
                <p>{currentSub === 'open' ? 'No open trades' : 'No closed trades'}</p>
              </div>
            ) : detailedDisplayed.map(pos => (
              <div key={pos.id} className="pos-detail-card">
                <div className="pos-detail-left">
                  <div className="pos-detail-symbol">
                    {pos.symbol} <span className="pos-detail-side">{pos.side}</span>
                  </div>
                  <div className="pos-detail-meta">
                    <span>Qty: <strong>{pos.qty.toFixed(4)}</strong></span>
                    <span>Entry: <strong>{fmtPrice(pos.entryPrice)}</strong></span>
                    {pos.status === 'OPEN'
                      ? <span>Current: <strong>{fmtPrice(pos.currentPrice)}</strong></span>
                      : <span>Exit: <strong>{fmtPrice(pos.exitPrice!)}</strong></span>
                    }
                    <span>Time: <strong>{pos.status === 'OPEN' ? pos.entryTime : pos.exitTime}</strong></span>
                    <span>Date: <strong>{pos.date}</strong></span>
                  </div>
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
            ))
          )}

        </div>{/* end pos-content */}

        <Footer activeTab="position" />
      </div>

      {/* Toast */}
      <div className={`pos-toast${toast ? ' show' : ''}`}>
        <i className="fas fa-circle-info" />
        <span>{toast}</span>
      </div>
    </div>
  );
}
