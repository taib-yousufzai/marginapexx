'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState, SkeletonLine, UserListItem, ConfirmDialog } from './AdminUtils';

type UserRow = {
  id: string; fullName: string; role: string; active: boolean;
  ledgerBal: number; mAvailable: number; openPnl: number; m2m: number;
  weeklyPnl: number; alltimePnl: number; marginUsed: number; holdingMargin: number;
  broker: string; mobile: string; scheduled_delete_at: string | null;
};

function mapUserListItem(u: UserListItem): UserRow {
  return {
    id: u.id,
    fullName: u.full_name ?? u.email,
    role: u.role.toUpperCase(),
    active: u.active,
    ledgerBal: u.balance,
    mAvailable: u.balance,
    openPnl: 0,
    m2m: 0,
    weeklyPnl: 0,
    alltimePnl: 0,
    marginUsed: 0,
    holdingMargin: 0,
    broker: u.parent_id ?? '',
    mobile: u.phone ?? '',
    scheduled_delete_at: u.scheduled_delete_at,
  };
}

function DeletionBanner({ scheduledDeleteAt }: { scheduledDeleteAt: string }) {
  const dateStr = new Date(scheduledDeleteAt).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  return (
    <div className="adm-users-del-banner">
      <i className="fas fa-trash-alt adm-users-del-icon" />
      <span>This user is scheduled for deletion on {dateStr}</span>
    </div>
  );
}

