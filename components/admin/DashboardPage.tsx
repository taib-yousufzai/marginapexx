'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState, SkeletonCard } from './AdminUtils';

export type DashboardMetrics = {
  ledger_balance: number;
  net_balance?: number;
  mark_to_market: number;
  net_pnl?: number;
  total_brokerage?: number;
  margin_used?: number;
  net: number;
  total_deposits: number;
  total_withdrawals: number;
  avg_deposit: number;
  avg_withdrawal: number;
  avg_profit: number;
  avg_loss: number;
  profitable_clients: number;
  loss_making_clients: number;
  buy_position_count: number;
  sell_position_count: number;
  registered: number;
  added_funds: number;
  conversion: string;
};

export type MetricsStore = Record<string, string | number>;

export const metricsToStore = (m: DashboardMetrics | null): MetricsStore => {
  if (!m) return {};
  const fmt = (n: number | null | undefined) => {
    if (n === null || n === undefined || isNaN(n)) return '0.00';
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  
  return {
    'LEDGER BALANCE': '₹' + fmt(m.ledger_balance),
    'NET BALANCE': '₹' + fmt(m.net_balance ?? 0),
    'MARGIN USED': '₹' + fmt(m.margin_used ?? 0),
    'MARK-TO-MARKET': '₹' + fmt(m.mark_to_market),
    'NET P&L': '₹' + fmt(m.net_pnl ?? 0),
    'BROKERAGE': '₹' + fmt(m.total_brokerage ?? 0),
    'NET': '₹' + fmt(m.net),
    'TOTAL DEPOSITS': '₹' + fmt(m.total_deposits),
    'TOTAL WITHDRAWALS': '₹' + fmt(m.total_withdrawals),
    'AVG DEPOSIT': '₹' + fmt(m.avg_deposit),
    'AVG WITHDRAWAL': '₹' + fmt(m.avg_withdrawal),
    'REGISTERED': m.registered || 0,
    'ADDED FUNDS': m.added_funds || 0,
    'CONVERSION': m.conversion || '0%',
    'AVG PROFIT': '₹' + fmt(m.avg_profit),
    'AVG LOSS': '₹' + fmt(m.avg_loss),
    'PROFITABLE CLIENTS': m.profitable_clients || 0,
    'LOSS-MAKING CLIENTS': m.loss_making_clients || 0,
    'BUY POSITION': m.buy_position_count || 0,
    'SELL POSITION': m.sell_position_count || 0,
    'RATIO': (m.sell_position_count ? (m.buy_position_count / m.sell_position_count) : m.buy_position_count).toFixed(2),
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

export default function DashboardPage({ selectedUser, onOpenUserPanel, isDemoMode }: {
  selectedUser?: { id: string; role: string };
  onOpenUserPanel?: () => void;
  isDemoMode: boolean;
}) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  const [brokerId, setBrokerId] = useState('');
  const [subBrokerId, setSubBrokerId] = useState('');
  const [clientId, setClientId] = useState('');
  const [usersList, setUsersList] = useState<{ id: string; role: string; parent_id: string }[]>([]);

  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    apiCall(`/api/admin/users?demo=${isDemoMode}`, { method: 'GET' }).then(({ ok, data }) => {
      if (ok) setUsersList(data as { id: string; role: string; parent_id: string }[]);
    });
  }, [isDemoMode]);

  useEffect(() => {
    if (selectedUser?.id) {
      setTimeout(() => {
        const u = usersList.find(x => x.id === selectedUser.id);
        if (u) {
          if (u.role === 'broker') { setBrokerId(u.id); setSubBrokerId(''); setClientId(''); }
          else if (u.role === 'sub_broker') { setBrokerId(u.parent_id || ''); setSubBrokerId(u.id); setClientId(''); }
          else { 
            setClientId(u.id); 
            const parent = usersList.find(x => x.id === u.parent_id);
            if (parent?.role === 'sub_broker') { setSubBrokerId(parent.id); setBrokerId(parent.parent_id || ''); }
            else if (parent?.role === 'broker') { setBrokerId(parent.id); setSubBrokerId(''); }
          }
        } else {
          setClientId(selectedUser.id);
        }
      }, 0);
    }
  }, [selectedUser, usersList, isDemoMode]);

  const fetchMetrics = useCallback((manual = false, silent = false) => {
    if (!silent) setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (brokerId) params.set('broker_id', brokerId);
    if (subBrokerId) params.set('sub_broker_id', subBrokerId);
    if (clientId) params.set('client_id', clientId);
    params.set('demo', String(isDemoMode));
    
    const query = params.toString() ? `?${params.toString()}` : '';
    apiCall(`/api/admin/dashboard${query}`, { method: 'GET' })
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
  }, [dateFrom, dateTo, brokerId, subBrokerId, clientId, isDemoMode]);

  useEffect(() => {
    setTimeout(() => fetchMetrics(), 0);
    const interval = setInterval(() => {
      fetchMetrics(false, true); // silent refresh every second
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  const metricsStore = metricsToStore(metrics);

  const brokers = usersList.filter(u => u.role === 'broker');
  const subBrokers = usersList.filter(u => u.role === 'sub_broker' && (!brokerId || u.parent_id === brokerId));
  const clients = usersList.filter(u => (u.role === 'user' || u.role === 'client') && (!subBrokerId ? (!brokerId || u.parent_id === brokerId) : u.parent_id === subBrokerId));

  return (
    <div className="adm-db-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <div className="adm-db-top-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div className="adm-db-username" style={{ margin: 0 }}>
            <i className="fas fa-chart-line" style={{ marginRight: 8, opacity: 0.7 }} />
            Platform Dashboard
          </div>
          <div className="adm-db-filter-row">
            <span className="adm-db-filter-label">Date:</span>
            <div className="adm-db-date-group">
              <input type="date" className="adm-db-date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              <span className="adm-db-filter-dash">–</span>
              <input type="date" className="adm-db-date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <select className="adm-db-date" style={{ flex: 1, minWidth: 150 }} value={brokerId} onChange={e => { setBrokerId(e.target.value); setSubBrokerId(''); setClientId(''); }}>
            <option value="">All Brokers</option>
            {brokers.map(b => <option key={b.id} value={b.id}>{b.id}</option>)}
          </select>
          <select className="adm-db-date" style={{ flex: 1, minWidth: 150 }} value={subBrokerId} onChange={e => { setSubBrokerId(e.target.value); setClientId(''); }}>
            <option value="">All Sub-Brokers</option>
            {subBrokers.map(b => <option key={b.id} value={b.id}>{b.id}</option>)}
          </select>
          <select className="adm-db-date" style={{ flex: 1, minWidth: 150 }} value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.id}</option>)}
          </select>
          <button className="adm-db-refresh" onClick={() => { setBrokerId(''); setSubBrokerId(''); setClientId(''); }} style={{ padding: '0 12px', borderRadius: 6 }} title="Clear Filters">
            <i className="fas fa-times" />
          </button>
        </div>
      </div>

      <DashBoardSection key="bal" metrics={metricsStore} title="BALANCE INFO" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
        { label: 'LEDGER BALANCE' },
        { label: 'NET BALANCE' },
        { label: 'MARGIN USED' },
      ]} />

      {loading && !metrics ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} rows={4} />
          ))}
        </div>
      ) : (<>
        <DashBoardSection key="pnl_overall" metrics={metricsStore} title="OVERALL P&L" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'MARK-TO-MARKET' },
          { label: 'BROKERAGE' },
          { label: 'NET P&L' },
        ]} />

        <DashBoardSection key="dep" metrics={metricsStore} title="DEPOSITS & WITHDRAWALS" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'NET' },
          { label: 'TOTAL DEPOSITS' },
          { label: 'TOTAL WITHDRAWALS' },
          { label: 'AVG DEPOSIT' },
          { label: 'AVG WITHDRAWAL' },
        ]} />

        <DashBoardSection key="reg" metrics={metricsStore} title="CLIENT REGISTRATION" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'REGISTERED' },
          { label: 'ADDED FUNDS' },
          { label: 'CONVERSION' },
        ]} />

        <DashBoardSection key="pnl_client" metrics={metricsStore} title="CLIENT PROFIT & LOSS" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'AVG PROFIT' },
          { label: 'AVG LOSS' },
          { label: 'PROFITABLE CLIENTS' },
          { label: 'LOSS-MAKING CLIENTS' },
        ]} />

        <DashBoardSection key="pos" metrics={metricsStore} title="POSITION DETAILS" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'BUY POSITION' },
          { label: 'SELL POSITION' },
          { label: 'RATIO' },
        ]} />
      </>)}

      <div style={{ height: 24 }} />
    </div>
  );
}
