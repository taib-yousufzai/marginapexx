'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState, SkeletonLine, SkeletonCard } from './AdminUtils';
import { toCsvPayRequests } from '@/lib/csvExport';
import type { PayRequest } from '@/lib/csvExport';

export default function PayinOutPage() {
  const [tab, setTab] = useState<'deposit' | 'withdrawal' | 'rules'>('deposit');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('All Status');
  const [rows, setRows] = useState('10');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // Rules state
  const [withdrawEnabled, setWithdrawEnabled] = useState(true);
  const [allowedDays, setAllowedDays] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('16:00');
  const [minWithdraw, setMinWithdraw] = useState('100');
  const [minDeposit, setMinDeposit] = useState('1000');

  // Dynamic data state
  const [requests, setRequests] = useState<PayRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const toggleDay = (d: string) => setAllowedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  // Fetch requests whenever filters change (not for rules tab)
  useEffect(() => {
    if (tab === 'rules') return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('type', tab.toUpperCase());
    if (status !== 'All Status') params.set('status', status);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('rows', rows);
    apiCall(`/api/admin/payinout?${params.toString()}`, { method: 'GET' })
      .then(({ ok, status: httpStatus, data }) => {
        if (httpStatus === 401) { signOut(); return; }
        if (!ok) {
          const msg = (data as { error?: string })?.error ?? 'Failed to load requests';
          setError(msg);
          setRequests([]);
          return;
        }
        setRequests(data as PayRequest[]);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Network error');
        setRequests([]);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dateFrom, dateTo, status, search, page, rows, refreshKey]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin_pay_requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pay_requests' },
        (payload) => {
          console.log('Realtime update received:', payload);
          setRefreshKey(prev => prev + 1);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime subscription active for pay_requests');
        } else if (status === 'CLOSED') {
          console.log('Realtime subscription closed');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Realtime subscription error');
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch rules when rules tab is opened
  useEffect(() => {
    if (tab !== 'rules') return;
    setRulesLoading(true);
    apiCall('/api/admin/payinout/rules', { method: 'GET' })
      .then(({ ok, status: httpStatus, data }) => {
        if (httpStatus === 401) { signOut(); return; }
        if (!ok) {
          setToast({ message: (data as { error?: string })?.error ?? 'Failed to load rules', type: 'error' });
          return;
        }
        const r = data as {
          withdraw_enabled: boolean; allowed_days: string[];
          start_time: string; end_time: string;
          min_withdraw: number; min_deposit: number;
        };
        setWithdrawEnabled(r.withdraw_enabled);
        setAllowedDays(r.allowed_days);
        setStartTime(r.start_time);
        setEndTime(r.end_time);
        setMinWithdraw(String(r.min_withdraw));
        setMinDeposit(String(r.min_deposit));
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      })
      .finally(() => setRulesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleAccept = async (r: PayRequest) => {
    setActionLoading(prev => ({ ...prev, [r.id]: true }));
    try {
      const { ok, status: httpStatus, data } = await apiCall(`/api/admin/payinout/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'approve' }),
      });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setToast({ message: (data as { error?: string })?.error ?? 'Failed to approve', type: 'error' });
        return;
      }
      setRequests(prev => prev.map(req => req.id === r.id ? { ...req, status: 'APPROVED' } : req));
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setActionLoading(prev => ({ ...prev, [r.id]: false }));
    }
  };

  const handleReject = async (r: PayRequest) => {
    setActionLoading(prev => ({ ...prev, [r.id]: true }));
    try {
      const { ok, status: httpStatus, data } = await apiCall(`/api/admin/payinout/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reject' }),
      });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setToast({ message: (data as { error?: string })?.error ?? 'Failed to reject', type: 'error' });
        return;
      }
      setRequests(prev => prev.map(req => req.id === r.id ? { ...req, status: 'REJECTED' } : req));
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setActionLoading(prev => ({ ...prev, [r.id]: false }));
    }
  };

  const handleDelete = async (r: PayRequest) => {
    if (!window.confirm('Are you sure you want to delete this request?')) return;
    setActionLoading(prev => ({ ...prev, [r.id]: true }));
    try {
      const { ok, status: httpStatus, data } = await apiCall(`/api/admin/payinout/${r.id}`, {
        method: 'DELETE',
      });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setToast({ message: (data as { error?: string })?.error ?? 'Failed to delete', type: 'error' });
        return;
      }
      setRequests(prev => prev.filter(req => req.id !== r.id));
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setActionLoading(prev => { const next = { ...prev }; delete next[r.id]; return next; });
    }
  };

  const handleSaveRules = async () => {
    setRulesSaving(true);
    try {
      const { ok, status: httpStatus, data } = await apiCall('/api/admin/payinout/rules', {
        method: 'PUT',
        body: JSON.stringify({
          withdraw_enabled: withdrawEnabled,
          allowed_days: allowedDays,
          start_time: startTime,
          end_time: endTime,
          min_withdraw: Number(minWithdraw),
          min_deposit: Number(minDeposit),
        }),
      });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setToast({ message: (data as { error?: string })?.error ?? 'Failed to save rules', type: 'error' });
        return;
      }
      setToast({ message: 'Rules saved successfully', type: 'success' });
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setRulesSaving(false);
    }
  };

  const handleDownloadCsv = () => {
    const csv = toCsvPayRequests(requests);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payinout_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rowsNum = Number(rows);
  const totalPages = Math.max(1, Math.ceil(requests.length / rowsNum));
  const displayed = requests.slice((page - 1) * rowsNum, page * rowsNum);

  const statusColor = (s: string) => s === 'APPROVED' ? '#2ea043' : s === 'PENDING' ? '#e3b341' : '#f85149';

  return (
    <div className="adm-pay-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <h2 className="adm-page-title">Pay In / Out</h2>

      {/* Tabs */}
      <div className="adm-pay-tabs">
        <button className={`adm-pay-tab ${tab === 'deposit' ? 'active' : ''}`} onClick={() => { setTab('deposit'); setPage(1); }}>Deposit Requests</button>
        <button className={`adm-pay-tab ${tab === 'withdrawal' ? 'active' : ''}`} onClick={() => { setTab('withdrawal'); setPage(1); }}>Withdrawal Requests</button>
        <button className={`adm-pay-tab ${tab === 'rules' ? 'active' : ''}`} onClick={() => setTab('rules')}>Rules</button>
      </div>

      {tab === 'rules' ? (
        <div className="adm-pay-rules">
          <div className="adm-upd-section-title">Wallet Rules</div>
          <div className="adm-pay-rules-sub">Configure withdrawal and deposit settings.</div>
          <div className="adm-cu-divider" />

          {rulesLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonLine key={i} height={36} />)}
            </div>
          ) : (<>
            <div className="adm-upd-section-title" style={{ fontSize: '0.95rem' }}>Withdrawal Rules</div>
            <div className="adm-pay-rule-row">
              <span className="adm-upd-label">Withdrawals Enabled</span>
              <div className={`adm-toggle ${withdrawEnabled ? 'on' : ''}`} onClick={() => setWithdrawEnabled(v => !v)}>
                <div className="adm-toggle-thumb" />
              </div>
            </div>
            <div className="adm-upd-field">
              <label className="adm-upd-label">Allowed Days</label>
              <div className="adm-pay-days-grid">
                {allDays.map(d => (
                  <label key={d} className="adm-cu-seg-item">
                    <input type="checkbox" className="adm-cu-checkbox" checked={allowedDays.includes(d)} onChange={() => toggleDay(d)} />
                    <span className="adm-cu-seg-label" style={{ color: '#e6edf3', fontSize: '0.8rem' }}>{d}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="adm-upd-grid2">
              <div className="adm-upd-field">
                <label className="adm-upd-label">Allowed Start Time</label>
                <input type="time" className="adm-upd-input" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="adm-upd-field">
                <label className="adm-upd-label">Allowed End Time</label>
                <input type="time" className="adm-upd-input" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="adm-upd-field">
              <label className="adm-upd-label">Minimum Withdrawal Amount</label>
              <input className="adm-upd-input" value={minWithdraw} onChange={e => setMinWithdraw(e.target.value)} />
            </div>

            <div className="adm-cu-divider" />
            <div className="adm-upd-section-title" style={{ fontSize: '0.95rem' }}>Deposit Rules</div>
            <div className="adm-upd-field">
              <label className="adm-upd-label">Minimum Deposit Amount</label>
              <input className="adm-upd-input" value={minDeposit} onChange={e => setMinDeposit(e.target.value)} />
            </div>
            <div className="adm-cu-divider" />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="adm-btn-primary"
                style={{ padding: '12px 28px', fontSize: '0.9rem', borderRadius: 10 }}
                disabled={rulesSaving}
                onClick={handleSaveRules}
              >
                {rulesSaving ? 'Saving…' : 'Save Rules'}
              </button>
            </div>
          </>)}
        </div>
      ) : (<>
        {/* Filter Bar */}
        <div className="adm-card" style={{ padding: '12px 16px', marginBottom: 16 }}>
          <div className="adm-pay-controls" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div className="adm-al-date-field">
              <label className="adm-al-label" style={{ marginBottom: 4, display: 'block' }}>From</label>
              <input type="date" className="adm-db-date" style={{ width: '100%', boxSizing: 'border-box' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="adm-al-date-field">
              <label className="adm-al-label" style={{ marginBottom: 4, display: 'block' }}>To</label>
              <input type="date" className="adm-db-date" style={{ width: '100%', boxSizing: 'border-box' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="adm-al-date-field">
              <label className="adm-al-label" style={{ marginBottom: 4, display: 'block' }}>Status</label>
              <select className="adm-ord-rows-select" style={{ width: '100%', height: 38 }} value={status} onChange={e => setStatus(e.target.value)}>
                {['All Status', 'APPROVED', 'PENDING', 'REJECTED'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="adm-al-date-field">
              <label className="adm-al-label" style={{ marginBottom: 4, display: 'block' }}>Rows</label>
              <select className="adm-ord-rows-select" style={{ width: '100%', height: 38 }} value={rows} onChange={e => { setRows(e.target.value); setPage(1); }}>
                {['10', '25', '50', '100'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, borderTop: '1px solid #21262d', paddingTop: 16 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8b949e', fontSize: '0.8rem' }} />
              <input
                className="adm-ord-search"
                style={{ width: '100%', paddingLeft: 34, height: 38 }}
                placeholder="Search by username, reference id..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <button className="adm-pay-clear-btn" style={{ height: 38, padding: '0 20px' }} onClick={() => { setStatus('All Status'); setSearch(''); setDateFrom(''); setDateTo(''); }}>
              <i className="fas fa-times-circle" style={{ marginRight: 6 }} /> Clear
            </button>
            <button className="adm-btn-primary" style={{ height: 38, padding: '0 20px', background: '#238636' }} onClick={handleDownloadCsv}>
              <i className="fas fa-file-excel" style={{ marginRight: 6 }} /> Export
            </button>
          </div>
        </div>

        {/* Request cards */}
        <div className="adm-pay-list">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} rows={5} />)}
            </div>
          ) : error ? (
            <div className="adm-mw-empty" style={{ color: '#f85149' }}>{error}</div>
          ) : displayed.length === 0 ? (
            <div className="adm-mw-empty">No requests found.</div>
          ) : displayed.map((r) => (
            <div className="adm-pay-card" key={r.id}>
              <div className="adm-pay-card-top">
                <div>
                  <div className="adm-pay-uid">{r.user_id}</div>
                  <div className="adm-pay-time">
                    <i className="far fa-clock" style={{ marginRight: 4, fontSize: '0.7rem' }} />
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  <div className="adm-pay-refid">ID: {r.id}</div>
                </div>
                <span className="adm-pay-status" style={{ background: statusColor(r.status) + '15', color: statusColor(r.status), border: `1px solid ${statusColor(r.status)}40` }}>
                  {r.status}
                </span>
              </div>

              <div className="adm-pay-grid">
                <div className="adm-pay-item">
                  <span className="adm-pay-dl">Transaction Type</span>
                  <span className="adm-pay-dv bold" style={{ color: r.type === 'DEPOSIT' ? '#2ea043' : '#f85149' }}>
                    {r.type === 'DEPOSIT' ? '↑ DEPOSIT' : '↓ WITHDRAWAL'}
                  </span>
                </div>
                <div className="adm-pay-item">
                  <span className="adm-pay-dl">Requested Amount</span>
                  <span className="adm-pay-dv bold" style={{ fontSize: '1.1rem' }}>₹{r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="adm-pay-item">
                  <span className="adm-pay-dl">Last Updated</span>
                  <span className="adm-pay-dv">{new Date(r.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>

              {r.type === 'WITHDRAWAL' && r.account_name && (
                <div className="adm-pay-account-box">
                  <div className="adm-pay-account-title">Bank Account Details</div>
                  <div className="adm-pay-account-grid">
                    <span className="adm-pay-dl">Beneficiary</span><span className="adm-pay-dv bold">{r.account_name}</span>
                    <span className="adm-pay-dl">Account No</span><span className="adm-pay-dv" style={{ letterSpacing: '0.5px' }}>{r.account_no}</span>
                    <span className="adm-pay-dl">IFSC / UPI</span><span className="adm-pay-dv">{r.ifsc} / {r.upi}</span>
                  </div>
                </div>
              )}

              {r.type === 'DEPOSIT' && r.utr && (
                <div className="adm-pay-utr-box">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="adm-pay-utr-label">Transaction Reference (UTR)</span>
                    <span className="adm-pay-utr-value">{r.utr}</span>
                  </div>
                  <i className="fas fa-shield-alt" style={{ color: '#58a6ff', fontSize: '1.2rem', opacity: 0.5 }} />
                </div>
              )}

              {r.type === 'DEPOSIT' && r.screenshot_url && (
                <div className="adm-pay-account-box" style={{ marginTop: '12px', border: '1px dashed #30363d' }}>
                  <div className="adm-pay-account-title">Payment Proof (Screenshot)</div>
                  <div style={{ marginTop: '8px', textAlign: 'center' }}>
                    <a href={r.screenshot_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', position: 'relative' }}>
                      <img
                        src={r.screenshot_url}
                        alt="Proof"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '200px',
                          borderRadius: '8px',
                          border: '1px solid #30363d',
                          cursor: 'pointer'
                        }}
                      />
                      <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 4, fontSize: '0.65rem', color: '#fff' }}>
                        Click to view full size
                      </div>
                    </a>
                  </div>
                </div>
              )}

              <div className="adm-pay-actions">
                <button
                  className="adm-pay-btn accept"
                  disabled={!!actionLoading[r.id] || r.status !== 'PENDING'}
                  onClick={() => handleAccept(r)}
                  style={{ opacity: r.status !== 'PENDING' ? 0.5 : 1 }}
                >
                  {actionLoading[r.id] ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-check" /> Approve</>}
                </button>
                <button
                  className="adm-pay-btn reject"
                  disabled={!!actionLoading[r.id] || r.status !== 'PENDING'}
                  onClick={() => handleReject(r)}
                  style={{ opacity: r.status !== 'PENDING' ? 0.5 : 1 }}
                >
                  {actionLoading[r.id] ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-times" /> Reject</>}
                </button>
                <button className="adm-pay-btn position"><i className="fas fa-chart-line" /> Position</button>
                <button className="adm-pay-btn ledger"><i className="fas fa-book" /> Ledger</button>
                <button
                  className="adm-pay-btn delete"
                  disabled={!!actionLoading[r.id]}
                  onClick={() => handleDelete(r)}
                >
                  {actionLoading[r.id] ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-trash-alt" /> Delete</>}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="adm-pos-pagination">
          <span className="adm-pos-page-info">Page {page} of {totalPages}</span>
          <div className="adm-pos-page-btns">
            <button className="adm-pos-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <button className="adm-pos-page-btn active-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        </div>
      </>)}
      <div style={{ height: 24 }} />
    </div>
  );
}
