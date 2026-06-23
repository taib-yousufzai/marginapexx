'use client';
import React, { useState, useEffect } from 'react';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState } from './AdminUtils';

type AccountItem = {
  id: string; full_name: string; broker: string;
  net_pnl: number; brokerage: number; pnl_bkg: number; settlement: number;
};

type AccountSummary = {
  id: string; pnlBkg: number; clientNetPnl: number;
  totalBrokerage: number; sharingBkg: number; sharingPnl: number;
};

export default function AccountsPage({ isDemoMode }: { isDemoMode: boolean }) {
  const [filter, setFilter] = useState<'all' | 'subbrokers' | 'brokers'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [page, setPage] = useState(1);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [toast, setToast] = useState<ToastState>(null);
  const [loading, setLoading] = useState(false);
  const ROWS = 10;
  
  const fetchAccounts = (silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    params.set('filter', filter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (search) params.set('search', search);
    params.set('demo', String(isDemoMode));
    apiCall(`/api/admin/accounts?${params.toString()}`, { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        setAccounts(data as AccountItem[]);
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAccounts();
    const interval = setInterval(() => {
      fetchAccounts(true); // silent refresh every second
    }, 1000);
    return () => clearInterval(interval);
  }, [filter, dateFrom, dateTo, search, isDemoMode]);

  const totalNetPnl = accounts.reduce((s, a) => s + a.net_pnl, 0);
  const totalBrokerage = accounts.reduce((s, a) => s + a.brokerage, 0);
  const totalPnlBkg = accounts.reduce((s, a) => s + a.pnl_bkg, 0);
  const summary: AccountSummary = {
    id: accounts.length > 0 ? (accounts[0].broker || '—') : '—',
    pnlBkg: totalPnlBkg,
    clientNetPnl: totalNetPnl,
    totalBrokerage: totalBrokerage,
    sharingBkg: 0,
    sharingPnl: 0,
  };

  const handleExportExcel = () => {
    const header = 'ID,Full Name,Broker,Net PNL,Brokerage,PNL+BKG,Settlement\n';
    const body = accounts.map(r =>
      `${r.id},${r.full_name},${r.broker},${r.net_pnl},${r.brokerage},${r.pnl_bkg},${r.settlement}`
    ).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'accounts.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = accounts.filter(u =>
    u.id.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS));
  const displayed = filtered.slice((page - 1) * ROWS, page * ROWS);

  const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="adm-acc-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <div className="adm-acc-tabs">
        {(['all', 'subbrokers', 'brokers'] as const).map(t => (
          <button key={t} className={`adm-acc-tab ${filter === t ? 'active' : ''}`}
            onClick={() => { setFilter(t); setPage(1); setUserSearch(''); }}>
            {t === 'all' ? 'All' : t === 'subbrokers' ? 'Sub-Brokers' : 'Brokers'}
          </button>
        ))}
      </div>

      <div className="adm-acc-showing">Showing: <strong>
        {filter === 'all' ? 'ALL' : filter === 'subbrokers' ? 'SUB_BROKER' : 'BROKER'}
      </strong></div>
      <div className="adm-cu-divider" />

      <div className="adm-al-dates">
        <div className="adm-al-date-field">
          <label className="adm-al-label">From</label>
          <input type="date" className="adm-db-date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="adm-al-date-field">
          <label className="adm-al-label">To</label>
          <input type="date" className="adm-db-date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      </div>

      <div className="adm-acc-search-row">
        <div className="adm-ord-search-wrap" style={{ flex: 1 }}>
          <i className="fas fa-search adm-ord-search-icon" />
          <input className="adm-ord-search" placeholder="Search..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <button className="adm-acc-export-btn excel" onClick={handleExportExcel}>Export Excel</button>
      </div>

      <div className="adm-acc-stats-grid">
        <div className="adm-acc-stat">
          <div className="adm-acc-stat-label">USER ID</div>
          <div className="adm-acc-stat-value">{summary.id}</div>
        </div>
        <div className="adm-acc-stat">
          <div className="adm-acc-stat-label">PNL + BKG</div>
          <div className="adm-acc-stat-value">{fmt(summary.pnlBkg)}</div>
        </div>
        <div className="adm-acc-stat">
          <div className="adm-acc-stat-label">CLIENT NET PNL</div>
          <div className="adm-acc-stat-value">{fmt(summary.clientNetPnl)}</div>
        </div>
        <div className="adm-acc-stat">
          <div className="adm-acc-stat-label">TOTAL BROKERAGE</div>
          <div className="adm-acc-stat-value">{fmt(summary.totalBrokerage)}</div>
        </div>
      </div>

      <div className="adm-acc-list">
        {displayed.map((u, i) => (
          <div className="adm-acc-card" key={i}>
            <div className="adm-acc-card-top">
              <div>
                <div className="adm-acc-uid">{u.id}</div>
                <div className="adm-acc-name">{u.full_name}</div>
              </div>
            </div>
            <div className="adm-acc-card-grid">
              <span className="adm-acc-dl">Net PNL</span>
              <span className="adm-acc-dv">₹{fmt(u.net_pnl)}</span>
              <span className="adm-acc-dl">Brokerage</span>
              <span className="adm-acc-dv">₹{fmt(u.brokerage)}</span>
              <span className="adm-acc-dl">PNL+BKG</span>
              <span className="adm-acc-dv">₹{fmt(u.pnl_bkg)}</span>
              <span className="adm-acc-dl">Settlement</span>
              <span className="adm-acc-dv">₹{fmt(u.settlement)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="adm-pos-pagination">
        <span className="adm-pos-page-info">Page {page} of {totalPages}</span>
        <div className="adm-pos-page-btns">
          <button className="adm-pos-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <button className="adm-pos-page-btn active-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      </div>
      <div style={{ height: 24 }} />
    </div>
  );
}
