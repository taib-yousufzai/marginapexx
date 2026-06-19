'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getSession } from '@/lib/auth';
import { pageCache } from '@/lib/pageCache';
import { useMyPositions, EnrichedPosition } from '@/hooks/useMyPositions';
import { useOrderEntry } from '@/hooks/useOrderEntry';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import TradeSheet, { TradeSheetItem } from '@/components/TradeSheet';
import dynamic from 'next/dynamic';
import './page.css';

const TradingChart = dynamic(() => import('@/components/TradingChart'), { ssr: false });


const formatHoldTime = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
};

export default function PositionPage() {
  const router = useRouter();
  useAuth();
  const { positions, loading: posLoading, error: posError, refresh, updatePositionLocally, startConversion, endConversion } = useMyPositions(5000);
  const { closePosition, closePositionsBatch, loading: closingPos } = useOrderEntry();

  const [balance, setBalance] = useState<number | null>(() => pageCache.get<number>('funds:balance') ?? null);

  useEffect(() => {
    let cancelled = false;
    getSession().then((session) => {
      if (cancelled || !session) return;
      fetch('/api/pay/balance', { headers: { Authorization: `Bearer ${session.access_token}` } })
        .then(res => {
          const contentType = res.headers.get('content-type');
          if (res.ok && contentType && contentType.includes('application/json')) {
            return res.json();
          }
          return { balance: 0 };
        })
        .then(data => {
          if (cancelled) return;
          const bal = (data && data.balance) ?? 0;
          setBalance(bal);
          pageCache.set('funds:balance', bal);
        })
        .catch(() => {});
    });
    return () => { cancelled = true; };
  }, []);

  const formatBalance = (val: number | null) => {
    if (val === null) return '...';
    if (val > 999) return (val / 1000).toFixed(2) + 'k';
    return val.toFixed(2);
  };

  const [currentMain, setCurrentMain] = useState<'cumulative' | 'detailed'>('cumulative');
  const [currentSub, setCurrentSub] = useState<'open' | 'closed'>('open');
  const [selectedPos, setSelectedPos] = useState<EnrichedPosition | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [chartItem, setChartItem] = useState<any | null>(null);

  const openChart = (pos: EnrichedPosition) => {
    setChartItem({
      name: pos.symbol,
      symbol: pos.symbol,
      kiteSymbol: pos.symbol,
      price: pos.current_ltp,
      segment: pos.settlement === 'USDT' || pos.symbol.endsWith('USDT') ? 'CRYPTO' : 'NSE - Equity',
    });
    const chartSheet = document.getElementById('chartSheet');
    const chartOverlay = document.getElementById('chartSheetOverlay');
    if (chartSheet) chartSheet.classList.add('open');
    if (chartOverlay) chartOverlay.classList.add('active');
  };


  // Exit All Modal
  const [isExitAllModalOpen, setIsExitAllModalOpen] = useState(false);
  const [isExitingAll, setIsExitingAll] = useState(false);

  // Add More trade sheet
  const [tradeSheetItem, setTradeSheetItem] = useState<TradeSheetItem | null>(null);
  const [tradeSheetSide, setTradeSheetSide] = useState<'BUY' | 'SELL' | 'BOTH'>('BUY');
  const [tradeSheetExitMode, setTradeSheetExitMode] = useState(false);
  const [tradeSheetProductType, setTradeSheetProductType] = useState<'INTRADAY' | 'CARRY' | undefined>(undefined);

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
    setTradeSheetExitMode(false);
    setTradeSheetProductType(pos.product_type as 'INTRADAY' | 'CARRY');
  };

  const openTradeAgain = (pos: EnrichedPosition) => {
    closeSheet();
    setTradeSheetItem({
      name: pos.symbol,
      symbol: pos.symbol,
      kiteSymbol: pos.symbol,
      segment: pos.settlement || 'INR',
      price: pos.current_ltp,
      change: `${pos.pnl_percent >= 0 ? '+' : ''}${pos.pnl_percent.toFixed(2)}%`,
    });
    setTradeSheetSide('BOTH');
    setTradeSheetExitMode(false);
    setTradeSheetProductType(pos.product_type as 'INTRADAY' | 'CARRY');
  };

  const openExitSheet = (pos: EnrichedPosition) => {
    setTradeSheetItem({
      name: pos.symbol,
      symbol: pos.symbol,
      kiteSymbol: pos.symbol,
      segment: pos.settlement || 'INR',
      price: pos.current_ltp,
      change: `${pos.pnl_percent >= 0 ? '+' : ''}${pos.pnl_percent.toFixed(2)}%`,
    });
    // Exit is the opposite side: BUY position → SELL to exit, SELL position → BUY to exit
    setTradeSheetSide(pos.side === 'BUY' ? 'SELL' : 'BUY');
    setTradeSheetExitMode(true);
    setTradeSheetProductType(pos.product_type as 'INTRADAY' | 'CARRY');
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const toggleProductType = async (pos: EnrichedPosition) => {
    const originalType = pos.product_type;
    const newType = originalType === 'INTRADAY' ? 'CARRY' : 'INTRADAY';

    // 1. Optimistic Update (Immediate)
    if (startConversion) {
      startConversion(pos.id, newType);
    }
    if (selectedPos && selectedPos.id === pos.id) {
      setSelectedPos(prev => prev ? { ...prev, product_type: newType } : null);
    }

    try {
      const session = await getSession();
      if (!session) {
        showToast('Unauthorized. Please login again.');
        // Revert on auth error
        if (endConversion) {
          endConversion(pos.id);
        }
        if (selectedPos && selectedPos.id === pos.id) {
          setSelectedPos(prev => prev ? { ...prev, product_type: originalType } : null);
        }
        return;
      }

      const res = await fetch(`/api/positions/${pos.id}/convert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ product_type: newType })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to convert position product type');
      }

      showToast(`Position converted to ${newType} successfully`);
      // Await refresh to guarantee that rawPositions contains the updated DB value before we clear in-flight state
      await refresh();
    } catch (err: any) {
      console.error('Failed to convert position:', err);
      showToast(`Conversion failed: ${err.message}`);

      // Revert bottom sheet state on server/network failure
      if (selectedPos && selectedPos.id === pos.id) {
        setSelectedPos(prev => prev ? { ...prev, product_type: originalType } : null);
      }
    } finally {
      // 2. End in-flight conversion lock
      if (endConversion) {
        endConversion(pos.id);
      }
    }
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

  const openPositions = useMemo(() => positions.filter(p => p.status === 'open' || p.status === 'active'), [positions]);
  const closedPositions = useMemo(() => positions.filter(p => p.status === 'closed'), [positions]);
  const hasOpenPositions = openPositions.length > 0;

  // ── Cumulative grouping: merge same symbol+side+product_type into one row ──
  interface GroupedPosition {
    key: string;
    symbol: string;
    side: 'BUY' | 'SELL';
    product_type: string;
    settlement: string;
    qty_open: number;
    avg_price: number;          // weighted average entry price
    current_ltp: number;
    total_pnl: number;
    pnl_percent: number;
    hold_lock_active: boolean;
    ids: string[];              // all underlying position IDs
    representativePos: EnrichedPosition; // first position for actions
  }

  const groupedOpenPositions: GroupedPosition[] = useMemo(() => {
    const map = new Map<string, GroupedPosition>();
    for (const pos of openPositions) {
      const key = `${pos.symbol}|${pos.side}|${pos.product_type}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          symbol: pos.symbol,
          side: pos.side,
          product_type: pos.product_type || 'INTRADAY',
          settlement: pos.settlement || '',
          qty_open: pos.qty_open,
          avg_price: pos.avg_price || pos.entry_price,
          current_ltp: pos.current_ltp,
          total_pnl: pos.total_pnl,
          pnl_percent: pos.pnl_percent,
          hold_lock_active: pos.hold_lock_active,
          ids: [pos.id],
          representativePos: pos,
        });
      } else {
        const newQty = existing.qty_open + pos.qty_open;
        const newAvg = newQty > 0
          ? (existing.avg_price * existing.qty_open + (pos.avg_price || pos.entry_price) * pos.qty_open) / newQty
          : existing.avg_price;
        const newPnl = existing.total_pnl + pos.total_pnl;
        const investment = newAvg * newQty;
        existing.qty_open = newQty;
        existing.avg_price = newAvg;
        existing.current_ltp = pos.current_ltp; // same symbol, LTP is same
        existing.total_pnl = newPnl;
        existing.pnl_percent = investment > 0 ? parseFloat(((newPnl / investment) * 100).toFixed(2)) : 0;
        existing.hold_lock_active = existing.hold_lock_active || pos.hold_lock_active;
        existing.ids.push(pos.id);
      }
    }
    return Array.from(map.values());
  }, [openPositions]);

  const handleExitAllConfirm = async () => {
    if (!hasOpenPositions) return;
    setIsExitingAll(true);
    
    let successCount = 0;
    let failCount = 0;
    
    // Filter out locked positions from bulk exit
    const exitablePositions = openPositions.filter(p => !p.hold_lock_active);
    
    if (exitablePositions.length === 0) {
      showToast('All open positions are currently locked due to holding rules.');
      setIsExitingAll(false);
      setIsExitAllModalOpen(false);
      return;
    }
    
    const result = await closePositionsBatch(exitablePositions.map(p => p.id));
    
    if (result.success && result.results) {
      result.results.forEach((res: any) => {
        if (res.success) successCount++;
        else failCount++;
      });
    } else {
      failCount = exitablePositions.length;
    }
    
    setIsExitingAll(false);
    setIsExitAllModalOpen(false);
    
    if (failCount === 0) {
      showToast(`Successfully closed ${successCount} position(s).`);
    } else {
      showToast(`Closed ${successCount}, failed ${failCount}.`);
    }
    refresh();
  };

  const totalPnl = useMemo(() => positions.reduce((acc, p) => acc + (p.total_pnl || 0), 0), [positions]);
  const realized = useMemo(() => closedPositions.reduce((acc, p) => acc + (p.pnl || 0), 0), [closedPositions]);
  const unrealized = useMemo(() => openPositions.reduce((acc, p) => acc + (p.total_pnl || 0), 0), [openPositions]);

  const fmtUSD = (val: number, settlement?: string) => {
    const sign = val >= 0 ? '+' : '-';
    return `${sign}₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const fmtPrice = (val: number, settlement?: string) => {
    return `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button className="pos-wallet-btn" onClick={() => router.push('/funds')}>
                    <i className="fas fa-wallet" />
                    <span>₹{formatBalance(balance)}</span>
                  </button>
                  <button
                    className={`pos-exit-btn${!hasOpenPositions ? ' disabled' : ''}`}
                    onClick={() => { if (hasOpenPositions) setIsExitAllModalOpen(true); }}
                  >
                    <i className="fas fa-sign-out-alt" />
                    <span>Exit All</span>
                  </button>
                </div>
              </div>

              {/* ── Desktop Page Header ── */}
              <div className="desktop-only" style={{ padding: '20px 24px 0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Positions</h1>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>Internal Execution • Real-time P&amp;L</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button className="pos-wallet-btn" onClick={() => router.push('/funds')}>
                    <i className="fas fa-wallet" />
                    <span>{formatBalance(balance)}</span>
                  </button>
                  <button
                    className={`pos-exit-btn${!hasOpenPositions ? ' disabled' : ''}`}
                    onClick={() => { if (hasOpenPositions) setIsExitAllModalOpen(true); }}
                    style={{ padding: '10px 20px', fontSize: '0.9rem' }}
                  >
                    <i className="fas fa-sign-out-alt" />
                    <span>Exit All Positions</span>
                  </button>
                </div>
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
                  <div className="pos-pnl-card-title">
                    {currentMain === 'cumulative' && currentSub === 'closed' ? "Today's P&L" : "Live P&L Summary"}
                  </div>
                  <div className="pos-pnl-card-body">
                    {currentMain === 'cumulative' && currentSub === 'closed' && (
                      <div className="pos-pnl-col left">
                        <div className="pos-pnl-label">Realized</div>
                        <div className={`pos-pnl-val${realized >= 0 ? ' green' : ' red'}`}>{fmtUSD(realized)}</div>
                      </div>
                    )}
                    <div className="pos-pnl-col center">
                      <div className={`pos-pnl-total${(currentMain === 'detailed' ? unrealized : (currentSub === 'open' ? unrealized : realized)) >= 0 ? ' green' : ' red'}`}>
                        {fmtUSD(currentMain === 'detailed' ? unrealized : (currentSub === 'open' ? unrealized : realized))}
                      </div>
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
                      groupedOpenPositions.length === 0 ? (
                        <div className="pos-empty">
                          <i className="fas fa-chart-simple" />
                          <p>No open positions</p>
                        </div>
                      ) : groupedOpenPositions.map(group => (
                        <div key={group.key} className={`pos-card${expandedPosId === group.key ? ' pos-card--expanded' : ''}${group.hold_lock_active ? ' pos-card--locked' : ''}`} onClick={() => toggleExpand(group.key)}>
                          <div className="pos-card-main">
                            <div className="pos-card-left">
                              <div className="pos-card-symbol">
                                <span className="pos-symbol-text">{group.symbol}</span>
                                {group.ids.length > 1 && (
                                  <span style={{ marginLeft: '6px', fontSize: '0.6rem', fontWeight: 700, background: 'var(--card-alt-bg, #F1F5F9)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '20px' }}>
                                    {group.ids.length} trades
                                  </span>
                                )}
                              </div>
                              <div className="pos-card-details">
                                 <span>Avg: <strong>{fmtPrice(group.avg_price * group.qty_open, group.settlement)}</strong></span>
                                <span>Qty: <strong>{group.qty_open}</strong></span>
                              </div>
                              {group.product_type && (
                                <div
                                  className={`convert-type-btn ${group.product_type === 'CARRY' ? 'carry' : 'intraday'}`}
                                  style={{ marginTop: '5px' }}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await toggleProductType(group.representativePos);
                                  }}
                                >
                                  {group.product_type === 'INTRADAY' ? 'INTRADAY ⇄ CARRY' : 'CARRY ⇄ INTRADAY'}
                                </div>
                              )}
                            </div>
                            <div className="pos-card-right">
                              <span className={`pos-badge${group.side === 'BUY' ? ' long' : ' short'}`}>{group.side}</span>
                              <div className={`pos-card-pnl${group.total_pnl >= 0 ? ' green' : ' red'}`}>
                                {fmtUSD(group.total_pnl, group.settlement)}
                              </div>
                              <div className="pos-card-ltp">
                                {group.product_type && (
                                  <span className={`pos-product-badge ${group.product_type === 'CARRY' ? 'carry' : ''}`}>
                                    {group.product_type}
                                  </span>
                                )}
                                <span>LTP: <strong>{fmtPrice(group.current_ltp, group.settlement)}</strong></span>
                              </div>
                            </div>
                          </div>
                          {expandedPosId === group.key && (
                            <div className="pos-card-actions" onClick={e => e.stopPropagation()}>
                              <button className="pca-btn pca-add" onClick={() => openAddMore(group.representativePos)}>
                                <i className="fas fa-plus-circle" /> Add More
                              </button>
                              <button
                                className={`pca-btn pca-exit${group.hold_lock_active ? ' disabled-lock' : ''}`}
                                onClick={() => {
                                  if (group.hold_lock_active) return;
                                  openExitSheet(group.representativePos);
                                }}
                                disabled={group.hold_lock_active}
                              >
                                <i className="fas fa-times-circle" /> Exit All
                              </button>
                              <button
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  width: '42px', height: '38px', borderRadius: '16px',
                                  border: '1.5px solid var(--border-card, #CBD5E1)',
                                  background: 'var(--card-bg, #ffffff)', color: 'var(--text-primary, #1F2937)',
                                  cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s'
                                }}
                                onClick={() => openChart(group.representativePos)}
                              >
                                <svg viewBox="0 0 24 24" style={{ width: '1.25rem', height: '1.25rem', display: 'inline-block', verticalAlign: 'middle' }}>
                                  <rect x="4" y="16" width="2.5" height="4" rx="0.5" fill="currentColor" />
                                  <rect x="9" y="13" width="2.5" height="7" rx="0.5" fill="currentColor" />
                                  <rect x="14" y="14" width="2.5" height="6" rx="0.5" fill="currentColor" />
                                  <rect x="19" y="11" width="2.5" height="9" rx="0.5" fill="currentColor" />
                                  <path d="M 4 14 L 8 9 L 13 12 L 20 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                  <polyline points="15 4 20 4 20 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
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
                            <div className="pos-card-symbol">
                              <span className="pos-symbol-text">{pos.symbol}</span>
                            </div>
                            <div className="pos-card-details">
                              <span>Entry: <strong>{fmtPrice(pos.entry_price, pos.settlement)}</strong></span>
                              <span>Qty: <strong>{pos.qty_total}</strong></span>
                            </div>
                            {pos.product_type && (
                              <div style={{ marginTop: '5px' }}>
                                <span className={`pos-product-badge${pos.product_type === 'CARRY' ? ' carry' : ''}`}>
                                  {pos.product_type}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="pos-card-right">
                            <span className={`pos-badge${pos.side === 'BUY' ? ' long' : ' short'}`}>
                              {pos.side}
                            </span>
                            <div className={`pos-card-pnl${pos.pnl >= 0 ? ' green' : ' red'}`}>
                              {fmtUSD(pos.pnl, pos.settlement)}
                            </div>
                            <div className="pos-card-ltp">Exit: <strong>{fmtPrice(pos.exit_price || 0, pos.settlement)}</strong></div>
                          </div>
                        </div>
                      ))
                    )
                  ) : (
                    /* Detailed View */
                    openPositions.length === 0 ? (
                      <div className="pos-empty">
                        <i className="fas fa-list" />
                        <p>No trades available</p>
                      </div>
                    ) : openPositions.map(pos => {
                      const entryDate = new Date(pos.entry_time);
                      const timeStr = entryDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                      const dateStr = entryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                      return (
                        <div
                          key={pos.id}
                          className={`pos-detail-card${expandedPosId === pos.id ? ' pos-detail-card--expanded' : ''}${pos.hold_lock_active ? ' pos-card--locked' : ''}`}
                          onClick={() => {
                            if (pos.status === 'closed') {
                              handleRowClick(pos);
                            } else {
                              toggleExpand(pos.id);
                            }
                          }}
                        >
                          <div className="pos-detail-main-layout">
                            {/* Left Side: Symbol and Metadata */}
                            <div className="pos-detail-left-col">
                              <div className="pos-detail-symbol">
                                <span className="pos-symbol-text">{pos.symbol}</span>
                              </div>
                              <div className="pos-detail-meta">
                                <div className="pos-detail-meta-row">
                                  <span>Qty: <strong>{pos.qty_open || pos.qty_total}</strong></span>
                                  <span>Entry: <strong>{fmtPrice(pos.entry_price, pos.settlement)}</strong></span>
                                  {pos.status === 'closed'
                                    ? <span>Exit: <strong>{fmtPrice(pos.exit_price || 0, pos.settlement)}</strong></span>
                                    : <span>Current: <strong>{fmtPrice(pos.current_ltp, pos.settlement)}</strong></span>
                                  }
                                </div>
                                <div className="pos-detail-meta-row">
                                  <span>Time: <strong>{timeStr}</strong></span>
                                  <span>Date: <strong>{dateStr}</strong></span>
                                </div>
                              </div>
                              {pos.product_type && (
                                <div
                                  className={`convert-type-btn ${pos.product_type === 'CARRY' ? 'carry' : 'intraday'}`}
                                  style={{ marginTop: '5px', alignSelf: 'flex-start' }}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await toggleProductType(pos);
                                  }}
                                >
                                  {pos.product_type === 'INTRADAY' ? 'INTRADAY ⇄ CARRY' : 'CARRY ⇄ INTRADAY'}
                                </div>
                              )}
                            </div>
 
                            {/* Right Side: P&L and Status Badge */}
                            <div className="pos-detail-right-col">
                              <div className="pos-detail-pnl-group">
                                <div className={`pos-detail-pnl${pos.total_pnl >= 0 ? ' green' : ' red'}`}>
                                  {fmtUSD(pos.total_pnl, pos.settlement)}
                                </div>
                                <div className="pos-detail-pct">{pos.pnl_percent >= 0 ? '+' : ''}{pos.pnl_percent.toFixed(2)}%</div>
                                <span className="pos-detail-side">{pos.side}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                {pos.product_type && (
                                  <span className={`pos-product-badge ${pos.product_type === 'CARRY' ? 'carry' : ''}`}>
                                    {pos.product_type}
                                  </span>
                                )}
                                <span className={`pos-status-badge ${pos.status}`}>
                                  {pos.status.toUpperCase()}
                                </span>
                              </div>
                            </div>
                          </div>
                          {expandedPosId === pos.id && (pos.status === 'open' || pos.status === 'active') && (
                            <div className="pos-card-actions" onClick={e => e.stopPropagation()}>
                              <button className="pca-btn pca-add" onClick={() => openAddMore(pos)}>
                                <i className="fas fa-plus-circle" /> Add More
                              </button>
                              <button
                                className={`pca-btn pca-exit${pos.hold_lock_active ? ' disabled-lock' : ''}`}
                                onClick={() => { if (!pos.hold_lock_active) openExitSheet(pos); }}
                                disabled={pos.hold_lock_active}
                              >
                                <i className="fas fa-times-circle" /> Exit
                              </button>
                              <button
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '42px',
                                  height: '38px',
                                  borderRadius: '16px',
                                  border: '1.5px solid var(--border-card, #CBD5E1)',
                                  background: 'var(--card-bg, #ffffff)',
                                  color: 'var(--text-primary, #1F2937)',
                                  cursor: 'pointer',
                                  flexShrink: 0,
                                  transition: 'all 0.15s'
                                }}
                                onClick={() => openChart(pos)}
                              >
                                <svg 
                                  viewBox="0 0 24 24" 
                                  style={{
                                    width: '1.25rem',
                                    height: '1.25rem',
                                    display: 'inline-block',
                                    verticalAlign: 'middle',
                                  }}
                                >
                                  {/* Bars */}
                                  <rect x="4" y="16" width="2.5" height="4" rx="0.5" fill="currentColor" />
                                  <rect x="9" y="13" width="2.5" height="7" rx="0.5" fill="currentColor" />
                                  <rect x="14" y="14" width="2.5" height="6" rx="0.5" fill="currentColor" />
                                  <rect x="19" y="11" width="2.5" height="9" rx="0.5" fill="currentColor" />
                                  
                                  {/* Trendline */}
                                  <path 
                                    d="M 4 14 L 8 9 L 13 12 L 20 4" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="2" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                  />
                                  {/* Arrowhead */}
                                  <polyline 
                                    points="15 4 20 4 20 9" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="2" 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                  />
                                </svg>
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
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
                  {selectedPos.status === 'closed' ? (
                    /* ── CLOSED POSITION SHEET ── */
                    <>
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <div className="ps-symbol" style={{ color: 'var(--text-primary, #1A1A1A)', margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>{selectedPos.symbol}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span className={`pos-badge ${selectedPos.side === 'BUY' ? 'long' : 'short'}`} style={{ fontSize: '0.65rem', padding: '2px 8px' }}>
                              {selectedPos.side === 'BUY' ? 'LONG' : 'SHORT'}
                            </span>
                            {selectedPos.product_type && (
                              <span className={`pos-product-badge${selectedPos.product_type === 'CARRY' ? ' carry' : ''}`} style={{ fontSize: '0.65rem', padding: '2px 8px' }}>{selectedPos.product_type}</span>
                            )}
                          </div>
                        </div>
                        <button
                          style={{
                            width: '42px',
                            height: '42px',
                            borderRadius: '12px',
                            border: '1.5px solid #059669',
                            background: 'var(--card-bg, #ffffff)',
                            color: '#059669',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.15s'
                          }}
                          onClick={() => openChart(selectedPos)}
                        >
                          <svg 
                            viewBox="0 0 24 24" 
                            style={{
                              width: '1.25rem',
                              height: '1.25rem',
                              display: 'inline-block',
                              verticalAlign: 'middle',
                            }}
                          >
                            <rect x="4" y="16" width="2.5" height="4" rx="0.5" fill="currentColor" />
                            <rect x="9" y="13" width="2.5" height="7" rx="0.5" fill="currentColor" />
                            <rect x="14" y="14" width="2.5" height="6" rx="0.5" fill="currentColor" />
                            <rect x="19" y="11" width="2.5" height="9" rx="0.5" fill="currentColor" />
                            <path 
                              d="M 4 14 L 8 9 L 13 12 L 20 4" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                            />
                            <polyline 
                              points="15 4 20 4 20 9" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="2" 
                              strokeLinecap="round" 
                              strokeLinejoin="round" 
                            />
                          </svg>
                        </button>
                      </div>

                      {/* Realised P&L Container */}
                      <div style={{
                        backgroundColor: 'var(--card-alt-bg, #F3F4F6)',
                        border: '1px solid var(--border-light, #E8ECF0)',
                        padding: '12px 16px',
                        borderRadius: '16px',
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                        marginBottom: '8px',
                        boxSizing: 'border-box'
                      }}>
                        {/* Left Side: Realised P&L Info */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Realised P&amp;L</div>
                          <div style={{ fontSize: '2rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: selectedPos.pnl >= 0 ? '#059669' : '#DC2626', lineHeight: 1 }}>
                            {fmtUSD(selectedPos.pnl, selectedPos.settlement)}
                          </div>
                          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-secondary, #6B7280)', marginTop: '4px' }}>
                            {selectedPos.pnl_percent >= 0 ? '+' : ''}{selectedPos.pnl_percent.toFixed(2)}%
                          </div>
                        </div>

                        {/* Right Side: Entry & Exit Price Stack */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'right' }}>
                          <div>
                            <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '1px' }}>Entry Price</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary, #1A1A1A)' }}>{fmtPrice(selectedPos.entry_price, selectedPos.settlement)}</div>
                          </div>
                          <div>
                            <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '1px' }}>Exit Price</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary, #1A1A1A)' }}>{fmtPrice(selectedPos.exit_price || 0, selectedPos.settlement)}</div>
                          </div>
                        </div>
                      </div>

                      {/* Meta grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', width: '100%', marginBottom: '8px' }}>
                        <div style={{ background: 'var(--card-alt-bg, #F8F9FB)', border: '1px solid var(--border-card, #E2E6EA)', padding: '6px 10px', borderRadius: '12px' }}>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '4px' }}>Avg Price</div>
                           <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary, #1A1A1A)' }}>{fmtPrice((selectedPos.avg_price || selectedPos.entry_price) * selectedPos.qty_total, selectedPos.settlement)}</div>
                        </div>
                        <div style={{ background: 'var(--card-alt-bg, #F8F9FB)', border: '1px solid var(--border-card, #E2E6EA)', padding: '6px 10px', borderRadius: '12px' }}>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '4px' }}>Quantity</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary, #1A1A1A)' }}>{selectedPos.qty_total}</div>
                        </div>
                        <div style={{ background: 'var(--card-alt-bg, #F8F9FB)', border: '1px solid var(--border-card, #E2E6EA)', padding: '6px 10px', borderRadius: '12px' }}>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '4px' }}>Duration</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary, #1A1A1A)' }}>
                            {(() => {
                              const s = selectedPos.duration_seconds || 0;
                              if (s < 60) return `${s}s`;
                              if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
                              return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
                            })()}
                          </div>
                        </div>
                        <div style={{ background: 'var(--card-alt-bg, #F8F9FB)', border: '1px solid var(--border-card, #E2E6EA)', padding: '6px 10px', borderRadius: '12px' }}>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '4px' }}>Used Margin</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary, #1A1A1A)' }}>
                            {fmtPrice(selectedPos.margin_required || (selectedPos.entry_price * selectedPos.qty_total) || 0, selectedPos.settlement)}
                          </div>
                        </div>
                        <div style={{ background: 'var(--card-alt-bg, #F8F9FB)', border: '1px solid var(--border-card, #E2E6EA)', padding: '6px 10px', borderRadius: '12px' }}>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '4px' }}>Entry Time</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary, #1A1A1A)' }}>
                            {new Date(selectedPos.entry_time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true })}
                          </div>
                        </div>
                        <div style={{ background: 'var(--card-alt-bg, #F8F9FB)', border: '1px solid var(--border-card, #E2E6EA)', padding: '6px 10px', borderRadius: '12px' }}>
                          <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-secondary, #6B7280)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '4px' }}>Exit Time</div>
                          <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary, #1A1A1A)' }}>
                            {selectedPos.exit_time ? new Date(selectedPos.exit_time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
                          </div>
                        </div>
                      </div>

                      {/* Trade Again button */}
                      <button
                        style={{
                          width: '100%', padding: '11px', borderRadius: '50px',
                          border: '1.5px solid #059669', background: '#fff',
                          color: '#059669', fontSize: '0.95rem', fontWeight: 800,
                          cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: '8px', marginTop: '2px',
                          transition: 'all 0.18s',
                        }}
                        onClick={() => openTradeAgain(selectedPos)}
                      >
                        <i className="fas fa-rotate-right" />
                        Trade Again
                      </button>
                    </>
                  ) : (
                    /* ── OPEN POSITION SHEET ── */
                    <>
                      {/* Header */}
                      <div className="ps-header-row">
                        <div className="ps-header-left">
                          <div className="ps-symbol">
                            <span className="pos-symbol-text">{selectedPos.symbol}</span>
                            {selectedPos.product_type && (
                              <span
                                className="exchange-badge"
                                style={{
                                  fontSize: '0.55rem',
                                  fontWeight: '700',
                                  padding: '1px 6px',
                                  borderRadius: '20px',
                                  marginLeft: '6px',
                                  verticalAlign: 'middle',
                                  lineHeight: '1.6',
                                  display: 'inline-block',
                                  color: selectedPos.product_type === 'CARRY' ? '#FFFFFF' : '#2C8E5A',
                                  background: selectedPos.product_type === 'CARRY' ? '#4A148C' : '#E9F6EF'
                                }}
                              >
                                {selectedPos.product_type}
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                            <div className="ps-segment" style={{ margin: 0 }}>INTERNAL POSITION</div>
                            {selectedPos.product_type && (
                              <div
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await toggleProductType(selectedPos);
                                  setSelectedPos(prev => prev ? { ...prev, product_type: prev.product_type === 'INTRADAY' ? 'CARRY' : 'INTRADAY' } : null);
                                }}
                                className={`convert-type-btn${selectedPos.product_type === 'CARRY' ? ' carry' : ' intraday'}`}
                              >
                                {selectedPos.product_type === 'INTRADAY' ? 'INTRADAY ⇄ CARRY' : 'CARRY ⇄ INTRADAY'}
                              </div>
                            )}
                          </div>
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
                           <div className="ps-meta-val">{fmtPrice((selectedPos.avg_price || selectedPos.entry_price) * (selectedPos.qty_open || selectedPos.qty_total), selectedPos.settlement)}</div>
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

                      {/* Lock Message display */}

                      {/* P&L + Exit All */}
                      <div className="ps-pnl-section">
                        <div>
                          <div className="ps-pnl-label">Current P&amp;L</div>
                          <div className={`ps-pnl-value ${selectedPos.total_pnl >= 0 ? 'ps-green' : 'ps-red'}`}>
                            {fmtUSD(selectedPos.total_pnl, selectedPos.settlement)}
                          </div>
                        </div>
                        <button
                          className={`ps-btn-exit${selectedPos.hold_lock_active ? ' disabled-lock' : ''}`}
                          onClick={() => { if (!selectedPos.hold_lock_active) handleExit(selectedPos.id); }}
                          disabled={selectedPos.hold_lock_active}
                        >
                          Exit All
                        </button>
                      </div>
 
                      {/* Add More / Partial Exit */}
                      <div className="ps-action-row">
                        <button className="ps-btn-add" onClick={() => openAddMore(selectedPos)}>Add More</button>
                        <button
                          className={`ps-btn-partial${selectedPos.hold_lock_active ? ' disabled-lock' : ''}`}
                          onClick={() => { if (!selectedPos.hold_lock_active) handleExit(selectedPos.id); }}
                          disabled={selectedPos.hold_lock_active}
                        >
                          Partial Exit
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className={`pos-toast${toast ? ' show' : ''}`}>
              <i className="fas fa-circle-info" />
              <span>{toast}</span>
            </div>

            {/* Exit All Confirmation Modal */}
            <div className={`pos-modal-overlay${isExitAllModalOpen ? ' open' : ''}`} onClick={() => !isExitingAll && setIsExitAllModalOpen(false)}>
              <div className="pos-modal-card" onClick={e => e.stopPropagation()}>
                <div className="pos-modal-icon">
                  <i className="fas fa-exclamation-triangle" />
                </div>
                <div className="pos-modal-title">Close All Positions?</div>
                <div className="pos-modal-desc">
                  Are you sure you want to exit all <strong>{openPositions.length}</strong> open positions? This action will execute market orders immediately and cannot be undone.
                </div>
                <div className="pos-modal-actions">
                  <button 
                    className="pos-modal-btn cancel" 
                    onClick={() => setIsExitAllModalOpen(false)}
                    disabled={isExitingAll}
                  >
                    Cancel
                  </button>
                  <button 
                    className="pos-modal-btn confirm" 
                    onClick={handleExitAllConfirm}
                    disabled={isExitingAll}
                  >
                    {isExitingAll ? (
                      <><i className="fas fa-circle-notch fa-spin" style={{ marginRight: '6px' }} /> Closing...</>
                    ) : (
                      'Confirm Exit All'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Add More — full watchlist-style trade sheet */}
      <TradeSheet
        item={tradeSheetItem}
        side={tradeSheetSide}
        onClose={() => { setTradeSheetItem(null); setTradeSheetExitMode(false); setTradeSheetProductType(undefined); }}
        onSuccess={refresh}
        exitMode={tradeSheetExitMode}
        productType={tradeSheetProductType}
      />

      {/* Chart Sheet */}
      <div id="chartSheetOverlay" className="trade-sheet-overlay" onClick={() => { const sheet = document.getElementById('chartSheet'); const overlay = document.getElementById('chartSheetOverlay'); if (sheet) sheet.classList.remove('open'); if (overlay) overlay.classList.remove('active'); setChartItem(null); }}></div>
      <div id="chartSheet" className="trade-sheet" style={{ height: '100dvh', paddingBottom: '0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, position: 'relative', width: '100%', overflow: 'hidden' }}>
          {chartItem && (
            <TradingChart
              symbol={chartItem.kiteSymbol || chartItem.symbol}
              segment={chartItem.segment}
            />
          )}
        </div>
      </div>
    </div>
  );
}
