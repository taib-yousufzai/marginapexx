'use client';
import React, { useState, useEffect } from 'react';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState } from './AdminUtils';

export type Order = {
  symbol: string;
  side: 'BUY' | 'SELL';
  status: 'EXECUTED' | 'CANCELLED' | 'REJECTED';
  qty: number;
  price: number;
  orderType: 'MARKET' | 'LIMIT';
  info: string;
  time: string;
};

export default function OrdersPage({ selectedUser }: { selectedUser: { id: string; role: string } }) {
  const [tab, setTab] = useState<'executed' | 'limit' | 'rejected'>('executed');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState('10');
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const uid = selectedUser.id;

  useEffect(() => {
    if (!uid) return;
    setOrdersLoading(true);
    apiCall(`/api/admin/users/${uid}/orders?tab=${encodeURIComponent(tab)}`, { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        const items = data as { id: string; symbol: string; side: 'BUY' | 'SELL'; status: 'EXECUTED' | 'CANCELLED' | 'REJECTED'; qty: number; price: number; order_type: 'MARKET' | 'LIMIT'; info: string; time: string }[];
        setOrders(items.map(r => ({
          symbol: r.symbol,
          side: r.side,
          status: r.status,
          qty: r.qty,
          price: r.price,
          orderType: r.order_type,
          info: r.info,
          time: r.time,
        })));
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      })
      .finally(() => setOrdersLoading(false));
  }, [uid, tab]);

  const filtered = orders.filter(o =>
    o.symbol.toLowerCase().includes(search.toLowerCase()) ||
    uid.toLowerCase().includes(search.toLowerCase())
  );
  const displayed = filtered.slice(0, Number(rows));

  const buyCount = orders.filter(o => o.side === 'BUY').length;
  const sellCount = orders.filter(o => o.side === 'SELL').length;

  return (
    <div className="adm-ord-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <div className="adm-ord-stats">
        <div className="adm-ord-stat">
          <div className="adm-ord-stat-label">USER</div>
          <div className="adm-ord-stat-value">{uid}</div>
        </div>
        <div className="adm-ord-stat">
          <div className="adm-ord-stat-label">BUY TRADES</div>
          <div className="adm-ord-stat-value pos">{buyCount}</div>
        </div>
        <div className="adm-ord-stat">
          <div className="adm-ord-stat-label">SELL TRADES</div>
          <div className="adm-ord-stat-value neg">{sellCount}</div>
        </div>
      </div>

      <div className="adm-ord-tabs">
        {(['executed', 'limit', 'rejected'] as const).map(t => (
          <button
            key={t}
            className={`adm-ord-tab ${tab === t ? 'active' : ''}`}
            onClick={() => { setTab(t); setSearch(''); }}
          >
            {t === 'executed' ? 'Executed Orders' : t === 'limit' ? 'Limit Orders' : 'Rejected Orders'}
          </button>
        ))}
      </div>

      <div className="adm-ord-filters">
        <div className="adm-ord-search-wrap">
          <i className="fas fa-search adm-ord-search-icon" />
          <input
            className="adm-ord-search"
            placeholder="Search by User ID or Symbol"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="adm-ord-rows" value={rows} onChange={e => setRows(e.target.value)}>
          <option value="10">Show 10 Rows</option>
          <option value="20">Show 20 Rows</option>
          <option value="50">Show 50 Rows</option>
        </select>
      </div>

      <div className="adm-ord-table-wrap">
        <table className="adm-ord-table">
          <thead>
            <tr>
              <th>SYMBOL</th>
              <th>SIDE</th>
              <th>STATUS</th>
              <th>QTY</th>
              <th>PRICE</th>
              <th>TYPE</th>
              <th>INFO</th>
              <th style={{ textAlign: 'right' }}>TIME</th>
            </tr>
          </thead>
          <tbody>
            {ordersLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={8} style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 16 }}>
                      {Array.from({ length: 8 }).map((__, j) => <div key={j} style={{ height: 12, background: '#21262d', borderRadius: 4, animation: 'adm-skeleton-shimmer 1.4s infinite' }} />)}
                    </div>
                  </td>
                </tr>
              ))
            ) : displayed.length === 0 ? (
              <tr>
                <td colSpan={8} className="adm-ord-empty">No orders found</td>
              </tr>
            ) : displayed.map((o, i) => (
              <tr key={i}>
                <td><span className="adm-ord-sym-badge">{o.symbol}</span></td>
                <td><span className={`adm-ord-side ${o.side.toLowerCase()}`}>{o.side}</span></td>
                <td><span className={`adm-ord-status ${o.status.toLowerCase()}`}>{o.status}</span></td>
                <td>{o.qty}</td>
                <td>{o.price.toFixed(2)}</td>
                <td>{o.orderType}</td>
                <td className="adm-ord-info">{o.info}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} className="adm-ord-time">{o.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
