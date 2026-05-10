'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMyPositions, EnrichedPosition } from '@/hooks/useMyPositions';
import { useOrderEntry } from '@/hooks/useOrderEntry';
import Sidebar from '@/components/Sidebar';
import Navbar from '@/components/Navbar';
import NotificationDrawer from '@/components/NotificationDrawer';
import Footer from '@/components/Footer';
import './page.css';

export default function PositionPage() {
  useAuth();
  const { positions, loading: posLoading, error: posError, refresh } = useMyPositions(5000);
  const { closePosition, loading: closingPos } = useOrderEntry();

  const [currentMain, setCurrentMain] = useState<'cumulative' | 'detailed'>('cumulative');
  const [currentSub, setCurrentSub] = useState<'open' | 'closed'>('open');
  const [selectedPos, setSelectedPos] = useState<EnrichedPosition | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleRowClick = (pos: EnrichedPosition) => {
    setSelectedPos(pos);
    setIsSheetOpen(true);
  };

  const closeSheet = () => {
    setIsSheetOpen(false);
    setSelectedPos(null);
  };

  const handleExit = async (posId: string) => {
    const res = await closePosition(posId);
    if (res.success) {
      showToast('Position closed successfully');
      closeSheet();
      refresh();
    } else {
      showToast(`Error: ${res.error}`);
    }
  };

  const openPositions = positions.filter(p => p.status === 'open' || p.status === 'active');
  const closedPositions = positions.filter(p => p.status === 'closed');
  const hasOpenPositions = openPositions.length > 0;

  const totalPnl = positions.reduce((acc, p) => acc + (p.total_pnl || 0), 0);
  const realized = positions.filter(p => p.status === 'closed').reduce((acc, p) => acc + (p.pnl || 0), 0);
  const unrealized = positions.filter(p => p.status === 'open' || p.status === 'active').reduce((acc, p) => acc + (p.total_pnl || 0), 0);

  const fmtUSD = (val: number) => {
    const sign = val >= 0 ? '+' : '';
    return `${sign}₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fmtPrice = (val: number) => {
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="desktop-layout">
      <Sidebar />
      
      <main className="main-viewport">
        <div className="app-container">
          <div className="pos-root">
            <div className="pos-shell">

              <Navbar title="Positions" onNotifClick={() => setIsNotifDrawerOpen(true)} />

              {/* ── Desktop Page Header ── */}
              <div className="desktop-only" style={{ padding: '20px 24px 0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Positions</h1>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>Internal Execution • Real-time P&amp;L</p>
                </div>
                <button
                  className={`pos-exit-btn${!hasOpenPositions ? ' disabled' : ''}`}
                  onClick={() => { if (hasOpenPositions) showToast('Use detailed view to close individual positions.'); }}
                  style={{ padding: '10px 20px', fontSize: '0.9rem' }}
                >
                  <i className="fas fa-sign-out-alt" />
                  <span>Exit All Positions</span>
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

              {/* ── Content ── */}
              <div className="pos-content">

                {posLoading && (
                  <div className="pos-empty">
                    <i className="fas fa-circle-notch fa-spin" />
                    <p>Loading positions…</p>
                  </div>
                )}

                {!posLoading && !posError && (
                  currentMain === 'cumulative' ? (
                    currentSub === 'open' ? (
                      openPositions.length === 0 ? (
                        <div className="pos-empty">
                          <i className="fas fa-chart-simple" />
                          <p>No open positions</p>
                        </div>
                      ) : openPositions.map(pos => (
                        <div key={pos.id} className="pos-card" onClick={() => handleRowClick(pos)}>
                          <div className="pos-card-left">
                            <div className="pos-card-symbol">{pos.symbol}</div>
                            <div className="pos-card-details">
                              <span>Avg Price: <strong>{fmtPrice(pos.entry_price)}</strong></span>
                              <span>Qty: <strong>{pos.qty_open}</strong></span>
                            </div>
                          </div>
                          <div className="pos-card-right">
                            <span className={`pos-badge${pos.side === 'BUY' ? ' long' : ' short'}`}>
                              {pos.side}
                            </span>
                            <div className={`pos-card-pnl${pos.total_pnl >= 0 ? ' green' : ' red'}`}>
                              P&amp;L: {pos.total_pnl >= 0 ? '+' : ''}₹{pos.total_pnl.toFixed(2)} ({pos.pnl_percent >= 0 ? '+' : ''}{pos.pnl_percent.toFixed(2)}%)
                            </div>
                            <div className="pos-card-ltp">LTP: <strong>{fmtPrice(pos.current_ltp)}</strong></div>
                          </div>
                        </div>
                      ))
                    ) : (
                      closedPositions.length === 0 ? (
                        <div className="pos-empty">
                          <i className="fas fa-history" />
                          <p>No closed positions</p>
                        </div>
                      ) : closedPositions.map(pos => (
                        <div key={pos.id} className="pos-card" onClick={() => handleRowClick(pos)}>
                          <div className="pos-card-left">
                            <div className="pos-card-symbol">{pos.symbol}</div>
                            <div className="pos-card-details">
                              <span>Entry: <strong>{fmtPrice(pos.entry_price)}</strong></span>
                              <span>Qty: <strong>{pos.qty_total}</strong></span>
                            </div>
                          </div>
                          <div className="pos-card-right">
                            <span className={`pos-badge${pos.side === 'BUY' ? ' long' : ' short'}`}>
                              {pos.side}
                            </span>
                            <div className={`pos-card-pnl${pos.pnl >= 0 ? ' green' : ' red'}`}>
                              P&amp;L: {pos.pnl >= 0 ? '+' : ''}₹{pos.pnl.toFixed(2)} ({pos.pnl_percent >= 0 ? '+' : ''}{pos.pnl_percent.toFixed(2)}%)
                            </div>
                            <div className="pos-card-ltp">Exit: <strong>{fmtPrice(pos.exit_price || 0)}</strong></div>
                          </div>
                        </div>
                      ))
                    )
                  ) : (
                    /* Detailed View */
                    positions.length === 0 ? (
                      <div className="pos-empty">
                        <i className="fas fa-list" />
                        <p>No trades available</p>
                      </div>
                    ) : positions.map(pos => (
                      <div key={pos.id} className="pos-detail-card" onClick={() => handleRowClick(pos)}>
                        <div className="pos-detail-header-row">
                          <div className="pos-detail-symbol">
                            {pos.symbol} <span className="pos-detail-side">{pos.side}</span>
                          </div>
                          <div className="pos-detail-right">
                            <div className={`pos-detail-pnl${pos.total_pnl >= 0 ? ' green' : ' red'}`}>
                              {pos.total_pnl >= 0 ? '+' : ''}₹{pos.total_pnl.toFixed(2)}
                            </div>
                            <div className="pos-detail-pct">{pos.pnl_percent >= 0 ? '+' : ''}{pos.pnl_percent.toFixed(2)}%</div>
                            <span className={`pos-status-badge ${pos.status}`}>
                              {pos.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="pos-detail-meta">
                          <span>Qty: <strong>{pos.qty_open || pos.qty_total}</strong></span>
                          <span>Entry: <strong>{fmtPrice(pos.entry_price)}</strong></span>
                          {pos.status === 'closed'
                            ? <span>Exit: <strong>{fmtPrice(pos.exit_price || 0)}</strong></span>
                            : <span>Current: <strong>{fmtPrice(pos.current_ltp)}</strong></span>
                          }
                        </div>
                      </div>
                    ))
                  )
                )}
              </div>

              <Footer activeTab="position" />
            </div>

            {/* Sheet */}
            <div className={`pos-sheet-overlay${isSheetOpen ? ' open' : ''}`} onClick={closeSheet} />
            <div className={`pos-sheet${isSheetOpen ? ' open' : ''}`}>
              <div className="pos-sheet-handle"><div className="pos-sheet-handle-bar" /></div>
              {selectedPos && (
                <div className="pos-sheet-content">
                  <div className="ps-header-row">
                    <div className="ps-header-left">
                      <div className="ps-symbol">{selectedPos.symbol}</div>
                      <div className="ps-segment">INTERNAL POSITION</div>
                    </div>
                    <div className="ps-header-right">
                      <div className={`ps-price ${selectedPos.total_pnl >= 0 ? 'ps-green' : 'ps-red'}`}>
                        {fmtPrice(selectedPos.current_ltp)}
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: '20px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Entry Price</span>
                      <span style={{ fontWeight: 700 }}>{fmtPrice(selectedPos.entry_price)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Quantity</span>
                      <span style={{ fontWeight: 700 }}>{selectedPos.qty_open || selectedPos.qty_total}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Side</span>
                      <span className={`pos-badge ${selectedPos.side === 'BUY' ? 'long' : 'short'}`}>{selectedPos.side}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>P&amp;L</span>
                      <span style={{ fontWeight: 800, fontSize: '1.2rem' }} className={selectedPos.total_pnl >= 0 ? 'ps-green' : 'ps-red'}>
                        {fmtUSD(selectedPos.total_pnl)}
                      </span>
                    </div>
                  </div>

                  {selectedPos.status === 'open' && (
                    <div className="ps-action-row">
                      <button className="ps-btn-exit" style={{ width: '100%' }} onClick={() => handleExit(selectedPos.id)}>Close Position</button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className={`pos-toast${toast ? ' show' : ''}`}>
              <i className="fas fa-circle-info" />
              <span>{toast}</span>
            </div>
          </div>
        </div>
      </main>
      <NotificationDrawer isOpen={isNotifDrawerOpen} onClose={() => setIsNotifDrawerOpen(false)} />
    </div>
  );
}
