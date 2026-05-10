'use client';
import React, { useState, useEffect } from 'react';
import { getSession } from '@/lib/auth';

interface Notification {
  id: string;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationDrawer({ isOpen, onClose }: NotificationDrawerProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) return;
      const res = await fetch('/api/notifications?limit=20', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`expiry-half-drawer-overlay ${isOpen ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="expiry-half-sheet">
        <div className="expiry-sheet-header">
          <h3><i className="fas fa-bell"></i> Notifications</h3>
          <div className="expiry-sheet-close" onClick={onClose}><i className="fas fa-times"></i></div>
        </div>
        <div className="notif-list" style={{ padding: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
          {loading ? (
            <div className="loading" style={{ textAlign: 'center', padding: '20px' }}><i className="fas fa-spinner fa-spin"></i></div>
          ) : notifications.length === 0 ? (
            <div className="no-data" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>No notifications</div>
          ) : (
            notifications.map(n => (
              <div key={n.id} className="notif-item" style={{ 
                padding: '12px', 
                borderBottom: '1px solid var(--border-light)',
                background: n.is_read ? 'transparent' : 'var(--card-alt-bg)',
                borderRadius: '8px',
                marginBottom: '8px'
              }}>
                <div className="notif-title" style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '4px' }}>{n.title}</div>
                <div className="notif-msg" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{n.message}</div>
                <div className="notif-time" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px' }}>
                  {new Date(n.created_at).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
