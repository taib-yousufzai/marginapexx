'use client';
import React, { useState, useEffect } from 'react';
import { apiCall, Toast, ToastState } from '../AdminUtils';

interface FilteringConfig {
  indexOptionsRange: number;
  mcxOptionsRange: number;
}

export default function SettingsFiltering() {
  const [indexOptionsRange, setIndexOptionsRange] = useState<string>('5');
  const [mcxOptionsRange, setMcxOptionsRange] = useState<string>('7');

  const [toast, setToast] = useState<ToastState>(null);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { ok, data } = await apiCall('/api/admin/settings/filtering', { method: 'GET' });
      if (ok) {
        const config = data as FilteringConfig;
        setIndexOptionsRange(String(config.indexOptionsRange));
        setMcxOptionsRange(String(config.mcxOptionsRange));
      } else {
        setToast({ message: 'Failed to fetch filtering settings', type: 'error' });
      }
    } catch {
      setToast({ message: 'Network error fetching filtering settings', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const indexVal = parseInt(indexOptionsRange, 10);
    const mcxVal = parseInt(mcxOptionsRange, 10);

    if (!Number.isInteger(indexVal) || indexVal <= 0 || indexVal > 40 || String(indexVal) !== indexOptionsRange.trim()) {
      setToast({ message: 'Index Options Strike Range must be between 1 and 40', type: 'error' });
      return;
    }
    if (!Number.isInteger(mcxVal) || mcxVal <= 0 || mcxVal > 40 || String(mcxVal) !== mcxOptionsRange.trim()) {
      setToast({ message: 'MCX Options Strike Range must be between 1 and 40', type: 'error' });
      return;
    }

    setSaveLoading(true);
    try {
      const { ok, data } = await apiCall('/api/admin/settings/filtering', {
        method: 'PUT',
        body: JSON.stringify({
          indexOptionsRange: indexVal,
          mcxOptionsRange: mcxVal,
        }),
      });

      if (!ok) {
        const err = data as { error?: string };
        setToast({ message: err.error || 'Failed to save filtering settings', type: 'error' });
      } else {
        setToast({ message: 'Filtering settings saved successfully', type: 'success' });
      }
    } catch {
      setToast({ message: 'Network error saving filtering settings', type: 'error' });
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="adm-set-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
        <div style={{ color: '#8b949e' }}>Loading filtering settings...</div>
      </div>
    );
  }

  return (
    <div className="adm-set-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div className="adm-mw-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 className="adm-page-title" style={{ margin: 0 }}>Filtering Settings</h2>
          <p style={{ margin: '4px 0 0', color: '#8b949e', fontSize: '13px' }}>
            Configure strike range limits for Index and MCX Options segments.
          </p>
        </div>
        <button
          className="adm-btn-primary"
          onClick={handleSave}
          disabled={saveLoading}
        >
          {saveLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="adm-card" style={{ maxWidth: 600, padding: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 24, color: '#e6edf3', fontSize: '16px', paddingBottom: 12, borderBottom: '1px solid #30363d' }}>
          Options Strike Range
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="adm-upd-field">
            <label className="adm-upd-label">Index Options Strike Range</label>
            <input
              type="number"
              className="adm-upd-input"
              value={indexOptionsRange}
              onChange={(e) => setIndexOptionsRange(e.target.value)}
              placeholder="5"
              min="1"
              max="40"
              step="1"
              style={{ maxWidth: 160 }}
            />
            <p style={{ margin: '6px 0 0', color: '#8b949e', fontSize: '12px' }}>
              Number of CE and PE strikes to show around ATM for NIFTY, BANKNIFTY, etc. (e.g. 5 → 10 strikes total)
            </p>
          </div>

          <div className="adm-upd-field">
            <label className="adm-upd-label">MCX Options Strike Range</label>
            <input
              type="number"
              className="adm-upd-input"
              value={mcxOptionsRange}
              onChange={(e) => setMcxOptionsRange(e.target.value)}
              placeholder="7"
              min="1"
              max="40"
              step="1"
              style={{ maxWidth: 160 }}
            />
            <p style={{ margin: '6px 0 0', color: '#8b949e', fontSize: '12px' }}>
              Number of CE and PE strikes to show around ATM for GOLD, CRUDEOIL, etc. (e.g. 7 → 14 strikes total)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
