'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMyPositions, EnrichedPosition } from '@/hooks/useMyPositions';
import { useOrderEntry } from '@/hooks/useOrderEntry';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import TradeSheet, { TradeSheetItem } from '@/components/TradeSheet';
import './page.css';

export default function PositionPage() {
  useAuth();
  const { positions, loading: posLoading, error: posError, refresh } = useMyPositions(1000);
  const { closePosition, loading: closingPos } = useOrderEntry();

  const [currentMain, setCurrentMain] = useState<'cumulative' | 'detailed'>('cumulative');
  const [currentSub, setCurrentSub] = useState<'open' | 'closed'>('open');
  const [selectedPos, setSelectedPos] = useState<EnrichedPosition | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Add More trade sheet
  const [tradeSheetItem, setTradeSheetItem] = useState<TradeSheetItem | null>(null);
  const [tradeSheetSide, setTradeSheetSide] = useState<'BUY' | 'SELL' | 'BOTH'>('BUY');

  // Inline expand for open positions
  const [expandedPosId, setExpandedPosId] = useState<string | null>(null);

  const toggleExpand = (posId: string) => {
    setExpandedPosId(prev => prev === posId ? null : posId);
  };

  const openAddMore = (pos: EnrichedPosition) => {
    setTradeSheetItem({
      name: pos.symbol,
      symbol: pos.symbol,
      kiteSymbol: pos.symbol,
      segment: pos.settlement || 'INR',
      price: pos.current_ltp,
      change: `${pos.pnl_percent >= 0 ? '+' : ''}${pos.pnl_percent.toFixed(2)}%`,
    });
    setTradeSheetSide(pos.side);
  };

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

  const fmtUSD = (val: number, settlement?: string) => {
    const isUSD = settlement && (settlement.toUpperCase().includes('CRYPTO') || settlement.toUpperCase().includes('COMEX'));
    const sign = val >= 0 ? '+' : '';
    return `${sign}${isUSD ? '$' : '₹'}${Math.abs(val).toLocaleString(isUSD ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fmtPrice = (val: number, settlement?: string) => {
    const isUSD = settlement && (settlement.toUpperCase().includes('CRYPTO') || settlement.toUpperCase().includes('COMEX'));
    return `${isUSD ? '$' : '₹'}${val.toLocaleString(isUSD ? 'en-US' : 'en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="desktop-layout">
      <Sidebar />
      
      <main className="main-viewport">
        <div className="app-container">
          <div className="pos-root">
            <div className="pos-shell">

              {/* ── Header (Mobile Only) ── */}
              <div className="pos-header mobile-only">
                <div className="pos-header-left">
                  <div className="pos-brand">
                    <span>MARGIN<span className="apex-text">APEX</span></span>
                  </div>
                  <div className="pos-brand-sub">Internal Positions • Real-time P&amp;L</div>
                </div>
                <button
                  className={`pos-exit-btn${!hasOpenPositions ? ' disabled' : ''}`}
                  onClick={() => { if (hasOpenPositions) showToast('Use detailed view to close individual positions.'); }}
                >
                  <i className="fas fa-sign-out-alt" />
                  <span>Exit All</span>
                </button>
              </div>

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
                  onClick={() => { setCurrentMain('cumulative'); setExpandedPosId(null); }}
                >
                  Cumulative P&amp;L
                </div>
                <div
                  className={`pos-main-tab${currentMain === 'detailed' ? ' active' : ''}`}
                  onClick={() => { setCurrentMain('detailed'); setExpandedPosId(null); }}
                >
                  Detailed P&amp;L
                </div>
              </div>

              {/* ── Sticky Sub-Header (P&L + Sub-Tabs) ── */}
              <div className="pos-sticky-subheader">
                <div className="pos-pnl-card">
                  <div className="pos-pnl-card-title">Today's P&amp;L</div>
                  <div className="pos-pnl-card-body">
                    {currentMain === 'cumulative' && currentSub === 'closed' && (
                      <div className="pos-pnl-col left">
                        <div className="pos-pnl-label">Realized</div>
                        <div className={`pos-pnl-val${realized >= 0 ? ' green' : ' red'}`}>{fmtUSD(realized)}</div>
                      </div>
                    )}
                    <div className="pos-pnl-col center">
                      <div className={`pos-pnl-total${totalPnl >= 0 ? ' green' : ' red'}`}>{fmtUSD(totalPnl)}</div>
                    </div>
                    {currentMain === 'cumulative' && currentSub === 'closed' && (
                      <div className="pos-pnl-col right">
                        <div className="pos-pnl-label">Unrealized</div>
                        <div className={`pos-pnl-val${unrealized >= 0 ? ' green' : ' red'}`}>{fmtUSD(unrealized)}</div>
                      </div>
                    )}
                  </div>
                </div>

                {currentMain === 'cumulative' && (
                  <div className="pos-sub-tabs">
                    <div
                      className={`pos-sub-tab${currentSub === 'open' ? ' active' : ''}`}
                      onClick={() => { setCurrentSub('open'); setExpandedPosId(null); }}
                    >
                      Open Positions
                    </div>
                    <div
                      className={`pos-sub-tab${currentSub === 'closed' ? ' active' : ''}`}
                      onClick={() => { setCurrentSub('closed'); setExpandedPosId(null); }}
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
                        <div key={pos.id} className={`pos-card${expandedPosId === pos.id ? ' pos-card--expanded' : ''}`} onClick={() => toggleExpand(pos.id)}>
                          <div className="pos-card-main">
                            <div className="pos-card-left">
                              <div className="pos-card-symbol">{pos.symbol}</div>
                              <div className="pos-card-details">
                                <span>Avg: <strong>{fmtPrice(pos.entry_price, pos.settlement)}</strong></span>
                                <span>Qty: <strong>{pos.qty_open}</strong></span>
                              </div>
                            </div>
                            <div className="pos-card-right">
                              <span className={`pos-badge${pos.side === 'BUY' ? ' long' : ' short'}`}>{pos.side}</span>
                              <div className={`pos-card-pnl${pos.total_pnl >= 0 ? ' green' : ' red'}`}>
                                P&amp;L: {fmtUSD(pos.total_pnl, pos.settlement)} ({pos.pnl_percent >= 0 ? '+' : ''}{pos.pnl_percent.toFixed(2)}%)
                              </div>
                              <div className="pos-card-ltp">LTP: <strong>{fmtPrice(pos.current_ltp, pos.settlement)}</strong></div>
                            </div>
                          </div>
                          {expandedPosId === pos.id && (
                            <div className="pos-card-actions" onClick={e => e.stopPropagation()}>
                              <button className="pca-btn pca-add" onClick={() => openAddMore(pos)}>
                                <i className="fas fa-plus-circle" /> Add More
                              </button>
                              <button className="pca-btn pca-exit" onClick={() => handleExit(pos.id)} disabled={closingPos}>
                                <i className="fas fa-times-circle" /> Exit
                              </button>
                            </div>
                          )}
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
                              <span>Entry: <strong>{fmtPrice(pos.entry_price, pos.settlement)}</strong></span>
                              <span>Qty: <strong>{pos.qty_total}</strong></span>
                            </div>
                          </div>
                          <div className="pos-card-right">
                            <span className={`pos-badge${pos.side === 'BUY' ? ' long' : ' short'}`}>
                              {pos.side}
                            </span>
                            <div className={`pos-card-pnl${pos.pnl >= 0 ? ' green' : ' red'}`}>
                              P&amp;L: {fmtUSD(pos.pnl, pos.settlement)} ({pos.pnl_percent >= 0 ? '+' : ''}{pos.pnl_percent.toFixed(2)}%)
                            </div>
                            <div className="pos-card-ltp">Exit: <strong>{fmtPrice(pos.exit_price || 0, pos.settlement)}</strong></div>
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
                      <div
                        key={pos.id}
                        className={`pos-detail-card${expandedPosId === pos.id ? ' pos-detail-card--expanded' : ''}`}
                        onClick={() => {
                          if (pos.status === 'closed') {
                            handleRowClick(pos);
                          } else {
                            toggleExpand(pos.id);
                          }
                        }}
                      >
                        <div className="pos-detail-header-row">
                          <div className="pos-detail-symbol">
                            {pos.symbol} <span className="pos-detail-side">{pos.side}</span>
                          </div>
                          <div className="pos-detail-right">
                            <div className={`pos-detail-pnl${pos.total_pnl >= 0 ? ' green' : ' red'}`}>
                              {fmtUSD(pos.total_pnl, pos.settlement)}
                            </div>
                            <div className="pos-detail-pct">{pos.pnl_percent >= 0 ? '+' : ''}{pos.pnl_percent.toFixed(2)}%</div>
                            <span className={`pos-status-badge ${pos.status}`}>
                              {pos.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="pos-detail-meta">
                          <span>Qty: <strong>{pos.qty_open || pos.qty_total}</strong></span>
                          <span>Entry: <strong>{fmtPrice(pos.entry_price, pos.settlement)}</strong></span>
                          {pos.status === 'closed'
                            ? <span>Exit: <strong>{fmtPrice(pos.exit_price || 0, pos.settlement)}</strong></span>
                            : <span>Current: <strong>{fmtPrice(pos.current_ltp, pos.settlement)}</strong></span>
                          }
                        </div>
                        {expandedPosId === pos.id && (pos.status === 'open' || pos.status === 'active') && (
                          <div className="pos-card-actions" onClick={e => e.stopPropagation()}>
                            <button className="pca-btn pca-add" onClick={() => openAddMore(pos)}>
                              <i className="fas fa-plus-circle" /> Add More
                            </button>
                            <button className="pca-btn pca-exit" onClick={() => handleExit(pos.id)} disabled={closingPos}>
                              <i className="fas fa-times-circle" /> Exit
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )
                )}
              </div>

              <Footer activeTab="position" />
            </div>

            {/* Sheet */}
            <div className={`pos-sheet-overlay${isSheetOpen ? ' open' : ''}`} onClick={closeSheet} />
            <div className={`pos-sheet${isSheetOpen ? ' open' : ''}${selectedPos?.status === 'closed' ? ' pos-sheet--closed' : ''}`}>
              <div className="pos-sheet-handle"><div className="pos-sheet-handle-bar" /></div>
              {selectedPos && (
                <div className="pos-sheet-content">
                  {/* Header */}
                  <div className="ps-header-row">
                    <div className="ps-header-left">
                      <div className="ps-symbol">{selectedPos.symbol}</div>
                      <div className="ps-segment">INTERNAL POSITION</div>
                    </div>
                    <div className="ps-header-right">
                      <div className={`ps-price ${selectedPos.total_pnl >= 0 ? 'ps-green' : 'ps-red'}`}>
                        {fmtPrice(selectedPos.current_ltp, selectedPos.settlement)}
                      </div>
                      <div className={`ps-change ${selectedPos.pnl_percent >= 0 ? 'ps-green' : 'ps-red'}`}>
                        {selectedPos.pnl_percent >= 0 ? '+' : ''}{selectedPos.pnl_percent.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  {/* Bid / Ask */}
                  <div className="ps-bidask-row">
                    <div>
                      <div className="ps-ba-label">BID</div>
                      <div className="ps-ba-bid">{selectedPos.current_ltp > 0 ? (selectedPos.current_ltp - 0.20).toFixed(2) : '---'}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="ps-ba-label">ASK</div>
                      <div className="ps-ba-ask">{selectedPos.current_ltp > 0 ? (selectedPos.current_ltp + 0.20).toFixed(2) : '---'}</div>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="ps-meta-row">
                    <div>
                      <div className="ps-meta-label">Avg Price</div>
                      <div className="ps-meta-val">{fmtPrice(selectedPos.entry_price, selectedPos.settlement)}</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div className="ps-meta-label">Quantity</div>
                      <div className="ps-meta-val">{selectedPos.qty_open || selectedPos.qty_total}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div className="ps-meta-label">Side</div>
                      <span className={`pos-badge ${selectedPos.side === 'BUY' ? 'long' : 'short'}`} style={{ fontSize: '0.75rem', padding: '4px 14px' }}>{selectedPos.side}</span>
                    </div>
                  </div>

                  {/* P&L + Exit All */}
                  {selectedPos.status === 'open' && (
                    <div className="ps-pnl-section">
                      <div>
                        <div className="ps-pnl-label">Current P&amp;L</div>
                        <div className={`ps-pnl-value ${selectedPos.total_pnl >= 0 ? 'ps-green' : 'ps-red'}`}>
                          {selectedPos.total_pnl >= 0 ? '+' : ''}{fmtUSD(selectedPos.total_pnl, selectedPos.settlement)}
                        </div>
                      </div>
                      <button className="ps-btn-exit" onClick={() => handleExit(selectedPos.id)}>Exit All</button>
                    </div>
                  )}

                  {/* Add More / Partial Exit */}
                  {selectedPos.status === 'open' && (
                    <div className="ps-action-row">
                      <button className="ps-btn-add" onClick={() => openAddMore(selectedPos)}>Add More</button>
                      <button className="ps-btn-partial" onClick={() => handleExit(selectedPos.id)}>Partial Exit</button>
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

      {/* Add More — full watchlist-style trade sheet */}
      <TradeSheet
        item={tradeSheetItem}
        side={tradeSheetSide}
        onClose={() => setTradeSheetItem(null)}
        onSuccess={refresh}
      />
    </div>
  );
}
