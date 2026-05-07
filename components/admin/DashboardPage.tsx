'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState, SkeletonCard } from './AdminUtils';

export type DashboardMetrics = {
  ledgerBalance: number;
  mtm: number;
  totalDeposits: number;
  totalWithdrawals: number;
  avgDeposit: number;
  avgWithdrawal: number;
  registeredClients: number;
  addedFundsClients: number;
  conversionRate: number;
  avgProfit: number;
  avgLoss: number;
  profitableClients: number;
  lossMakingClients: number;
  buyPositions: number;
  sellPositions: number;
  buySellRatio: number;
};

export type MetricsStore = Record<string, string | number>;

export const metricsToStore = (m: DashboardMetrics | null): MetricsStore => {
  if (!m) return {};
  const fmt = (n: number | null | undefined) => {
    if (n === null || n === undefined || isNaN(n)) return '0.00';
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  
  return {
    'LEDGER BALANCE': '₹' + fmt(m.ledgerBalance),
    'MARK-TO-MARKET': '₹' + fmt(m.mtm),
    'NET': '₹' + fmt((m.totalDeposits || 0) - (m.totalWithdrawals || 0)),
    'TOTAL DEPOSITS': '₹' + fmt(m.totalDeposits),
    'TOTAL WITHDRAWALS': '₹' + fmt(m.totalWithdrawals),
    'AVG DEPOSIT': '₹' + fmt(m.avgDeposit),
    'AVG WITHDRAWAL': '₹' + fmt(m.avgWithdrawal),
    'REGISTERED': m.registeredClients || 0,
    'ADDED FUNDS': m.addedFundsClients || 0,
    'CONVERSION': ((m.conversionRate || 0) * 100).toFixed(1) + '%',
    'AVG PROFIT': '₹' + fmt(m.avgProfit),
    'AVG LOSS': '₹' + fmt(m.avgLoss),
    'PROFITABLE CLIENTS': m.profitableClients || 0,
    'LOSS-MAKING CLIENTS': m.lossMakingClients || 0,
    'BUY POSITION': m.buyPositions || 0,
    'SELL POSITION': m.sellPositions || 0,
    'RATIO': (m.buySellRatio || 0).toFixed(2),
  };
};

function DashBoardSection({ title, fields, metrics, onFetch, loading }: {
  title: string;
  fields: { label: string }[];
  metrics: MetricsStore;
  onFetch: () => void;
  loading: boolean;
}) {
  return (
    <div className="adm-db-section">
      <div className="adm-db-sec-header">
        <h3 className="adm-db-sec-title">{title}</h3>
        <button className="adm-db-refresh" onClick={onFetch} disabled={loading}>
          <i className={`fas fa-sync-alt ${loading ? 'fa-spin' : ''}`} />
        </button>
      </div>
      <div className="adm-db-grid">
        {fields.map(f => (
          <div className="adm-db-card" key={f.label}>
            <div className="adm-db-label">{f.label}</div>
            <div className="adm-db-value">{metrics[f.label] ?? '—'}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage({ selectedUser, onOpenUserPanel }: {
  selectedUser: { id: string; role: string };
  onOpenUserPanel: () => void;
}) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const uid = selectedUser.id;

  const fetchMetrics = useCallback((manual = false) => {
    if (!uid) {
      if (manual) {
        setToast({ message: 'Please select a user from the sidebar first', type: 'error' });
        onOpenUserPanel();
      }
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const query = params.toString() ? `?${params.toString()}` : '';
    apiCall(`/api/admin/users/${uid}/dashboard${query}`, { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        setMetrics(data as DashboardMetrics);
        if (manual) setToast({ message: 'Dashboard updated successfully', type: 'success' });
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      })
      .finally(() => setLoading(false));
  }, [uid, dateFrom, dateTo, onOpenUserPanel]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (!uid) {
    return (
      <div className="adm-db-root">
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <div className="adm-db-empty-state">
          <div className="adm-db-empty-icon">
            <i className="fas fa-user-clock" />
          </div>
          <h2 className="adm-db-empty-title">No User Selected</h2>
          <p className="adm-db-empty-text">
            Select a user from the USERS panel to view their detailed performance metrics, balance info, and profit/loss data.
          </p>
          <button className="adm-btn-primary" onClick={onOpenUserPanel} style={{ padding: '12px 32px', fontSize: '1rem' }}>
            Select User Now
          </button>
        </div>
      </div>
    );
  }

  const metricsStore = metricsToStore(metrics);

  return (
    <div className="adm-db-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {/* User + date filter */}
      <div className="adm-db-top-card">
        <div className="adm-db-username">
          <i className="fas fa-user-circle" style={{ marginRight: 8, opacity: 0.7 }} />
          {selectedUser.id}
          <span className="adm-db-role-badge">{selectedUser.role}</span>
        </div>
        <div className="adm-db-filter-row">
          <span className="adm-db-filter-label">Filter:</span>
          <div className="adm-db-date-group">
            <input type="date" className="adm-db-date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span className="adm-db-filter-dash">–</span>
            <input type="date" className="adm-db-date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      <DashBoardSection key={uid + 'bal'} metrics={metricsStore} title="BALANCE INFO" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
        { label: 'LEDGER BALANCE' },
        { label: 'MARK-TO-MARKET' },
      ]} />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} rows={4} />
          ))}
        </div>
      ) : (<>
        <DashBoardSection key={uid + 'dep'} metrics={metricsStore} title="DEPOSITS & WITHDRAWALS" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'NET' },
          { label: 'TOTAL DEPOSITS' },
          { label: 'TOTAL WITHDRAWALS' },
          { label: 'AVG DEPOSIT' },
          { label: 'AVG WITHDRAWAL' },
        ]} />

        <DashBoardSection key={uid + 'reg'} metrics={metricsStore} title="CLIENT REGISTRATION" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'REGISTERED' },
          { label: 'ADDED FUNDS' },
          { label: 'CONVERSION' },
        ]} />

        <DashBoardSection key={uid + 'pnl'} metrics={metricsStore} title="CLIENT PROFIT & LOSS" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'AVG PROFIT' },
          { label: 'AVG LOSS' },
          { label: 'PROFITABLE CLIENTS' },
          { label: 'LOSS-MAKING CLIENTS' },
        ]} />

        <DashBoardSection key={uid + 'pos'} metrics={metricsStore} title="POSITION DETAILS" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'BUY POSITION' },
          { label: 'SELL POSITION' },
          { label: 'RATIO' },
        ]} />
      </>)}

      <div style={{ height: 24 }} />
    </div>
  );
}
