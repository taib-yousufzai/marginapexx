'use client';
import React, { useState, useEffect } from 'react';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState, SkeletonTable, ConfirmDialog } from '../AdminUtils';

type Script = { id: string; symbol: string; lotSize: number };

export default function SettingsScripts() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [formSymbol, setFormSymbol] = useState('');
  const [formLot, setFormLot] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    apiCall('/api/admin/settings/scripts', { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (!ok) { setToast({ message: 'Failed to load scripts', type: 'error' }); return; }
        setScripts(data as Script[]);
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleOpenAdd = () => {
    setEditIdx(null);
    setFormSymbol('');
    setFormLot('');
    setShowModal(true);
  };

  const handleOpenEdit = (idx: number) => {
    setEditIdx(idx);
    setFormSymbol(scripts[idx].symbol);
    setFormLot(String(scripts[idx].lotSize));
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formSymbol || !formLot) { setToast({ message: 'Fill all fields', type: 'error' }); return; }
    setSaveLoading(true);
    try {
      const isEdit = editIdx !== null;
      const method = isEdit ? 'PATCH' : 'POST';
      const path = isEdit ? `/api/admin/settings/scripts/${scripts[editIdx].id}` : '/api/admin/settings/scripts';

      const { ok, data } = await apiCall(path, {
        method,
        body: JSON.stringify({ symbol: formSymbol, lotSize: Number(formLot) }),
      });

      if (!ok) {
        setToast({ message: (data as { error?: string })?.error ?? 'Failed to save', type: 'error' });
        return;
      }

      if (isEdit) {
        const newArr = [...scripts];
        newArr[editIdx] = data as Script;
        setScripts(newArr);
      } else {
        setScripts([...scripts, data as Script]);
      }
      setToast({ message: 'Saved successfully', type: 'success' });
      setShowModal(false);
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleDelete = async () => {
    if (deleteIdx === null) return;
    setSaveLoading(true);
    try {
      const { ok, data } = await apiCall(`/api/admin/settings/scripts/${scripts[deleteIdx].id}`, { method: 'DELETE' });
      if (!ok) {
        setToast({ message: (data as { error?: string })?.error ?? 'Failed to delete', type: 'error' });
        return;
      }
      setScripts(scripts.filter((_, i) => i !== deleteIdx));
      setToast({ message: 'Deleted successfully', type: 'success' });
      setDeleteIdx(null);
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="adm-set-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {deleteIdx !== null && (
        <ConfirmDialog
          message={`Are you sure you want to delete ${scripts[deleteIdx].symbol}?`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteIdx(null)}
          loading={saveLoading}
        />
      )}
      <div className="adm-mw-header">
        <h2 className="adm-page-title" style={{ margin: 0 }}>Script Settings</h2>
        <button className="adm-btn-primary" onClick={handleOpenAdd}>+ Add Script</button>
      </div>

      <div className="adm-set-table-wrap">
        {loading ? (
          <SkeletonTable cols={3} rows={5} />
        ) : (
          <table className="adm-set-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Lot Size</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {scripts.length === 0 ? (
                <tr><td colSpan={3} className="adm-mw-empty">No scripts defined</td></tr>
              ) : (
                scripts.map((s, i) => (
                  <tr key={s.id}>
                    <td className="bold">{s.symbol}</td>
                    <td>{s.lotSize}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="adm-set-edit" onClick={() => handleOpenEdit(i)}>Edit</button>
                        <button className="adm-set-del" onClick={() => setDeleteIdx(i)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="adm-overlay" onClick={() => !saveLoading && setShowModal(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="adm-card" style={{ width: '90%', maxWidth: 340, padding: 24 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginTop: 0, marginBottom: 20, color: '#e6edf3' }}>{editIdx !== null ? 'Edit Script' : 'Add Script'}</h3>
            <div className="adm-upd-field">
              <label className="adm-upd-label">Symbol</label>
              <input className="adm-upd-input" value={formSymbol} onChange={e => setFormSymbol(e.target.value.toUpperCase())} placeholder="e.g. RELIANCE" />
            </div>
            <div className="adm-upd-field">
              <label className="adm-upd-label">Lot Size</label>
              <input type="number" className="adm-upd-input" value={formLot} onChange={e => setFormLot(e.target.value)} placeholder="e.g. 1" />
            </div>
            <div className="adm-sheet-actions" style={{ marginTop: 24 }}>
              <button className="adm-sheet-cancel" onClick={() => setShowModal(false)} disabled={saveLoading}>Cancel</button>
              <button className="adm-btn-primary" onClick={handleSave} disabled={saveLoading}>
                {saveLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
