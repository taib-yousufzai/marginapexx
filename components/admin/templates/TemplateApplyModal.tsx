'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { apiCall, Toast, ToastState, UserListItem } from '../AdminUtils';
import { AccountTemplate } from '../TemplatesPage';

interface TemplateApplyModalProps {
  template: AccountTemplate;
  onClose: () => void;
  onApplied: () => void;
  isDemoMode: boolean;
}

export default function TemplateApplyModal({ template, onClose, onApplied, isDemoMode }: TemplateApplyModalProps) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    apiCall(`/api/admin/users?demo=${isDemoMode}`, { method: 'GET' }).then(res => {
      setLoading(false);
      if (res.ok) {
        // Only show regular users (not admin/super_admin/broker)
        const all = res.data as UserListItem[];
        setUsers(all.filter(u => u.role === 'user'));
      } else {
        setToast({ message: 'Failed to load users', type: 'error' });
      }
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      (u.full_name ?? '').toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.client_id ?? '').toLowerCase().includes(q)
    );
  }, [users, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every(u => selectedIds.has(u.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(u => next.delete(u.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(u => next.add(u.id));
        return next;
      });
    }
  };

  const toggleUser = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    if (selectedIds.size === 0) {
      setToast({ message: 'Select at least one user', type: 'error' });
      return;
    }

    setApplying(true);
    const res = await apiCall(`/api/admin/templates/${template.id}/apply`, {
      method: 'POST',
      body: JSON.stringify({ user_ids: Array.from(selectedIds) }),
    });
    setApplying(false);

    if (res.ok) {
      const data = res.data as { applied_to: number };
      setToast({ message: `Template applied to ${data.applied_to} user(s)`, type: 'success' });
      setTimeout(onApplied, 900);
    } else {
      const err = res.data as { error?: string };
      setToast({ message: err.error ?? 'Failed to apply template', type: 'error' });
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#161b22', border: '1px solid #30363d', borderRadius: 12,
          width: '90%', maxWidth: 560, maxHeight: '85vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <Toast toast={toast} onDismiss={() => setToast(null)} />

        {/* Modal header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #30363d', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ color: '#e6edf3', fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                Apply Template
              </h3>
              <p style={{ color: '#8b949e', fontSize: '12px', margin: '4px 0 0' }}>
                {template.name} — select users to apply this template to
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'transparent', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '2px 6px' }}
            >✕</button>
          </div>

          {/* Search */}
          <input
            className="adm-upd-input"
            placeholder="Search users by name, email, or ID…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ marginTop: 12, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        {/* Select All row */}
        <div
          style={{
            padding: '10px 20px', borderBottom: '1px solid #21262d',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            background: '#0d1117',
          }}
        >
          <Checkbox checked={allFilteredSelected} onChange={toggleSelectAll} />
          <span style={{ color: '#c9d1d9', fontSize: '13px', fontWeight: 600 }}>
            Select All ({filtered.length} {search ? 'matching' : 'users'})
          </span>
          {selectedIds.size > 0 && (
            <span style={{ color: '#8b949e', fontSize: '12px', marginLeft: 'auto' }}>
              {selectedIds.size} selected
            </span>
          )}
        </div>

        {/* User list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ color: '#8b949e', padding: 20 }}>Loading users…</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: '#8b949e', padding: 20, textAlign: 'center' }}>
              {search ? 'No users match your search' : 'No regular users found'}
            </div>
          ) : (
            filtered.map(user => (
              <UserRow
                key={user.id}
                user={user}
                checked={selectedIds.has(user.id)}
                onChange={() => toggleUser(user.id)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 20px', borderTop: '1px solid #30363d',
          display: 'flex', justifyContent: 'flex-end', gap: 10, flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            style={{
              background: '#21262d', border: '1px solid #30363d', color: '#c9d1d9',
              padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: '13px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={applying || selectedIds.size === 0}
            className="adm-btn-primary"
            style={{
              padding: '8px 20px', fontSize: '13px', borderRadius: 6,
              opacity: (applying || selectedIds.size === 0) ? 0.6 : 1,
            }}
          >
            {applying ? 'Applying…' : `Apply to ${selectedIds.size} User${selectedIds.size !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserRow({
  user,
  checked,
  onChange,
}: {
  user: UserListItem;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div
      onClick={onChange}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px', cursor: 'pointer',
        borderBottom: '1px solid #21262d',
        background: checked ? 'rgba(20,184,166,0.06)' : 'transparent',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => { if (!checked) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = checked ? 'rgba(20,184,166,0.06)' : 'transparent'; }}
    >
      <Checkbox checked={checked} onChange={onChange} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#e6edf3', fontSize: '13px', fontWeight: 600 }}>
          {user.full_name ?? user.email}
        </div>
        <div style={{ color: '#8b949e', fontSize: '11px', marginTop: 1 }}>
          {user.client_id && <span style={{ color: '#6e7681' }}>{user.client_id.toUpperCase()} · </span>}
          {user.email}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
        <span style={{
          fontSize: '10px', padding: '2px 6px', borderRadius: 10,
          background: user.active ? '#14532d' : '#7c2d12',
          color: user.active ? '#86efac' : '#fca5a5',
        }}>
          {user.active ? 'Active' : 'Inactive'}
        </span>
      </div>
    </div>
  );
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      onClick={e => { e.stopPropagation(); onChange(); }}
      style={{
        width: 16, height: 16, borderRadius: 4, border: `2px solid ${checked ? '#14b8a6' : '#30363d'}`,
        background: checked ? '#14b8a6' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
      }}
    >
      {checked && <span style={{ color: '#fff', fontSize: '10px', fontWeight: 700, lineHeight: 1 }}>✓</span>}
    </div>
  );
}
