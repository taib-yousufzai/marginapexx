'use client';
import React, { useState } from 'react';
import { apiCall, Toast, ToastState } from '../AdminUtils';

export default function SettingsBroadcaster() {
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState('all');
  const [validityHours, setValidityHours] = useState('24');
  
  const [toast, setToast] = useState<ToastState>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const handleBroadcast = async () => {
    if (!message.trim()) {
      setToast({ message: 'Please enter a message to broadcast', type: 'error' });
      return;
    }
    
    setSaveLoading(true);
    try {
      const { ok, data } = await apiCall('/api/admin/notifications', {
        method: 'POST',
        body: JSON.stringify({ 
          target: targetAudience === 'all' ? 'All Users' : targetAudience,
          title: 'Broadcast Announcement',
          message: message.trim()
        }),
      });
      
      if (!ok) {
        const err = data as { error?: string };
        setToast({ message: err.error || 'Failed to send broadcast', type: 'error' });
      } else {
        const res = data as { count: number };
        setToast({ message: `Successfully broadcast to ${res.count} users`, type: 'success' });
        setMessage('');
      }
    } catch (e) {
      setToast({ message: 'Network error sending broadcast', type: 'error' });
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="adm-set-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      
      <div className="adm-mw-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 className="adm-page-title" style={{ margin: 0 }}>Broadcaster</h2>
          <p style={{ margin: '4px 0 0', color: '#8b949e', fontSize: '13px' }}>Push announcements and alerts to users across the platform.</p>
        </div>
      </div>

      <div className="adm-card" style={{ maxWidth: 600, padding: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 24, color: '#e6edf3', fontSize: '16px', paddingBottom: 12, borderBottom: '1px solid #30363d' }}>New Broadcast Message</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="adm-upd-field">
            <label className="adm-upd-label">Message Content</label>
            <textarea 
              className="adm-upd-input" 
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Enter your announcement here... (e.g. System maintenance scheduled for 10 PM IST)"
              style={{ minHeight: 120, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="adm-upd-field">
              <label className="adm-upd-label">Target Audience</label>
              <select 
                className="adm-upd-input" 
                value={targetAudience}
                onChange={e => setTargetAudience(e.target.value)}
              >
                <option value="all">All Users</option>
                <option value="active">Active Users Only</option>
                <option value="brokers">Brokers & Sub-brokers</option>
              </select>
            </div>

            <div className="adm-upd-field">
              <label className="adm-upd-label">Validity (Hours)</label>
              <input 
                type="number" 
                className="adm-upd-input" 
                value={validityHours}
                onChange={e => setValidityHours(e.target.value)}
                placeholder="24"
                min="1"
              />
            </div>
          </div>
        </div>
        
        <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #30363d', display: 'flex', justifyContent: 'flex-end' }}>
          <button 
            className="adm-btn-primary" 
            onClick={handleBroadcast} 
            disabled={saveLoading}
            style={{ backgroundColor: '#3b82f6' }}
          >
            {saveLoading ? 'Sending...' : 'Send Broadcast'}
          </button>
        </div>
      </div>
      
      {/* TODO: Add a table below to show past broadcasts if needed */}
    </div>
  );
}
