'use client';
import React, { useState, useEffect } from 'react';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState, ConfirmDialog, SkeletonLine, Position, PositionItem, positionItemToPosition } from './AdminUtils';

export default function PositionPage({ selectedUser }: { selectedUser: { id: string; role: string } }) {
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

  const uid = selectedUser.id;

  const fetchPositions = () => {
    if (!uid) return;
    setPosLoading(true);
    apiCall(`/api/admin/users/${uid}/positions?tab=${encodeURIComponent(tab)}`, { method: 'GET' })
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
  };

  useEffect(() => {
    fetchPositions();
  }, [uid, tab]);

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

  const openEdit = (p: Position) => {
    setEditPos(p);
    setEditSl(p.slTp.split(' / ')[0] === '–' ? '' : p.slTp.split(' / ')[0]);
    setEditTp(p.slTp.split(' / ')[1] === '–' ? '' : p.slTp.split(' / ')[1]);
    setEditQtyOpen(p.qty.split('/')[0]);
  };

  const handleEdit = () => {
    if (!editPos?.id) return;
    const body: Record<string, unknown> = {};
    if (editSl !== '') body.sl = Number(editSl);
    if (editTp !== '') body.tp = Number(editTp);
    if (editQtyOpen !== '') body.qty_open = Number(editQtyOpen);
    apiCall(`/api/admin/positions/${editPos.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }).then(({ ok, status }) => {
      if (status === 401) { signOut(); return; }
      if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
      if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
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
            <div className="adm-modal-actions">
              <button className="adm-sheet-cancel" onClick={() => setEditPos(null)}>Cancel</button>
              <button className="adm-btn-primary" onClick={handleEdit}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="adm-pos-stat-card">
        <div className="adm-pos-stat-label">USER</div>
        <div className="adm-pos-stat-value">{uid}</div>
      </div>
      <div className="adm-pos-stat-card">
        <div className="adm-pos-stat-label">OPEN PNL</div>
        <div className={`adm-pos-stat-value ${openPnl >= 0 ? 'pos' : 'neg'}`}>{openPnl.toFixed(2)}</div>
      </div>
      <div className="adm-pos-stat-card">
        <div className="adm-pos-stat-label">WEEKLY PNL</div>
        <div className="adm-pos-stat-value">0</div>
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

      <div className="adm-ord-list">
        {posLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div className="adm-ord-card" key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {Array.from({ length: 6 }).map((_, j) => <SkeletonLine key={j} height={12} width="70%" />)}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <SkeletonLine width={70} height={30} style={{ borderRadius: 6 }} />
                <SkeletonLine width={50} height={30} style={{ borderRadius: 6 }} />
                <SkeletonLine width={60} height={30} style={{ borderRadius: 6 }} />
              </div>
            </div>
          ))
        ) : displayed.length === 0 ? (
          <div className="adm-mw-empty">No positions found.</div>
        ) : displayed.map((p, i) => (
          <div className="adm-ord-card" key={i}>
            <div className="adm-ord-card-top">
              <div>
                <div className="adm-ord-symbol">{p.symbol}</div>
                <div className="adm-ord-user">{uid}</div>
              </div>
              <div className="adm-ord-badges">
                <span className={`adm-ord-side ${p.side === 'BUY' ? 'buy' : 'sell'}`}>{p.side}</span>
                <span className={`adm-pos-pnl ${p.pnl >= 0 ? 'pos' : 'neg'}`}>{p.pnl.toFixed(2)}</span>
              </div>
            </div>
            <div className="adm-ord-details">
              <div className="adm-ord-detail-row">
                <span className="adm-ord-dl">Qty</span>
                <span className="adm-ord-dv">{p.qty}</span>
                <span className="adm-ord-dl">Avg Price</span>
                <span className="adm-ord-dv">{p.avgPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="adm-ord-detail-row">
                <span className="adm-ord-dl">Entry</span>
                <span className="adm-ord-dv">{p.entry.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                {tab !== 'closed' ? (
                  <><span className="adm-ord-dl">LTP</span>
                    <span className="adm-ord-dv" style={{ color: '#388bfd' }}>{p.ltp?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></>
                ) : (
                  <><span className="adm-ord-dl">Exit</span>
                    <span className="adm-ord-dv">{p.exit?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span></>
                )}
              </div>
              <div className="adm-ord-detail-row">
                <span className="adm-ord-dl">Duration</span>
                <span className="adm-ord-dv">{p.duration}</span>
                <span className="adm-ord-dl">Brokerage</span>
                <span className="adm-ord-dv">{p.brokerage.toFixed(2)}</span>
              </div>
              <div className="adm-ord-detail-row">
                <span className="adm-ord-dl">SL / TP</span>
                <span className="adm-ord-dv" style={{ gridColumn: '2 / -1' }}>{p.slTp}</span>
              </div>
              {tab === 'closed' && (<>
                <div className="adm-ord-detail-row">
                  <span className="adm-ord-dl">Settlement</span>
                  <span className="adm-ord-dv" style={{ gridColumn: '2 / -1', color: '#388bfd' }}>{p.settlement}</span>
                </div>
                <div className="adm-ord-detail-row">
                  <span className="adm-ord-dl">Entry Time</span>
                  <span className="adm-ord-dv" style={{ gridColumn: '2 / -1' }}>{p.entryTime}</span>
                </div>
                <div className="adm-ord-detail-row">
                  <span className="adm-ord-dl">Exit Time</span>
                  <span className="adm-ord-dv" style={{ gridColumn: '2 / -1' }}>{p.exitTime}</span>
                </div>
                <div className="adm-pos-card-actions">
                  <button className="adm-pos-act-edit" onClick={() => openEdit(p)}>Edit</button>
                  <button className="adm-pos-act-reopen">Reopen</button>
                  <button className="adm-pos-act-delete" onClick={() => setConfirmDeleteId(p.id)}>Delete</button>
                </div>
              </>)}
              {tab !== 'closed' && (
                <div className="adm-ord-detail-row">
                  <span className="adm-ord-dl">Entry Time</span>
                  <span className="adm-ord-dv" style={{ gridColumn: '2 / -1' }}>{p.entryTime}</span>
                </div>
              )}
              {tab === 'open' && (
                <button className="adm-pos-act-sqoff-full" onClick={() => handleSqoff(p.id)}>Sqoff</button>
              )}
              {tab === 'active' && (
                <div className="adm-pos-card-actions">
                  <button className="adm-pos-act-sqoff" onClick={() => handleSqoff(p.id)}>Sqoff</button>
                  <button className="adm-pos-act-edit" onClick={() => openEdit(p)}>Edit</button>
                  <button className="adm-pos-act-delete" onClick={() => setConfirmDeleteId(p.id)}>Delete</button>
                </div>
              )}
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
