'use client';
import React, { useState } from 'react';
import { apiCall, Toast, ToastState } from '../AdminUtils';

export default function UpdateNotifications({ selectedUser }: { selectedUser?: { id: string } }) {
  const uid = selectedUser?.id || '';
  const [target, setTarget] = useState('Specific User');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const handleSend = async () => {
    if (!title || !message) {
      setToast({ message: 'Title and message are required', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const { ok, data } = await apiCall(`/api/admin/notifications`, {
        method: 'POST',
        body: JSON.stringify({ target, userId: uid, title, message }),
      });
      
      if (!ok) {
        const err = data as { error?: string };
        setToast({ message: err.error || 'Failed to send notification', type: 'error' });
      } else {
        const res = data as { count: number };
        setToast({ message: `Notification sent to ${res.count} users`, type: 'success' });
        setTitle('');
        setMessage('');
      }
    } catch (e) {
      setToast({ message: 'Network error sending notification', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adm-upd-root" style={{ padding: '0 0 40px 0' }}>
      <div className="adm-upd-section-title">Send Notification</div>
      <p style={{ color: '#8b949e', fontSize: '14px', marginBottom: 20 }}>
        Push an in-app alert or notification to users. This will appear in their dashboard.
      </p>

      <div className="adm-upd-card">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Target Audience</label>
          <select className="adm-upd-input adm-upd-select" value={target} onChange={e => setTarget(e.target.value)}>
            {uid && <option value="Specific User">This User Only ({uid})</option>}
            <option value="Broker Users">All Users under Broker</option>
            <option value="All Users">All Platform Users</option>
          </select>
        </div>

        <div className="adm-upd-field" style={{ marginTop: 16 }}>
          <label className="adm-upd-label">Notification Title</label>
          <input 
            className="adm-upd-input" 
            placeholder="e.g. Margin Call Alert"
            value={title} 
            onChange={e => setTitle(e.target.value)} 
          />
        </div>

        <div className="adm-upd-field" style={{ marginTop: 16 }}>
          <label className="adm-upd-label">Message Body</label>
          <textarea 
            className="adm-upd-input" 
            style={{ minHeight: '120px', resize: 'vertical' }}
            placeholder="Enter the message content here..."
            value={message} 
            onChange={e => setMessage(e.target.value)} 
          />
        </div>
      </div>

      <button 
        className="adm-btn-primary" 
        style={{ width: '100%', padding: '14px', fontSize: '0.9rem', borderRadius: 10, marginTop: 20 }} 
        disabled={loading} 
        onClick={handleSend}
      >
        {loading ? 'Sending…' : 'Send Notification'}
      </button>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