export default function UsersPage({ selectedUser, onSelectUser, onNavigate }: {
  selectedUser: { id: string; role: string };
  onSelectUser: (u: { id: string; role: string }) => void;
  onNavigate: (page: string) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState('10');
  const [page, setPage] = useState(1);
  const [confirmDialog, setConfirmDialog] = useState<{ userId: string } | null>(null);
  const [deletedUsers, setDeletedUsers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    setUsersLoading(true);
    apiCall('/api/admin/users', { method: 'GET' }).then(({ ok, status, data }) => {
      if (ok) {
        setUsers((data as UserListItem[]).map(mapUserListItem));
      } else if (status === 401) {
        signOut();
        router.replace('/login');
      } else if (status === 403) {
        setToast({ message: 'Access Denied', type: 'error' });
      } else {
        setToast({ message: 'Server Error', type: 'error' });
      }
      setUsersLoading(false);
    });
  }, [router]);

  const handleDelete = () => {
    if (!confirmDialog) return;
    setLoading(true);
    apiCall(`/api/admin/users/${confirmDialog.userId}`, { method: 'DELETE' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        const { scheduled_at } = data as { scheduled_at: string };
        setDeletedUsers(prev => ({ ...prev, [confirmDialog.userId]: scheduled_at }));
        setToast({ message: 'User scheduled for deletion', type: 'success' });
        setConfirmDialog(null);
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      })
      .finally(() => setLoading(false));
  };

  const filtered = users.filter(u =>
    u.id.toLowerCase().includes(search.toLowerCase()) ||
    u.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const active = users.filter(u => u.active).length;
  const inactive = users.filter(u => !u.active).length;

  const rowsNum = Number(rows);
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsNum));
  const displayed = filtered.slice((page - 1) * rowsNum, page * rowsNum);

  const fmt = (n: number) => n === 0 ? '0' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="adm-users-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {confirmDialog && (
        <ConfirmDialog
          message={`Delete user ${confirmDialog.userId}? This will schedule deletion after 30 days.`}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDialog(null)}
          loading={loading}
        />
      )}

      <div className="adm-users-stats">
        <div className="adm-users-stat">
          <div className="adm-users-stat-label">ACTIVE</div>
          <div className="adm-users-stat-value pos">{active}</div>
        </div>
        <div className="adm-users-stat">
          <div className="adm-users-stat-label">INACTIVE</div>
          <div className="adm-users-stat-value neg">{inactive}</div>
        </div>
        <div className="adm-users-stat">
          <div className="adm-users-stat-label">TOTAL</div>
          <div className="adm-users-stat-value">{users.length}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <div className="adm-ord-search-wrap" style={{ flex: 1 }}>
          <i className="fas fa-search adm-ord-search-icon" />
          <input className="adm-ord-search" placeholder="Search users..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <button className="adm-btn-primary" style={{ padding: '12px 24px' }} onClick={() => onNavigate('create')}>
          <i className="fas fa-user-plus" style={{ marginRight: 8 }} />
          Create New User
        </button>
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

      <div className="adm-users-list">
        {usersLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div className="adm-users-card" key={i} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <SkeletonLine width="50%" height={14} />
                <SkeletonLine width={50} height={20} style={{ borderRadius: 10 }} />
              </div>
              <SkeletonLine width="80%" height={12} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {Array.from({ length: 8 }).map((_, j) => <SkeletonLine key={j} height={12} width="75%" />)}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {Array.from({ length: 4 }).map((_, j) => <SkeletonLine key={j} width={70} height={32} style={{ borderRadius: 6 }} />)}
              </div>
            </div>
          ))
        ) : displayed.map((u, i) => (
          <div className="adm-users-card" key={i}>
            <div className="adm-users-card-header">
              <span className="adm-users-fullname">{u.fullName} <span className="adm-users-role-tag">({u.role})</span></span>
              <span className={`adm-users-status ${u.active ? 'active' : 'inactive'}`}>{u.active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="adm-users-uid">{u.id}</div>
            <div className="adm-users-grid">
              <span className="adm-users-dl">Ledger Bal</span>
              <span className="adm-users-dv">{fmt(u.ledgerBal)}</span>
              <span className="adm-users-dl">M. Available</span>
              <span className={`adm-users-dv ${u.mAvailable > 0 ? 'warn' : ''}`}>{fmt(u.mAvailable)}</span>

              <span className="adm-users-dl">Open PnL</span>
              <span className="adm-users-dv">{fmt(u.openPnl)}</span>
              <span className="adm-users-dl">M2M</span>
              <span className="adm-users-dv">{fmt(u.m2m)}</span>

              <span className="adm-users-dl">Weekly PnL</span>
              <span className={`adm-users-dv ${u.weeklyPnl < 0 ? 'neg' : u.weeklyPnl > 0 ? 'pos' : ''}`}>{fmt(u.weeklyPnl)}</span>
              <span className="adm-users-dl">All-time PnL</span>
              <span className={`adm-users-dv ${u.alltimePnl < 0 ? 'neg' : u.alltimePnl > 0 ? 'pos' : ''}`}>{fmt(u.alltimePnl)}</span>

              <span className="adm-users-dl">Margin Used</span>
              <span className="adm-users-dv">{fmt(u.marginUsed)}</span>
              <span className="adm-users-dl">Holding Margin</span>
              <span className="adm-users-dv">{fmt(u.holdingMargin)}</span>

              <span className="adm-users-dl">Broker</span>
              <span className="adm-users-dv bold">{u.broker}</span>
              <span className="adm-users-dl">Mobile</span>
              <span className="adm-users-dv">{u.mobile}</span>
            </div>
            <div className="adm-users-actions">
              <button className="adm-users-btn pos-btn" onClick={() => { onSelectUser({ id: u.id, role: u.role }); onNavigate('position'); }}>Positions</button>
              <button className="adm-users-btn ledger-btn" onClick={() => { onSelectUser({ id: u.id, role: u.role }); onNavigate('actledger'); }}>Ledger</button>
              <button className="adm-users-btn update-btn" onClick={() => { onSelectUser({ id: u.id, role: u.role }); onNavigate('update'); }}>Update</button>
              <button className="adm-users-btn delete-btn" onClick={() => setConfirmDialog({ userId: u.id })}>Delete</button>
            </div>
            {(deletedUsers[u.id] || u.scheduled_delete_at) && (
              <DeletionBanner scheduledDeleteAt={deletedUsers[u.id] || u.scheduled_delete_at!} />
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
    </div>
  );
}
