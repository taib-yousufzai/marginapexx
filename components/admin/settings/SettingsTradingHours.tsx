'use client';
import React, { useState, useEffect } from 'react';
import { apiCall, Toast, ToastState } from '../AdminUtils';

type TradingSegment = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

export default function SettingsTradingHours() {
  const [segments, setSegments] = useState<TradingSegment[]>([]);
  const [toast, setToast] = useState<ToastState>(null);
  const [loading, setLoading] = useState(true);
  const [saveLoading, setSaveLoading] = useState(false);

  useEffect(() => {
    fetchHours();
  }, []);

  const fetchHours = async () => {
    setLoading(true);
    try {
      const { ok, data } = await apiCall('/api/admin/settings/trading-hours', { method: 'GET' });
      if (ok && Array.isArray(data)) {
        setSegments(data.map((s: any) => ({
          id: s.id,
          name: s.name,
          startTime: s.start_time,
          endTime: s.end_time,
          isActive: s.is_active
        })));
      }
    } catch (e) {
      setToast({ message: 'Failed to fetch trading hours', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = (id: string, field: keyof TradingSegment, value: any) => {
    setSegments(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const handleSave = async () => {
    setSaveLoading(true);
    try {
      const { ok, data } = await apiCall('/api/admin/settings/trading-hours', {
        method: 'PUT',
        body: JSON.stringify({ segments }),
      });
      
      if (!ok) {
        const err = data as { error?: string };
        setToast({ message: err.error || 'Failed to save changes', type: 'error' });
      } else {
        setToast({ message: 'Trading hours saved successfully', type: 'success' });
      }
    } catch (e) {
      setToast({ message: 'Network error saving changes', type: 'error' });
    } finally {
      setSaveLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="adm-set-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '200px' }}>
        <div style={{ color: '#8b949e' }}>Loading trading hours...</div>
      </div>
    );
  }

  return (
    <div className="adm-set-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      
      <div className="adm-mw-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 className="adm-page-title" style={{ margin: 0 }}>Trading Hours</h2>
          <p style={{ margin: '4px 0 0', color: '#8b949e', fontSize: '13px' }}>Configure market open and close times for each segment.</p>
        </div>
        <button 
          className="adm-btn-primary" 
          onClick={handleSave} 
          disabled={saveLoading}
        >
          {saveLoading ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="adm-set-table-wrap">
        <table className="adm-set-table">
          <thead>
            <tr>
              <th>Segment</th>
              <th>Status</th>
              <th>Start Time</th>
              <th>End Time</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.id} style={{ opacity: s.isActive ? 1 : 0.6 }}>
                <td className="bold">{s.name}</td>
                <td>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '8px' }}>
                    <input 
                      type="checkbox" 
                      checked={s.isActive} 
                      onChange={(e) => handleUpdate(s.id, 'isActive', e.target.checked)}
                      style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '14px', color: s.isActive ? '#10b981' : '#f43f5e' }}>
                      {s.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </label>
                </td>
                <td>
                  <input 
                    type="time" 
                    className="adm-upd-input" 
                    value={s.startTime}
                    onChange={(e) => handleUpdate(s.id, 'startTime', e.target.value)}
                    disabled={!s.isActive}
                    style={{ width: '120px', padding: '6px 10px' }}
                  />
                </td>
                <td>
                  <input 
                    type="time" 
                    className="adm-upd-input" 
                    value={s.endTime}
                    onChange={(e) => handleUpdate(s.id, 'endTime', e.target.value)}
                    disabled={!s.isActive}
                    style={{ width: '120px', padding: '6px 10px' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

