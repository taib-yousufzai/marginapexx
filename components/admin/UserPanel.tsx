'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState, SkeletonLine } from './AdminUtils';

export type UserListItem = {
  id: string; email: string; full_name: string | null; phone: string | null;
  role: string; parent_id: string | null; segments: string[] | null;
  active: boolean; read_only: boolean; demo_user: boolean;
  balance: number; created_at: string; scheduled_delete_at: string | null;
};

const PAGE_SIZE = 8;

export default function UserPanel({ open, onClose, onCreateUser, selectedUser, onSelectUser }: {
  open: boolean;
  onClose: () => void;
  onCreateUser: () => void;
  selectedUser: { id: string; role: string };
  onSelectUser: (u: UserListItem) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    setTimeout(() => setUsersLoading(true), 0);
    apiCall('/api/admin/users', { method: 'GET' }).then(({ ok, status, data }) => {
      if (ok) {
        const items = (data as UserListItem[]).map(u => ({
          ...u,
          role: u.role.toUpperCase(),
        }));
        setUsers(items);
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

  const filtered = users.filter(u => u.id.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      {open && <div className="adm-overlay" onClick={onClose} />}
      <div className={`adm-user-panel ${open ? 'open' : ''}`}>
        <div className="adm-up-header">
          <button className="adm-up-close" onClick={onClose}>✕</button>
        </div>

        <div className="adm-up-search-wrap">
          <i className="fas fa-search adm-up-search-icon" />
          <input
            className="adm-up-search"
            placeholder="Search by name"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        <div className="adm-up-create-row">
          <span className="adm-up-create-label">Create New User</span>
          <button className="adm-up-add-link" onClick={onCreateUser}>Add</button>
        </div>

        <div className="adm-up-list">
          {usersLoading
            ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="adm-up-row" style={{ pointerEvents: 'none' }}>
                <SkeletonLine width="70%" height={13} />
                <SkeletonLine width="30%" height={13} />
              </div>
            ))
            : paged.map((u, i) => {
              const isSelected = selectedUser.id === u.id;
              return (
                <div
                  key={i}
                  className={`adm-up-row ${isSelected ? 'selected' : ''}`}
                  onClick={() => onSelectUser(u)}
                >
                  <span className="adm-up-id">{u.id}</span>
                  <span className={`adm-up-role ${u.role === 'SUB_BROKER' ? 'sub' : ''} ${isSelected ? 'sel' : ''}`}>
                    {u.role}
                  </span>
                </div>
              );
            })
          }
        </div>

        <div className="adm-up-pagination">
          <span className="adm-up-page-info">Page {page} of {totalPages}</span>
          <div className="adm-up-page-btns">
            <button className="adm-up-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            <button className="adm-up-page-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </div>
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
