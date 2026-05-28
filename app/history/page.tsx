'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
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
}

declare global {
  interface Window {
    __historyCache?: HistoryItem[];
  }
}

export default function HistoryPage() {
  useAuth();
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
    if (saved === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
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
          brokerage: 20
        }));

        const formattedPos = (posData.positions || []).map((p: any) => ({
          id: p.id,
          scriptName: p.symbol,
          type: p.side,
          orderType: 'INTRADAY',
          qty: p.qty_total,
          price: p.exit_price || 0,
          entryPrice: p.entry_price,
          exitPrice: p.exit_price,
          pnl: p.pnl || 0,
          date: new Date(p.created_at).toLocaleString(),
          exitDate: p.updated_at ? new Date(p.updated_at).toLocaleDateString() : '---',
          status: 'closed',
          brokerage: 40
        }));

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
    return { gp, gl, b, n: gp - gl - b };
  }, [historyData]);

  const formatPrice = (val: number) => {
    const sign = val >= 0 ? '' : '-';
    return `${sign}₹${Math.abs(val).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
  };

  return (
    <div className="desktop-layout">
      <Sidebar />
      
      <main className="main-viewport">
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
                    className={`header-btn ${currentTab === 'position' ? 'active' : ''}`}
                    onClick={() => setCurrentTab('position')}
                  >
                    Position History
                  </button>
                  <button
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
                      <div key={item.id} className="history-card">
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
                            {currentTab === 'position'
                              ? `${isPositive ? '+' : ''}${formatPrice(item.pnl)} (${isPositive ? '+' : ''}${pnlPercent}%)`
                              : formatPrice(item.price)}
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
                          <span className="detail-item"><i className="fas fa-receipt"></i> ₹{item.brokerage}</span>
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
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        .history-root {
            display: flex;
            flex-direction: column;
            height: 100%;
            width: 100%;
            background: #F5F7FB;
            overflow: hidden;
            position: relative;
        }

        .history-root .app-header {
            background: #FFFFFF;
            padding: 12px 14px;
            border-bottom: 1px solid #E8ECF0;
            flex-shrink: 0;
            display: flex;
            flex-direction: column;
        }

        .history-root .header-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            flex-wrap: nowrap;
            margin-bottom: 10px;
            gap: 8px;
        }

        .history-root .logo-area {
            display: flex;
            align-items: center;
            flex-shrink: 0;
        }

        .history-root .logo-text {
            font-weight: 700;
            font-size: 0.9rem;
            color: #1A1E2B;
            white-space: nowrap;
        }

        .history-root .header-buttons {
            display: flex;
            gap: 6px;
            flex-shrink: 0;
        }

        .history-root .header-btn {
            background: #F8F9FC;
            border: 1px solid #E2E6EC;
            border-radius: 40px;
            padding: 5px 10px;
            font-size: 0.65rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            color: #5B677E;
            white-space: nowrap;
        }

        .history-root .header-btn.active {
            background: #C62E2E;
            border-color: #C62E2E;
            color: white;
        }

        .history-root .date-filter-row {
            background: #FFFFFF;
            border-radius: 20px;
            padding: 6px 10px;
            border: 1px solid #EEF2F8;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            flex-wrap: nowrap;
        }

        .history-root .filter-group {
            display: flex;
            align-items: center;
            gap: 4px;
            background: #F8FAFF;
            padding: 4px 8px;
            border-radius: 30px;
            border: 1px solid #E8ECF0;
            flex: 1;
            min-width: 0;
        }

        .history-root .filter-group i {
            color: #9AA4BF;
            font-size: 0.65rem;
            flex-shrink: 0;
        }

        .history-root .date-input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
            flex: 1;
            min-width: 0;
        }

        .history-root .date-input-compact {
            border: none;
            background: transparent;
            font-size: 0.6rem;
            font-family: 'Inter', sans-serif;
            padding: 2px 0;
            width: 100%;
            font-weight: 500;
            color: #1A1E2B;
            min-width: 0;
            color-scheme: light;
        }

        .history-root .date-placeholder {
            position: absolute;
            left: 0;
            top: 50%;
            transform: translateY(-50%);
            font-size: 0.6rem;
            font-weight: 500;
            color: #9AA4BF;
            pointer-events: none;
            white-space: nowrap;
            display: none;
        }

        @media (max-width: 500px) {
            .history-root .date-placeholder {
                display: block;
            }
            .history-root .date-input-compact:not([value])::-webkit-datetime-edit {
                color: transparent;
            }
            .history-root .date-input-compact[value=""]::-webkit-datetime-edit {
                color: transparent;
            }
        }

        .history-root .date-input-compact:focus {
            outline: none;
        }

        .history-root .filter-buttons {
            display: flex;
            gap: 4px;
            flex-shrink: 0;
        }

        .history-root .filter-btn {
            padding: 4px 10px;
            border-radius: 30px;
            font-size: 0.6rem;
            font-weight: 600;
            cursor: pointer;
            border: none;
            transition: all 0.2s;
            white-space: nowrap;
        }

        .history-root .filter-btn.apply {
            background: #2C8E5A;
            color: white;
        }

        .history-root .filter-btn.clear {
            background: #F0F2F5;
            color: #5B677E;
        }

        .history-root .filter-btn:active {
            transform: scale(0.96);
        }

        .history-root .main-content {
            flex: 1;
            overflow-y: auto;
            background: #F5F7FB;
            min-height: 0;
            padding: 12px 16px 175px 16px;
        }

        .history-root .history-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .history-root .history-card {
            background: #FFFFFF;
            border-radius: 20px;
            padding: 14px;
            border: 1px solid #EEF2F8;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
        }

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

        .history-root .order-type-badge {
            font-size: 0.55rem;
            padding: 3px 10px;
            border-radius: 30px;
            font-weight: 600;
        }

        .history-root .order-type-badge.buy {
            background: #E9F6EF;
            color: #2C8E5A;
        }

        .history-root .order-type-badge.sell {
            background: #FEF0F0;
            color: #C62E2E;
        }

        .history-root .order-type-badge.pending {
            background: #FFF3E0;
            color: #E67E22;
        }

        .history-root .order-type-badge.completed {
            background: #E3F2FD;
            color: #2196F3;
        }

        .history-root .pnl {
            font-size: 1rem !important;
            font-weight: 700 !important;
            flex-shrink: 0 !important;
            text-align: right !important;
        }

        .history-root .pnl.positive {
            color: #2C8E5A;
        }

        .history-root .pnl.negative {
            color: #C62E2E;
        }

        .history-root .price-value {
            font-weight: 700;
            font-size: 0.85rem;
        }

        .history-root .history-card-details {
            display: flex;
            justify-content: space-between;
            font-size: 0.65rem;
            color: #8C94A8;
            padding-top: 8px;
            border-top: 1px solid #F0F2F8;
            margin-top: 4px;
            flex-wrap: wrap;
            gap: 8px;
        }

        .history-root .detail-item {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .history-root .detail-item i {
            width: 12px;
            font-size: 0.6rem;
        }

        .history-footer {
            position: fixed;
            bottom: 65px;
            left: 50%;
            transform: translateX(-50%);
            width: 100%;
            max-width: 500px;
            background: #FFFFFF;
            padding: 8px 16px;
            border-top: 1px solid #E8ECF0;
            box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
            z-index: 45;
            box-sizing: border-box;
        }

        .history-footer .footer-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 0;
            font-size: 0.8rem;
        }

        .history-footer .footer-row:not(:last-child) {
            border-bottom: 1px solid #F0F2F8;
        }

        .history-footer .footer-label {
            color: #6B728E;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 0.75rem;
        }

        .history-footer .footer-label i {
            width: 18px;
            font-size: 0.85rem;
        }

        .history-footer .footer-value {
            font-weight: 700;
            font-size: 0.85rem;
        }

        .history-footer .footer-value.net-profit {
            color: #2C8E5A;
        }

        .history-footer .footer-value.net-loss {
            color: #C62E2E;
        }

        .history-root .empty-history {
            text-align: center;
            padding: 60px 24px;
            background: #FFFFFF;
            border-radius: 28px;
            border: 1px dashed #DCE3EC;
            color: #9CA3B9;
        }

        .history-root .empty-history i {
            font-size: 2.5rem;
            margin-bottom: 12px;
            opacity: 0.5;
        }

        .history-root .empty-history p {
            font-size: 0.75rem;
        }

        body.dark .history-root {
            background: #121212 !important;
        }

        body.dark .history-root .app-header {
            background: #1E1E1E !important;
            border-bottom-color: #333 !important;
        }

        body.dark .history-root .logo-text {
            color: #F5F5F5 !important;
        }

        body.dark .history-root .header-btn {
            background: #2A2A2A !important;
            border-color: #3A3A3A !important;
            color: #B0B0B0 !important;
        }

        body.dark .history-root .header-btn.active {
            background: #C62E2E !important;
            border-color: #C62E2E !important;
            color: white !important;
        }

        body.dark .history-root .date-filter-row {
            background: #1E1E1E !important;
            border-color: #333 !important;
        }

        body.dark .history-root .filter-group {
            background: #2A2A2A !important;
            border-color: #3A3A3A !important;
        }

        body.dark .history-root .date-input-compact {
            color: #F5F5F5 !important;
        }

        body.dark .history-root .filter-btn.clear {
            background: #2A2A2A !important;
            color: #B0B0B0 !important;
        }

        body.dark .history-root .main-content {
            background: #121212 !important;
        }

        body.dark .history-root .history-card {
            background: #252525 !important;
            border-color: #3A3A3A !important;
            box-shadow: none !important;
        }

        body.dark .history-root .script-name {
            color: #F5F5F5 !important;
        }

        body.dark .history-root .history-card-details {
            color: #888 !important;
            border-top-color: #3A3A3A !important;
        }

        body.dark .history-footer {
            background: #1E1E1E !important;
            border-top-color: #333 !important;
        }

        body.dark .history-footer .footer-row {
            border-bottom-color: #3A3A3A !important;
        }

        body.dark .history-footer .footer-label {
            color: #B0B0B0 !important;
        }

        body.dark .history-footer .footer-value {
            color: #F5F5F5 !important;
        }

        @media (min-width: 501px) {
            .history-root {
                contain: none;
                height: auto;
                min-height: 100dvh;
                overflow: visible;
                max-width: 900px;
                margin: 0 auto;
            }

            .history-root .main-content {
                padding-bottom: 24px;
            }

            .history-root .history-list {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
            }

            .history-footer {
                position: static;
                max-width: 900px;
                margin: 0 auto;
                bottom: auto;
            }
        }

        @media (min-width: 1024px) {
            .history-root {
                max-width: 100%;
                width: 100%;
                height: auto;
                min-height: 100dvh;
                margin: 0;
                padding-left: var(--sidebar-width);
            }

            .history-root .main-content {
                padding-bottom: 40px;
            }

            .history-root .history-list {
                grid-template-columns: repeat(3, 1fr);
            }

            .history-footer {
                display: none;
            }
        }
      `}} />
    </div>
  );
}
