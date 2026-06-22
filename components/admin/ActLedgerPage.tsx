'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState, ActLogItem, LOG_ROWS } from './AdminUtils';

export default function ActLedgerPage({ selectedUser, onOpenUserPanel }: {
  selectedUser?: { id: string; role: string; client_id?: string };
  onOpenUserPanel?: () => void;
}) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dlRows, setDlRows] = useState('100');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [logs, setLogs] = useState<ActLogItem[]>([]);
  const [toast, setToast] = useState<ToastState>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<ActLogItem>>({});

  const uid = selectedUser?.id;

  const handleSaveEdit = async (id: string) => {
    try {
      const { ok, data } = await apiCall(`/api/admin/actlogs/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      });
      if (ok) {
        setToast({ message: 'Log updated successfully', type: 'success' });
        setEditingId(null);
        setLogs(logs.map(l => l.id === id ? { ...l, ...editForm } : l));
      } else {
        setToast({ message: (data as any)?.error || 'Update failed', type: 'error' });
      }
    } catch (err: any) {
      setToast({ message: err.message, type: 'error' });
    }
  };
  const [viewMode, setViewMode] = useState<'user' | 'global'>('global');

  // Sync viewMode when selectedUser changes
  useEffect(() => {
    if (uid) {
      setViewMode('user');
    }
  }, [uid]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (search) params.set('search', search);
    
    if (viewMode === 'user' && uid) {
      params.set('user_id', uid);
    }

    params.set('rows', dlRows);
    params.set('page', String(page));
    const query = params.toString() ? `?${params.toString()}` : '';
    apiCall(`/api/admin/actlogs${query}`, { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        setLogs(data as ActLogItem[]);
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
  }, [dateFrom, dateTo, search, page, dlRows, viewMode, uid]);

  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (search) params.set('search', search);

    if (viewMode === 'user' && uid) {
      params.set('user_id', uid);
    }

    params.set('rows', dlRows);
    params.set('export', 'csv');
    supabase.auth.getSession().then(({ data: sessionData }) => {
      const token = sessionData.session?.access_token ?? '';
      fetch(`/api/admin/actlogs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(res => {
        if (!res.ok) { setToast({ message: 'Export failed', type: 'error' }); return; }
        return res.blob();
      }).then(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'actlogs.csv';
        a.click();
        URL.revokeObjectURL(url);
      }).catch(() => setToast({ message: 'Export failed', type: 'error' }));
    });
  };

  const totalPages = Math.max(1, Math.ceil(logs.length / LOG_ROWS));

  return (
    <div className="adm-al-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      
      {/* ── Header bar ── */}
      <div className="adm-ord-header" style={{ marginBottom: 20 }}>
        <div className="adm-ord-header-left" style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <h2 className="adm-page-title" style={{ margin: 0 }}>Action Logs</h2>
          <div className="adm-ord-view-toggle">
            <button
              className={`adm-ord-vtab ${viewMode === 'user' ? 'active' : ''}`}
              onClick={() => { setViewMode('user'); setPage(1); }}
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {uid ? `User: ${(selectedUser?.client_id || uid.slice(0, 8)).toUpperCase()}…` : 'User View'}
              {viewMode === 'user' && onOpenUserPanel && (
                <span
                  onClick={(e) => { e.stopPropagation(); onOpenUserPanel(); }}
                  style={{
                    background: '#161b22', border: '1px solid #30363d', color: '#4493f8',
                    fontSize: '11px', cursor: 'pointer', padding: '2px 6px', borderRadius: '4px'
                  }}
                >
                  Change
                </span>
              )}
            </button>
            <button
              className={`adm-ord-vtab ${viewMode === 'global' ? 'active' : ''}`}
              onClick={() => { setViewMode('global'); setPage(1); }}
            >
              All Platform
            </button>
          </div>
        </div>
      </div>

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

      <div className="adm-al-export-row">
        <div className="adm-al-dl-wrap">
          <label className="adm-al-label">Download Rows</label>
          <div className="adm-al-dl-inner">
            <select className="adm-ord-rows-select" value={dlRows} onChange={e => setDlRows(e.target.value)}>
              {['10', '25', '50', '100'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button className="adm-al-export-btn" onClick={handleExportCsv}>Export CSV</button>
          </div>
        </div>
      </div>

      <div className="adm-ord-search-wrap">
        <i className="fas fa-search adm-ord-search-icon" />
        <input className="adm-ord-search" placeholder="Search..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <div className="adm-al-list">
        {logs.map((l, i) => (
          <div className="adm-al-card" key={i}>
            <div className="adm-al-card-top">
              <div>
                <div className="adm-al-type">{l.type}</div>
                <div className="adm-al-time">{l.time}</div>
              </div>
              <button className="adm-al-details-btn" onClick={() => setExpanded(expanded === i ? null : i)}>
                Details
              </button>
            </div>
            <div className="adm-al-grid">
              <span className="adm-al-dl">By</span>
              <span className="adm-al-dv bold">{l.by}</span>
              <span className="adm-al-dl">Target</span>
              <span className="adm-al-dv bold">{l.target}</span>
              {l.symbol && (<>
                <span className="adm-al-dl">Symbol</span>
                <span className="adm-al-dv">{l.symbol}</span>
                <span className="adm-al-dl">Qty @ Price</span>
                <span className="adm-al-dv">{l.qty} @ {l.price}</span>
              </>)}
              {l.reason && (<>
                <span className="adm-al-dl">Reason</span>
                <span className="adm-al-dv">{l.reason}</span>
              </>)}
              <span className="adm-al-dl">IP</span>
              <span className="adm-al-dv muted">{l.ip}</span>
            </div>
            {expanded === i && (
              <div className="adm-al-expanded">
                {editingId === l.id ? (
                  <>
                    <div className="adm-al-exp-row"><span>Type</span><input className="adm-ord-search" value={editForm.type ?? ''} onChange={e => setEditForm({ ...editForm, type: e.target.value })} style={{ padding: '4px', height: '28px', maxWidth: '300px' }} /></div>
                    <div className="adm-al-exp-row"><span>Symbol</span><input className="adm-ord-search" value={editForm.symbol ?? ''} onChange={e => setEditForm({ ...editForm, symbol: e.target.value })} style={{ padding: '4px', height: '28px', maxWidth: '300px' }} /></div>
                    <div className="adm-al-exp-row"><span>Qty</span><input className="adm-ord-search" type="number" value={editForm.qty ?? ''} onChange={e => setEditForm({ ...editForm, qty: Number(e.target.value) || null })} style={{ padding: '4px', height: '28px', maxWidth: '300px' }} /></div>
                    <div className="adm-al-exp-row"><span>Price</span><input className="adm-ord-search" type="number" value={editForm.price ?? ''} onChange={e => setEditForm({ ...editForm, price: Number(e.target.value) || null })} style={{ padding: '4px', height: '28px', maxWidth: '300px' }} /></div>
                    <div className="adm-al-exp-row"><span>Reason</span><input className="adm-ord-search" value={editForm.reason ?? ''} onChange={e => setEditForm({ ...editForm, reason: e.target.value })} style={{ padding: '4px', height: '28px', maxWidth: '300px' }} /></div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button className="adm-btn-primary" onClick={() => handleSaveEdit(l.id)} style={{ padding: '4px 12px', fontSize: '12px' }}>Save</button>
                      <button className="adm-sheet-cancel" onClick={() => setEditingId(null)} style={{ padding: '4px 12px', fontSize: '12px' }}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="adm-al-exp-row"><span>Type</span><span>{l.type}</span></div>
                    <div className="adm-al-exp-row"><span>Time</span><span>{l.time}</span></div>
                    <div className="adm-al-exp-row"><span>By</span><span>{l.by}</span></div>
                    <div className="adm-al-exp-row"><span>Target</span><span>{l.target}</span></div>
                    {l.symbol && <div className="adm-al-exp-row"><span>Symbol</span><span>{l.symbol}</span></div>}
                    {l.qty && <div className="adm-al-exp-row"><span>Qty</span><span>{l.qty}</span></div>}
                    {l.price && <div className="adm-al-exp-row"><span>Price</span><span>{l.price}</span></div>}
                    {l.reason && <div className="adm-al-exp-row"><span>Reason</span><span>{l.reason}</span></div>}
                    <div className="adm-al-exp-row"><span>IP</span><span>{l.ip}</span></div>
                    <div style={{ marginTop: '12px' }}>
                      <button className="adm-al-details-btn" onClick={() => { setEditingId(l.id); setEditForm({ type: l.type, symbol: l.symbol, qty: l.qty, price: l.price, reason: l.reason }); }}>Edit Details</button>
                    </div>
                  </>
                )}
              </div>
            )}
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
