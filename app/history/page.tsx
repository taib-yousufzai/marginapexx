'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import { supabase } from '@/lib/supabaseClient';
import './page.css';

interface HistoryItem {
  id: string;
  scriptName: string;
  type: 'BUY' | 'SELL';
  orderType: string;
  qty: number;
  price: number;
  entryPrice?: number;
  exitPrice?: number;
  pnl: number;
  date: string;
  exitDate?: string;
  status: string;
  brokerage: number;
  intraday_brokerage?: number;
  carry_brokerage?: number;
  gtt_brokerage?: number;
  entry_intraday_brokerage?: number;
  entry_carry_brokerage?: number;
  entry_gtt_brokerage?: number;
  exit_intraday_brokerage?: number;
  exit_carry_brokerage?: number;
  exit_gtt_brokerage?: number;
  closedBy?: string;
  settlement?: string;
  settlementAmount?: number;
  productType?: string;
}

declare global {
  interface Window {
    __historyCache?: HistoryItem[];
  }
}

export default function HistoryPage() {
  useAuth();
  const router = useRouter();
  const [currentTab, setCurrentTab] = useState<'position' | 'order'>('position');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [historyData, setHistoryData] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const mainContentRef = useRef<HTMLDivElement>(null);

  // Scroll reset - runs synchronously before browser paint via ref callback
  const scrollResetRef = (node: HTMLDivElement | null) => {
    if (node) {
      node.scrollTop = 0;
    }
    (mainContentRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };

  useEffect(() => {
    // Apply dark mode class from localStorage on mount
    const saved = localStorage.getItem('marginApexTheme');
    document.body.classList.remove('dark', 'black', 'blue');
    if (saved === 'dark' || saved === 'black' || saved === 'blue') document.body.classList.add(saved);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.__historyCache && window.__historyCache.length > 0) {
      setHistoryData(window.__historyCache);
      setLoading(false);
    }

    async function fetchHistory() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Fetch both orders and positions history
        const [ordersRes, posRes] = await Promise.all([
          fetch('/api/orders?status=executed,rejected,cancelled', {
            headers: { Authorization: `Bearer ${session.access_token}` }
          }),
          fetch('/api/positions?status=closed', {
            headers: { Authorization: `Bearer ${session.access_token}` }
          })
        ]);

        if (!ordersRes.ok || !posRes.ok) throw new Error('fetch failed');
        const ordersData = await ordersRes.json();
        const posData = await posRes.json();

        const formattedOrders = (ordersData.orders || []).map((o: any) => ({
          id: o.id,
          scriptName: o.symbol,
          type: o.side,
          orderType: o.order_type,
          qty: o.qty,
          price: o.fill_price || 0,
          pnl: 0,
          date: new Date(o.created_at).toLocaleString(),
          status: o.status,
          brokerage: o.brokerage || 0,
          intraday_brokerage: o.intraday_brokerage || 0,
          carry_brokerage: o.carry_brokerage || 0,
          gtt_brokerage: o.gtt_brokerage || 0
        }));

        const formattedPos = (posData.positions || []).map((p: any) => {
          // Derive settlement label, falling back for old positions with none stored
          const rawSettlement = p.settlement || '';
          let settlement = rawSettlement;
          if (!settlement) {
            const sym: string = (p.symbol || '').toUpperCase();
            if (sym.endsWith('USDT') || sym.includes('CRYPTO')) settlement = 'Crypto';
            else if (sym.endsWith('=F') || sym.includes('COMEX')) settlement = 'COMEX';
            else if (sym.includes('MCX')) settlement = 'MCX';
            else settlement = 'NSE';
          }
          return {
            id: p.id,
            scriptName: p.symbol,
            type: p.side,
            orderType: p.product_type || 'INTRADAY',
            qty: p.qty_total,
            price: p.exit_price || 0,
            entryPrice: p.entry_price,
            exitPrice: p.exit_price,
            pnl: p.pnl || 0,
            date: new Date(p.created_at).toLocaleString(),
            exitDate: p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '---',
            status: 'closed',
            brokerage: p.brokerage || 0,
            entry_intraday_brokerage: p.entry_intraday_brokerage || 0,
            entry_carry_brokerage: p.entry_carry_brokerage || 0,
            entry_gtt_brokerage: p.entry_gtt_brokerage || 0,
            exit_intraday_brokerage: p.exit_intraday_brokerage || 0,
            exit_carry_brokerage: p.exit_carry_brokerage || 0,
            exit_gtt_brokerage: p.exit_gtt_brokerage || 0,
            closedBy: p.closed_by || 'USER_ACTION',
            productType: p.product_type || 'INTRADAY',
            settlement,
            settlementAmount: Math.abs(Number(p.settlement_amount || 0)),
          };
        });

        const merged = [...formattedOrders, ...formattedPos];
        if (typeof window !== 'undefined') window.__historyCache = merged;
        setHistoryData(merged);
      } catch (err) {
        console.error('Failed to fetch history:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, []);

  const filteredData = useMemo(() => {
    const base = historyData.filter(item => {
      if (currentTab === 'position') return item.status === 'closed';
      return item.status !== 'closed';
    });
    // Add date filtering logic if needed
    return base;
  }, [historyData, currentTab]);

  const summary = useMemo(() => {
    const posHistory = historyData.filter(h => h.status === 'closed');
    const gp = posHistory.filter(h => h.pnl > 0).reduce((acc, h) => acc + h.pnl, 0);
    const gl = posHistory.filter(h => h.pnl < 0).reduce((acc, h) => acc + Math.abs(h.pnl), 0);
    const b = historyData.reduce((acc, h) => acc + h.brokerage, 0);
    const s = posHistory.reduce((acc, h) => acc + (h.settlementAmount ?? 0), 0);
    return { gp, gl, b, s, n: gp - gl - b - s };
  }, [historyData]);

  const formatPrice = (val: number) => {
    const sign = val >= 0 ? '' : '-';
    return `${sign}₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="desktop-layout">
      <Sidebar />

      <main className="main-viewport">
        <div className="flex-1 flex flex-col min-h-0 bg-gray-50 dark:bg-[#0B0E14] relative">
        <style>{`
          .tooltip:hover::after {
            content: attr(data-tooltip);
            position: absolute;
            bottom: 100%;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-card);
            border: 1px solid var(--border-color);
            color: var(--text-primary);
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 0.75rem;
            white-space: pre;
            z-index: 10;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
        `}</style>
        <div className="app-container">
          <div className="history-root">
            {/* ── Header (Mobile Only) ── */}
            <div className="app-header mobile-only">
              <div className="header-top">
                <div className="logo-area">
                  <div className="logo-text">Trade History</div>
                </div>
                <div className="header-buttons">
                  <button
                    suppressHydrationWarning
                    className={`header-btn ${currentTab === 'position' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('position')}
                  >
                    Position History
                  </button>
                  <button
                    suppressHydrationWarning
                    className={`header-btn ${currentTab === 'order' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('order')}
                  >
                    Order History
                  </button>
                </div>
              </div>
              <div className="date-filter-row">
                <div className="filter-group">
                  <i className="fas fa-calendar-alt"></i>
                  <div className="date-input-wrapper">
                    <input
                      type="date"
                      className="date-input-compact"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                    {!fromDate && <span className="date-placeholder">mm/dd/yyyy</span>}
                  </div>
                </div>
                <span style={{ color: '#C62E2E', fontSize: '0.7rem' }}>→</span>
                <div className="filter-group">
                  <i className="fas fa-calendar-alt"></i>
                  <div className="date-input-wrapper">
                    <input
                      type="date"
                      className="date-input-compact"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                    {!toDate && <span className="date-placeholder">mm/dd/yyyy</span>}
                  </div>
                </div>
                <div className="filter-buttons">
                  <button className="filter-btn apply">Apply</button>
                  <button className="filter-btn clear" onClick={() => { setFromDate(''); setToDate(''); }}>Clear</button>
                </div>
              </div>
            </div>

            {/* ── Desktop Page Header ── */}
            <div className="desktop-only" style={{ padding: '20px 24px 0 24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Trade History</h1>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4 }}>Historical execution logs & performance</p>
                </div>
                <div className="header-buttons" style={{ display: 'flex', gap: 10, background: 'var(--bg-card)', padding: 4, borderRadius: 12, border: '1px solid var(--border-color)' }}>
                  <button
                    className={`header-btn ${currentTab === 'position' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('position')}
                    style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                  >
                    Position History
                  </button>
                  <button
                    className={`header-btn ${currentTab === 'order' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('order')}
                    style={{ padding: '8px 16px', fontSize: '0.85rem' }}
                  >
                    Order History
                  </button>
                </div>
              </div>

              <div className="date-filter-row" style={{ background: 'var(--bg-card)', padding: '12px 16px', borderRadius: 12, border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: 15 }}>
                <div className="filter-group">
                  <i className="fas fa-calendar-alt" style={{ color: 'var(--text-secondary)' }}></i>
                  <input
                    type="date"
                    className="date-input-compact"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                  />
                </div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>to</span>
                <div className="filter-group">
                  <i className="fas fa-calendar-alt" style={{ color: 'var(--text-secondary)' }}></i>
                  <input
                    type="date"
                    className="date-input-compact"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                  />
                </div>
                <div className="filter-buttons" style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                  <button className="filter-btn apply" style={{ padding: '8px 24px' }}>Apply Filter</button>
                  <button className="filter-btn clear" onClick={() => { setFromDate(''); setToDate(''); }} style={{ padding: '8px 16px' }}>Reset</button>
                </div>
              </div>
            </div>

            <div className="main-content" ref={scrollResetRef}>
              <div className="history-list">
                {filteredData.length === 0 ? (

                  <div className="empty-history">
                    <i className={currentTab === 'position' ? "fas fa-folder-open" : "fas fa-list-ul"}></i>
                    <p>No history found</p>
                  </div>
                ) : (
                  filteredData.map((item) => {
                    const isPositive = item.pnl >= 0;
                    const pnlPercent = item.entryPrice ? ((item.pnl / (item.entryPrice * item.qty)) * 100).toFixed(2) : "0.00";

                    return (
                      <div key={item.id} className="history-card" style={{ cursor: 'pointer' }} onClick={() => router.push(`/watchlist?symbol=${encodeURIComponent(item.scriptName)}`)}>
                        <div className="history-card-header">
                          <div className="script-info">
                            <span className="script-name">{item.scriptName}</span>
                            <div className="script-badges">
                              <span className={`order-type-badge ${item.type.toLowerCase()}`}>{item.type}</span>
                              <span style={{ fontSize: '0.55rem', color: '#9AA4BF' }}>{item.orderType}</span>
                              {currentTab === 'order' && (
                                <span className={`order-type-badge ${item.status === 'executed' ? 'completed' : 'pending'}`}>
                                  {item.status}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className={currentTab === 'position' ? `pnl ${isPositive ? 'positive' : 'negative'}` : 'price-value'}>
                            {currentTab === 'position' ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                <span>{`${isPositive ? '+' : ''}${formatPrice(item.pnl)}`}</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, marginTop: '2px' }}>
                                  {`(${isPositive ? '+' : ''}${pnlPercent}%)`}
                                </span>
                              </div>
                            ) : (
                              formatPrice(item.price)
                            )}
                          </div>
                        </div>
                        <div className="history-card-details">
                          <span className="detail-item"><i className="fas fa-layer-group"></i> {item.qty}</span>
                          {currentTab === 'position' ? (
                            <>
                              <span className="detail-item"><i className="fas fa-arrow-right"></i> {formatPrice(item.entryPrice || 0)}</span>
                              <span className="detail-item"><i className="fas fa-arrow-left"></i> {formatPrice(item.exitPrice || 0)}</span>
                              <span className="detail-item"><i className="far fa-calendar"></i> {item.exitDate}</span>
                            </>
                          ) : (
                            <>
                              <span className="detail-item"><i className="fas fa-clock"></i> {item.orderType}</span>
                              <span className="detail-item"><i className="far fa-calendar"></i> {item.date.split(' ')[0]}</span>
                            </>
                          )}
                        </div>
                        <div className="history-card-details" style={{ marginTop: '4px' }}>
                          <span className="detail-item tooltip" data-tooltip={(() => {
                            if (currentTab === 'order') {
                              const total = (item.intraday_brokerage || 0) + (item.carry_brokerage || 0) + (item.gtt_brokerage || 0);
                              if (total === 0 && (item.brokerage || 0) > 0) {
                                return item.productType === 'CARRY' 
                                  ? `Intraday: ₹0\nCarry: ₹${item.brokerage}\nGTT: ₹0` 
                                  : `Intraday: ₹${item.brokerage}\nCarry: ₹0\nGTT: ₹0`;
                              }
                              return `Intraday: ₹${item.intraday_brokerage || 0}\nCarry: ₹${item.carry_brokerage || 0}\nGTT: ₹${item.gtt_brokerage || 0}`;
                            } else {
                              const intraday = (item.entry_intraday_brokerage || 0) + (item.exit_intraday_brokerage || 0);
                              const carry = (item.entry_carry_brokerage || 0) + (item.exit_carry_brokerage || 0);
                              const gtt = (item.entry_gtt_brokerage || 0) + (item.exit_gtt_brokerage || 0);
                              if (intraday + carry + gtt === 0 && (item.brokerage || 0) > 0) {
                                return item.productType === 'CARRY' 
                                  ? `Intraday: ₹0\nCarry: ₹${item.brokerage}\nGTT: ₹0` 
                                  : `Intraday: ₹${item.brokerage}\nCarry: ₹0\nGTT: ₹0`;
                              }
                              return `Intraday: ₹${intraday}\nCarry: ₹${carry}\nGTT: ₹${gtt}`;
                            }
                          })()} style={{ position: 'relative' }}>
                            <i className="fas fa-receipt"></i> {formatPrice(item.brokerage || 0)}
                          </span>
                          {currentTab === 'position' && (item.settlementAmount ?? 0) > 0 && (
                            <span className="detail-item" style={{ color: '#C62E2E', fontWeight: 600 }}>
                              <i className="fas fa-exclamation-triangle"></i> Deficit: -₹{(item.settlementAmount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )}
                          {currentTab === 'position' && item.closedBy && (
                            <span className="detail-item" style={{ color: '#64748b', fontSize: '0.7rem' }}>
                              <i className={item.closedBy === 'USER_ACTION' ? 'fas fa-user' : 'fas fa-robot'}></i> {
                                item.closedBy === 'AUTO_LIQUIDATION' ? 'Auto Sq-Off' : 
                                item.closedBy === 'ADMIN_ACTION' ? 'Admin Sq-Off' : 
                                item.closedBy === 'STOP_LOSS' ? 'Stop Loss' : 
                                item.closedBy === 'TARGET_HIT' ? 'Target Hit' : 
                                item.closedBy === 'SYSTEM_ACTION' ? 'System Sq-Off' : 
                                item.closedBy === 'USER_ACTION' ? 'User Exit' : 
                                item.closedBy === 'GTT_TARGET' ? 'GTT Target' :
                                item.closedBy === 'GTT_STOP_LOSS' ? 'GTT SL' :
                                item.closedBy
                              }
                            </span>
                          )}
                          {currentTab === 'order' && <span className="detail-item"><i className="fas fa-hourglass-half"></i> {item.date.split(' ')[1] || ''}</span>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <Footer activeTab="history" />
          </div>
        </div>
        </div>
      </main>

      {/* Summary fixed above footer nav - outside app-container so overflow:clip doesn't trap it */}
      <div className="history-footer mobile-only">
        <div className="footer-row">
          <span className="footer-label"><i className="fas fa-chart-bar"></i> Gross P&L</span>
          <span className={`footer-value ${summary.gp - summary.gl >= 0 ? 'net-profit' : 'net-loss'}`}>
            {formatPrice(summary.gp - summary.gl)}
          </span>
        </div>
        <div className="footer-row">
          <span className="footer-label"><i className="fas fa-receipt"></i> Brokerage</span>
          <span className="footer-value">{formatPrice(summary.b)}</span>
        </div>
        <div className="footer-row">
          <span className="footer-label"><i className="fas fa-chart-line"></i> Net P&L</span>
          <span className={`footer-value ${summary.n >= 0 ? 'net-profit' : 'net-loss'}`}>
            {formatPrice(summary.n)}
          </span>
        </div>
        <div className="footer-row">
          <span className="footer-label"><i className="fas fa-handshake"></i> Settlement</span>
          <span className="footer-value" style={{ color: summary.s > 0 ? '#C62E2E' : 'inherit' }}>
            {summary.s > 0 ? `-₹${summary.s.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹0.00'}
          </span>
        </div>
      </div>
      <style dangerouslySetInnerHTML={{
        __html: `
        .history-root .history-card-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: flex-start !important;
            margin-bottom: 10px !important;
            flex-wrap: nowrap !important;
            gap: 8px !important;
        }
        .history-root .script-info {
            display: flex !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 6px !important;
            flex: 1 !important;
            min-width: 0 !important;
        }
        .history-root .script-badges {
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            flex-wrap: wrap !important;
        }
        .history-root .script-name {
            font-weight: 700 !important;
            font-size: 0.9rem !important;
            color: #1A1E2B !important;
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
            max-width: 100% !important;
        }
        body.dark .history-root .script-name {
            color: #E2E8F0 !important;
        }
        .history-root .pnl {
            font-size: 1rem !important;
            font-weight: 700 !important;
            flex-shrink: 0 !important;
            text-align: right !important;
        }
      `}} />
    </div>
  );
}
