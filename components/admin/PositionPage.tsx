'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState, ConfirmDialog, SkeletonLine, Position, PositionItem, positionItemToPosition } from './AdminUtils';

export default function PositionPage({ selectedUser, onOpenUserPanel, isDemoMode }: { selectedUser: { id: string; role: string; client_id?: string }, onOpenUserPanel?: () => void, isDemoMode: boolean }) {
  const [tab, setTab] = useState<'open' | 'active' | 'closed'>('open');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState('10');
  const [page, setPage] = useState(1);
  const [positions, setPositions] = useState<Position[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [editPos, setEditPos] = useState<Position | null>(null);
  const [editSl, setEditSl] = useState('');
  const [editTp, setEditTp] = useState('');
  const [editQtyOpen, setEditQtyOpen] = useState('');
  const [editAvgPrice, setEditAvgPrice] = useState('');
  const [editExitPrice, setEditExitPrice] = useState('');
  const [editQtyTotal, setEditQtyTotal] = useState('');
  const [editBrokerage, setEditBrokerage] = useState('');
  const [editSettlement, setEditSettlement] = useState('');
  const [editStatus, setEditStatus] = useState<'open' | 'active' | 'closed'>('open');
  const [editSide, setEditSide] = useState<'BUY' | 'SELL'>('BUY');
  const [weeklyPnl, setWeeklyPnl] = useState<number>(0);

  const uid = selectedUser.id;

  const fetchPositions = useCallback((silent = false) => {
    const endpointId = uid || 'all';
    if (!silent) setPosLoading(true);
    apiCall(`/api/admin/users/${endpointId}/positions?tab=${encodeURIComponent(tab)}&rows=100000&demo=${isDemoMode}`, { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        const items = data as PositionItem[];
        setPositions(items.map(positionItemToPosition));
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      })
      .finally(() => setPosLoading(false));
  }, [uid, tab, isDemoMode]);

  useEffect(() => {
    setTimeout(() => fetchPositions(), 0);
    const interval = setInterval(() => {
      fetchPositions(true); // silent refresh every second
    }, 1000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  useEffect(() => {
    apiCall(`/api/admin/users?demo=${isDemoMode}`, { method: 'GET' }).then(({ ok, data }) => {
      if (ok && Array.isArray(data)) {
        if (!uid) {
          const totalWeekly = data.reduce((sum, u) => sum + (u.weeklyPnl || 0), 0);
          setWeeklyPnl(totalWeekly);
        } else {
          const u = data.find(x => x.id === uid);
          if (u && typeof u.weeklyPnl === 'number') {
            setWeeklyPnl(u.weeklyPnl);
          }
        }
      }
    });
  }, [uid, isDemoMode]);

  const openPnl = positions.reduce((s, p) => s + p.pnl, 0);

  const filtered = positions.filter(p =>
    p.symbol.toLowerCase().includes(search.toLowerCase()) ||
    uid.toLowerCase().includes(search.toLowerCase())
  );
  const rowsNum = Number(rows);
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsNum));
  const displayed = filtered.slice((page - 1) * rowsNum, page * rowsNum);

  const switchTab = (t: 'open' | 'active' | 'closed') => { setTab(t); setSearch(''); setPage(1); };

  const handleSqoff = (posId: string) => {
    apiCall(`/api/admin/positions/${posId}/sqoff`, { method: 'POST' })
      .then(({ ok, status }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        setToast({ message: 'Square off successful', type: 'success' });
        fetchPositions();
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
  };

  const handleReopen = (pos: Position) => {
    apiCall(`/api/admin/positions/${pos.id}/reopen`, {
      method: 'POST',
    }).then(({ ok, status }) => {
      if (status === 401) { signOut(); return; }
      if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
      if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
      setToast({ message: 'Position reopened successfully', type: 'success' });
      fetchPositions();
    }).catch((err: unknown) => {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    });
  };

  const openEdit = (p: Position) => {
    setEditPos(p);
    setEditSl(p.slTp.split(' / ')[0] === '–' ? '' : p.slTp.split(' / ')[0]);
    setEditTp(p.slTp.split(' / ')[1] === '–' ? '' : p.slTp.split(' / ')[1]);
    setEditQtyOpen(p.qty.split('/')[0]);
    setEditAvgPrice(String(p.avgPrice || 0));
    setEditExitPrice(p.exit !== undefined ? String(p.exit) : '');
    setEditQtyTotal(p.qty.split('/')[1] || p.qty.split('/')[0] || '0');
    setEditBrokerage(String(p.brokerage || 0));
    setEditSettlement(p.settlement || '');
    setEditStatus(p.status);
    setEditSide(p.side as 'BUY' | 'SELL');
  };

  const handleEdit = () => {
    if (!editPos?.id) return;
    const body: Record<string, unknown> = {};
    body.status = editStatus;
    body.side = editSide;

    if (editStatus === 'closed') {
      body.avg_price = Number(editAvgPrice);
      body.exit_price = editExitPrice !== '' ? Number(editExitPrice) : null;
      body.qty_total = Number(editQtyTotal);
      body.qty_open = 0;
      body.brokerage = Number(editBrokerage);
      body.settlement = editSettlement !== '' ? editSettlement : null;
    } else {
      if (editSl !== '') body.sl = Number(editSl);
      else body.sl = null;
      if (editTp !== '') body.tp = Number(editTp);
      else body.tp = null;
      if (editQtyOpen !== '') body.qty_open = Number(editQtyOpen);
      if (editQtyTotal !== '') body.qty_total = Number(editQtyTotal);
      body.avg_price = Number(editAvgPrice);
      body.brokerage = Number(editBrokerage);
    }

    apiCall(`/api/admin/positions/${editPos.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then(({ ok, status }) => {
      if (status === 401) { signOut(); return; }
      if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
      if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
      setToast({ message: 'Position updated successfully', type: 'success' });
      setEditPos(null);
      fetchPositions();
    }).catch((err: unknown) => {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    });
  };

  const handleDelete = () => {
    if (!confirmDeleteId) return;
    setDeleteLoading(true);
    apiCall(`/api/admin/positions/${confirmDeleteId}`, { method: 'DELETE' })
      .then(({ ok, status }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        setToast({ message: 'Position deleted successfully', type: 'success' });
        setConfirmDeleteId(null);
        fetchPositions();
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      })
      .finally(() => setDeleteLoading(false));
  };

  return (
    <div className="adm-pos-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {confirmDeleteId && (
        <ConfirmDialog
          message="Delete this position? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setConfirmDeleteId(null)}
          loading={deleteLoading}
        />
      )}
      {editPos && (
        <div className="adm-modal-overlay" onClick={() => setEditPos(null)}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <div className="adm-modal-header">
              <span className="adm-modal-title">Edit Position — {editPos.symbol}</span>
              <button className="adm-modal-close" onClick={() => setEditPos(null)}>✕</button>
            </div>
            
            <div className="adm-sheet-field">
              <label className="adm-sheet-label">Status</label>
              <select 
                className="adm-sheet-input" 
                value={editStatus} 
                onChange={e => setEditStatus(e.target.value as any)}
                style={{ background: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d' }}
              >
                <option value="open">Open</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </div>

            <div className="adm-sheet-field">
              <label className="adm-sheet-label">Side</label>
              <select 
                className="adm-sheet-input" 
                value={editSide} 
                onChange={e => setEditSide(e.target.value as any)}
                style={{ background: '#0d1117', color: '#c9d1d9', border: '1px solid #30363d' }}
              >
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>

            {editStatus === 'closed' ? (
              <>
                <div className="adm-sheet-field">
                  <label className="adm-sheet-label">Entry Price</label>
                  <input className="adm-sheet-input" type="number" step="any" value={editAvgPrice} onChange={e => setEditAvgPrice(e.target.value)} />
                </div>
                <div className="adm-sheet-field">
                  <label className="adm-sheet-label">Exit Price</label>
                  <input className="adm-sheet-input" type="number" step="any" value={editExitPrice} onChange={e => setEditExitPrice(e.target.value)} />
                </div>
                <div className="adm-sheet-field">
                  <label className="adm-sheet-label">Qty Total</label>
                  <input className="adm-sheet-input" type="number" value={editQtyTotal} onChange={e => setEditQtyTotal(e.target.value)} />
                </div>
                <div className="adm-sheet-field">
                  <label className="adm-sheet-label">Brokerage</label>
                  <input className="adm-sheet-input" type="number" step="any" value={editBrokerage} onChange={e => setEditBrokerage(e.target.value)} />
                </div>
                <div className="adm-sheet-field">
                  <label className="adm-sheet-label">Settlement</label>
                  <input className="adm-sheet-input" type="text" value={editSettlement} onChange={e => setEditSettlement(e.target.value)} placeholder="e.g. NSE-EQ" />
                </div>
              </>
            ) : (
              <>
                <div className="adm-sheet-field">
                  <label className="adm-sheet-label">SL</label>
                  <input className="adm-sheet-input" type="number" value={editSl} onChange={e => setEditSl(e.target.value)} placeholder="–" />
                </div>
                <div className="adm-sheet-field">
                  <label className="adm-sheet-label">TP</label>
                  <input className="adm-sheet-input" type="number" value={editTp} onChange={e => setEditTp(e.target.value)} placeholder="–" />
                </div>
                <div className="adm-sheet-field">
                  <label className="adm-sheet-label">Qty Open</label>
                  <input className="adm-sheet-input" type="number" value={editQtyOpen} onChange={e => setEditQtyOpen(e.target.value)} />
                </div>
                <div className="adm-sheet-field">
                  <label className="adm-sheet-label">Qty Total</label>
                  <input className="adm-sheet-input" type="number" value={editQtyTotal} onChange={e => setEditQtyTotal(e.target.value)} />
                </div>
                <div className="adm-sheet-field">
                  <label className="adm-sheet-label">Avg/Entry Price</label>
                  <input className="adm-sheet-input" type="number" step="any" value={editAvgPrice} onChange={e => setEditAvgPrice(e.target.value)} />
                </div>
                <div className="adm-sheet-field">
                  <label className="adm-sheet-label">Brokerage</label>
                  <input className="adm-sheet-input" type="number" step="any" value={editBrokerage} onChange={e => setEditBrokerage(e.target.value)} />
                </div>
              </>
            )}

            <div className="adm-modal-actions">
              <button className="adm-sheet-cancel" onClick={() => setEditPos(null)}>Cancel</button>
              <button className="adm-btn-primary" onClick={handleEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="adm-pos-stats-grid">
        <div className="adm-pos-stat-card">
          <div className="adm-pos-stat-label">USER</div>
          <div className="adm-pos-stat-value" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {uid ? (selectedUser.client_id || (uid.length > 12 ? uid.slice(0, 12) + '...' : uid)).toUpperCase() : 'None'}
            {onOpenUserPanel && (
              <button 
                onClick={onOpenUserPanel} 
                style={{ 
                  background: '#161b22', border: '1px solid #30363d', color: '#4493f8', 
                  fontSize: '11px', cursor: 'pointer', padding: '2px 8px', borderRadius: '4px' 
                }}
              >
                Change
              </button>
            )}
          </div>
        </div>
        <div className="adm-pos-stat-card">
          <div className="adm-pos-stat-label">OPEN PNL</div>
          <div className={`adm-pos-stat-value ${openPnl >= 0 ? 'pos' : 'neg'}`}>{(openPnl ?? 0).toFixed(2)}</div>
        </div>
        <div className="adm-pos-stat-card">
          <div className="adm-pos-stat-label">WEEKLY PNL</div>
          <div className={`adm-pos-stat-value ${weeklyPnl >= 0 ? 'pos' : 'neg'}`}>{weeklyPnl.toFixed(2)}</div>
        </div>
      </div>

      <div className="adm-pos-tabs">
        {(['open', 'active', 'closed'] as const).map(t => (
          <button key={t} className={`adm-pos-tab ${tab === t ? 'active' : ''}`} onClick={() => switchTab(t)}>
            {t === 'open' ? 'Open Position' : t === 'active' ? 'Active Trades' : 'Closed Position'}
          </button>
        ))}
      </div>

      {tab !== 'closed' && (
        <div className="adm-pos-select-wrap">
          <button className="adm-pos-select-btn">Select Multiple</button>
        </div>
      )}

      <div className="adm-ord-search-wrap">
        <i className="fas fa-search adm-ord-search-icon" />
        <input className="adm-ord-search" placeholder="Search by user or symbol" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <div className="adm-ord-controls">
        <div className="adm-ord-rows-wrap">
          <span className="adm-ord-rows-label">Rows</span>
          <select className="adm-ord-rows-select" value={rows} onChange={e => { setRows(e.target.value); setPage(1); }}>
            {['10', '25', '50', '100'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <button className="adm-ord-download"><i className="fas fa-download" /> Download Excel</button>

      <div className="adm-ord-list" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {posLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div className="adm-pos-card" key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <SkeletonLine width={100} height={14} />
                  <SkeletonLine width={160} height={11} />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <SkeletonLine width={40} height={22} style={{ borderRadius: 4 }} />
                  <SkeletonLine width={60} height={22} style={{ borderRadius: 4 }} />
                </div>
              </div>
              <SkeletonLine width="100%" height={1} style={{ background: '#21262d' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                {Array.from({ length: 8 }).map((_, j) => <SkeletonLine key={j} height={12} width="70%" />)}
              </div>
            </div>
          ))
        ) : displayed.length === 0 ? (
          <div className="adm-mw-empty">No positions found.</div>
        ) : displayed.map((p, i) => (
          <div className="adm-pos-card" key={i}>
            <div className="adm-pos-card-header">
              <div className="adm-pos-card-title-group">
                <span className="adm-pos-card-symbol">{p.symbol}</span>
                <span className={`adm-pos-side-badge ${p.side === 'BUY' ? 'buy' : 'sell'}`}>{p.side}</span>
                {!uid && (
                  <span style={{ marginLeft: 8, fontSize: '11px', color: '#8b949e', background: '#21262d', padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>
                    {p.client_id || p.user_name || p.user_id?.slice(0, 8)}
                  </span>
                )}
              </div>
              <div className="adm-pos-card-pnl-group">
                <span className={`adm-pos-pnl-badge ${p.pnl >= 0 ? 'pos' : 'neg'}`}>
                  {p.pnl >= 0 ? '+' : ''}{(p.pnl ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
            
            <div className="adm-pos-card-grid">
              <div className="adm-pos-card-metric">
                <span className="adm-pos-metric-label">Qty</span>
                <span className="adm-pos-metric-value">{p.qty}</span>
              </div>
              <div className="adm-pos-card-metric">
                <span className="adm-pos-metric-label">Avg Price</span>
                <span className="adm-pos-metric-value">{(p.avgPrice ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="adm-pos-card-metric">
                <span className="adm-pos-metric-label">Entry Price</span>
                <span className="adm-pos-metric-value">{(p.entry ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="adm-pos-card-metric">
                {tab !== 'closed' ? (
                  <>
                    <span className="adm-pos-metric-label">LTP</span>
                    <span className="adm-pos-metric-value ltp">{(p.ltp ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </>
                ) : (
                  <>
                    <span className="adm-pos-metric-label">Exit Price</span>
                    <span className="adm-pos-metric-value">{(p.exit ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </>
                )}
              </div>
              <div className="adm-pos-card-metric">
                <span className="adm-pos-metric-label">Duration</span>
                <span className="adm-pos-metric-value">{p.duration}</span>
              </div>
              <div className="adm-pos-card-metric">
                <span className="adm-pos-metric-label">Brokerage</span>
                <span className="adm-pos-metric-value">{(p.brokerage ?? 0).toFixed(2)}</span>
              </div>
              <div className="adm-pos-card-metric col-span-2">
                <span className="adm-pos-metric-label">SL / TP</span>
                <span className="adm-pos-metric-value">{p.slTp}</span>
              </div>
              {tab === 'closed' && (
                <>
                  <div className="adm-pos-card-metric col-span-2">
                    <span className="adm-pos-metric-label">Settlement</span>
                    <span className="adm-pos-metric-value settlement">{p.settlement || '-'}</span>
                  </div>
                  {p.closed_by && (
                    <div className="adm-pos-card-metric col-span-2">
                      <span className="adm-pos-metric-label">Closed By</span>
                      <span className="adm-pos-metric-value" style={{ background: '#30363d', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>{p.closed_by.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="adm-pos-card-footer">
              <div className="adm-pos-time-group">
                <div className="adm-pos-time-row">
                  <span className="adm-pos-time-label">Entry:</span>
                  <span className="adm-pos-time-value">{p.entryTime}</span>
                </div>
                {tab === 'closed' && (
                  <div className="adm-pos-time-row">
                    <span className="adm-pos-time-label">Exit:</span>
                    <span className="adm-pos-time-value">{p.exitTime}</span>
                  </div>
                )}
              </div>

              <div className="adm-pos-actions-group">
                {tab === 'open' && (
                  <>
                    <button className="adm-pos-btn-sqoff" onClick={() => handleSqoff(p.id)}>Square Off</button>
                    <button className="adm-pos-btn-edit" onClick={() => openEdit(p)}>Edit</button>
                    <button className="adm-pos-btn-delete" onClick={() => setConfirmDeleteId(p.id)}>Delete</button>
                  </>
                )}
                {tab === 'active' && (
                  <>
                    <button className="adm-pos-btn-sqoff" onClick={() => handleSqoff(p.id)}>Square Off</button>
                    <button className="adm-pos-btn-edit" onClick={() => openEdit(p)}>Edit</button>
                    <button className="adm-pos-btn-delete" onClick={() => setConfirmDeleteId(p.id)}>Delete</button>
                  </>
                )}
                {tab === 'closed' && (
                  <>
                    <button className="adm-pos-btn-edit" onClick={() => openEdit(p)}>Edit</button>
                    <button className="adm-pos-btn-reopen" onClick={() => handleReopen(p)}>Reopen</button>
                    <button className="adm-pos-btn-delete" onClick={() => setConfirmDeleteId(p.id)}>Delete</button>
                  </>
                )}
              </div>
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
