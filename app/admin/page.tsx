'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, getRole, signOut } from '@/lib/auth';
import { supabase } from '@/lib/supabaseClient';
import KiteConnectButton from '@/components/KiteConnectButton';
import { toCsvPayRequests } from '@/lib/csvExport';
import type { PayRequest } from '@/lib/csvExport';
import '../admin-layout.css';

// ─── API helper ───────────────────────────────────────────────────────────────
async function apiCall(
  path: string,
  options: RequestInit,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? '';
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// ─── Toast ────────────────────────────────────────────────────────────────────
type ToastState = { message: string; type: 'success' | 'error' } | null;

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [toast, onDismiss]);

  if (!toast) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        background: toast.type === 'success' ? '#1a7f4b' : '#b91c1c',
        color: '#fff',
        padding: '12px 20px',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        minWidth: 240,
        maxWidth: 400,
      }}
    >
      <span style={{ flex: 1, fontSize: '0.875rem' }}>{toast.message}</span>
      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
      >
        ✕
      </button>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function SkeletonLine({ width = '100%', height = 14, style = {} }: { width?: string | number; height?: number; style?: React.CSSProperties }) {
  return (
    <div style={{
      width,
      height,
      borderRadius: 6,
      background: 'linear-gradient(90deg, #21262d 25%, #30363d 50%, #21262d 75%)',
      backgroundSize: '200% 100%',
      animation: 'adm-skeleton-shimmer 1.4s infinite',
      ...style,
    }} />
  );
}

function SkeletonCard({ rows = 3, style = {} }: { rows?: number; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: '16px', display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonLine key={i} width={i === 0 ? '60%' : i % 2 === 0 ? '80%' : '90%'} />
      ))}
    </div>
  );
}

function SkeletonTable({ cols = 4, rows = 5 }: { cols?: number; rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* header */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, padding: '8px 0' }}>
        {Array.from({ length: cols }).map((_, i) => <SkeletonLine key={i} height={12} width="70%" />)}
      </div>
      {/* rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, padding: '10px 12px', background: '#161b22', borderRadius: 8 }}>
          {Array.from({ length: cols }).map((_, c) => <SkeletonLine key={c} height={13} width={c === 0 ? '85%' : '60%'} />)}
        </div>
      ))}
    </div>
  );
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────
function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  loading,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: '#161b22',
          border: '1px solid #30363d',
          borderRadius: 12,
          padding: '24px',
          maxWidth: 360,
          width: '90%',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ color: '#e6edf3', fontSize: '0.95rem', marginBottom: 20 }}>{message}</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="adm-sheet-cancel" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className="adm-btn-primary" onClick={onConfirm} disabled={loading}>
            {loading ? 'Deleting…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DeletionBanner ───────────────────────────────────────────────────────────
function DeletionBanner({ scheduledDeleteAt }: { scheduledDeleteAt: string }) {
  const hoursRemaining = Math.max(
    0,
    Math.round((new Date(scheduledDeleteAt).getTime() - Date.now()) / (1000 * 60 * 60)),
  );
  return (
    <div
      style={{
        background: '#7c2d12',
        color: '#fca5a5',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: '0.8rem',
        marginTop: 8,
      }}
    >
      Scheduled for deletion in {hoursRemaining} hours — log in to cancel
    </div>
  );
}

const navItems = [
  { key: 'telegram', label: 'TELEGRAM' },
  { key: 'settings', label: 'SETTINGS' },
  { key: 'marketwatch', label: 'MARKETWATCH' },
  { key: 'dashboard', label: 'DASHBOARD' },
  { key: 'orders', label: 'ORDERS' },
  { key: 'position', label: 'POSITION' },
  { key: 'update', label: 'UPDATE' },
  { key: 'users', label: 'USERS' },
  { key: 'actledger', label: 'ACT LEDGER' },
  { key: 'accounts', label: 'ACCOUNTS' },
  { key: 'payinout', label: 'PAYIN-OUT' },
  { key: 'logout', label: 'LOGOUT' },
];

export default function AdminPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userPanelOpen, setUserPanelOpen] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [activePage, setActivePage] = useState('marketwatch');
  const [selectedUser, setSelectedUser] = useState<{ id: string; role: string }>({ id: '', role: '' });
  const [userRole, setUserRole] = useState<string>('');

  // Route guard — Supabase session + admin role check
  useEffect(() => {
    getSession().then((session) => {
      if (!session) {
        router.replace('/login');
        return;
      }
      const role = getRole(session.user);
      if (role !== 'admin' && role !== 'super_admin') {
        router.replace('/');
        return;
      }
      setUserRole(role);
      setIsChecking(false);
    });
  }, [router]);

  useEffect(() => {
    const savedPage = sessionStorage.getItem('adminActivePage');
    if (savedPage) setActivePage(savedPage);
  }, []);

  if (isChecking) return null;

  // Logout — call Supabase signOut which redirects to /login
  const handleLogout = () => {
    sessionStorage.removeItem('adminActivePage');
    signOut();
  };

  const handleNav = (key: string) => {
    if (key === 'logout') { handleLogout(); return; }
    setActivePage(key);
    sessionStorage.setItem('adminActivePage', key);
    setDrawerOpen(false);
  };

  const handleUserCreated = (id: string, role: string) => {
    setCreatingUser(false);
    setUserPanelOpen(true);
  };

  // Full-screen create user form
  if (creatingUser) {
    return (
      <div className="adm-root">
        <div className="adm-topbar">
          <button className="adm-hamburger" onClick={() => { }}>
            <span /><span /><span />
          </button>
        </div>
        <div className="adm-content">
          <CreateUserForm
            onBack={() => { setCreatingUser(false); setUserPanelOpen(true); }}
            onCreated={handleUserCreated}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="adm-root">
      {drawerOpen && (
        <div className="adm-overlay" onClick={() => setDrawerOpen(false)} />
      )}
      <div className={`adm-drawer ${drawerOpen ? 'open' : ''}`}>
        <button className="adm-drawer-close" onClick={() => setDrawerOpen(false)}>✕</button>
        <nav className="adm-nav">
          {navItems.map(item => (
            <div
              key={item.key}
              className={`adm-nav-item ${activePage === item.key ? 'active' : ''}`}
              onClick={() => handleNav(item.key)}
            >
              {item.label}
            </div>
          ))}
          {userRole === 'super_admin' && (
            <div
              key="paymentaccounts"
              className={`adm-nav-item ${activePage === 'paymentaccounts' ? 'active' : ''}`}
              onClick={() => handleNav('paymentaccounts')}
            >
              PAYMENT ACCOUNTS
            </div>
          )}
        </nav>
        {/* Kite connect — pinned to bottom of sidebar */}
        <div style={{ padding: '16px', borderTop: '1px solid #21262d', marginTop: 'auto' }}>
          <KiteConnectButton />
        </div>
      </div>

      {/* User Panel */}
      <UserPanel
        open={userPanelOpen}
        onClose={() => setUserPanelOpen(false)}
        onCreateUser={() => { setUserPanelOpen(false); setCreatingUser(true); }}
        selectedUser={selectedUser}
        onSelectUser={(u) => { setSelectedUser(u); setUserPanelOpen(false); }}
      />

      {/* Main area: topbar + content */}
      <div className="adm-main-area">
        {/* Top Bar */}
        <div className="adm-topbar">
          <button className="adm-hamburger" onClick={() => setDrawerOpen(true)}>
            <span /><span /><span />
          </button>
          <KiteConnectButton />
          {(activePage === 'settings' || activePage === 'dashboard' || activePage === 'orders' || activePage === 'position' || activePage === 'update') && (
            <button className="adm-hamburger-right" onClick={() => setUserPanelOpen(true)}>
              <span /><span /><span />
            </button>
          )}
        </div>

        {/* Page Content */}
        <div className="adm-content">
          <PageContent
            activePage={activePage}
            selectedUser={selectedUser}
            onSelectUser={(u) => { setSelectedUser(u); setUserPanelOpen(false); }}
            onOpenUserPanel={() => setUserPanelOpen(true)}
            onNavigate={(page) => { setActivePage(page); }}
          />
        </div>
      </div>{/* end adm-main-area */}
    </div>
  );
}

// Forward declarations to fix Turbopack hoisting
function AccountsPage() { return <AccountsPageImpl />; }
function PayinOutPage() { return <PayinOutPageImpl />; }
function PaymentAccountsPage() { return <PaymentAccountsPageImpl />; }

function PageContent({ activePage, selectedUser, onSelectUser, onOpenUserPanel, onNavigate }: {
  activePage: string;
  selectedUser: { id: string; role: string };
  onSelectUser: (u: { id: string; role: string }) => void;
  onOpenUserPanel: () => void;
  onNavigate: (page: string) => void;
}) {
  // Render all pages simultaneously, show/hide with CSS.
  // This keeps components mounted so their data stays cached — no reload on tab switch.
  const show = (key: string) => ({ display: activePage === key ? undefined : 'none' } as React.CSSProperties);

  return (
    <>
      <div style={show('telegram')}><TelegramPage /></div>
      <div style={show('settings')}><SettingsPage /></div>
      <div style={show('marketwatch')}><MarketWatchPage /></div>
      <div style={show('dashboard')}><DashboardPage selectedUser={selectedUser} onOpenUserPanel={onOpenUserPanel} /></div>
      <div style={show('orders')}><OrdersPage selectedUser={selectedUser} /></div>
      <div style={show('position')}><PositionPage selectedUser={selectedUser} /></div>
      <div style={show('update')}><UpdatePage selectedUser={selectedUser} /></div>
      <div style={show('users')}><UsersPage selectedUser={selectedUser} onSelectUser={onSelectUser} onNavigate={onNavigate} /></div>
      <div style={show('create')}>
        <CreateUserForm
          onBack={() => onNavigate('users')}
          onCreated={(id, role) => {
            onNavigate('users');
            onSelectUser({ id, role });
          }}
        />
      </div>
      <div style={show('actledger')}><ActLedgerPage /></div>
      <div style={show('accounts')}><AccountsPage /></div>
      <div style={show('payinout')}><PayinOutPage /></div>
      <div style={show('paymentaccounts')}><PaymentAccountsPage /></div>
    </>
  );
}

// ─── Script settings (loaded from DB) ────────────────────────────────────────
type Script = { id: string; symbol: string; lotSize: number };

function SettingsPage() {
  // Validates: Requirements 5.9–5.10, 13.4, 14.1–14.10
  const [scripts, setScripts] = useState<Script[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [formSymbol, setFormSymbol] = useState('');
  const [formLot, setFormLot] = useState('');
  const [toast, setToast] = useState<ToastState>(null);

  // Fetch scripts from DB on mount
  const fetchScripts = () => {
    apiCall('/api/admin/settings/scripts', { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        const rows = data as { id: string; symbol: string; lot_size: number }[];
        setScripts(rows.map(r => ({ id: r.id, symbol: r.symbol, lotSize: r.lot_size })));
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
  };

  useEffect(() => {
    fetchScripts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = () => {
    setEditIdx(null);
    setFormSymbol('');
    setFormLot('0');
    setShowModal(true);
  };

  const openEdit = (i: number) => {
    setEditIdx(i);
    setFormSymbol(scripts[i].symbol);
    setFormLot(String(scripts[i].lotSize));
    setShowModal(true);
  };

  const handleSave = () => {
    if (!formSymbol.trim() || !formLot.trim()) return;
    const symbol = formSymbol.trim().toUpperCase();
    const lot_size = Number(formLot);
    if (editIdx !== null) {
      // Edit: PATCH existing entry
      const id = scripts[editIdx].id;
      apiCall(`/api/admin/settings/scripts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ symbol, lot_size }),
      }).then(({ ok, status }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        fetchScripts();
      }).catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
    } else {
      // Add: POST new entry
      apiCall('/api/admin/settings/scripts', {
        method: 'POST',
        body: JSON.stringify({ symbol, lot_size }),
      }).then(({ ok, status }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        fetchScripts();
      }).catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
    }
    setShowModal(false);
  };

  const handleDelete = (i: number) => {
    const id = scripts[i].id;
    apiCall(`/api/admin/settings/scripts/${id}`, { method: 'DELETE' })
      .then(({ ok, status }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        fetchScripts();
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
  };

  const handleClose = () => {
    setShowModal(false);
    setEditIdx(null);
  };

  return (
    <div className="adm-page">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {/* breadcrumb-style tab */}
      <div className="adm-settings-tab">Script Lot Settings</div>

      <div className="adm-settings-header">
        <h2 className="adm-page-title" style={{ margin: 0 }}>Script Lot Settings</h2>
        <button className="adm-btn-primary" onClick={openAdd}>+ Add Setting</button>
      </div>

      <div className="adm-script-list">
        {scripts.map((s, i) => (
          <div className="adm-script-card" key={i}>
            <div className="adm-script-top">
              <span className="adm-script-num">#{i + 1}</span>
              <div className="adm-script-actions">
                <button className="adm-btn-edit" onClick={() => openEdit(i)}>Edit</button>
                <button className="adm-btn-del" onClick={() => handleDelete(i)}>Delete</button>
              </div>
            </div>
            <div className="adm-script-symbol">{s.symbol}</div>
            <div className="adm-script-lot-box">
              <div className="adm-script-lot-label">Lot Size</div>
              <div className="adm-script-lot-value">{s.lotSize.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Centered Modal — rendered at page level so it's not clipped */}
      {showModal && (
        <div className="adm-modal-overlay" onClick={handleClose}>
          <div className="adm-modal" onClick={e => e.stopPropagation()}>
            <div className="adm-modal-header">
              <span className="adm-modal-title">{editIdx !== null ? 'Edit Setting' : 'Add New Setting'}</span>
              <button className="adm-modal-close" onClick={handleClose}>✕</button>
            </div>

            <div className="adm-sheet-field">
              <label className="adm-sheet-label">Search Script</label>
              <input
                className="adm-sheet-input"
                placeholder="Type to search scripts..."
                value={formSymbol}
                onChange={e => setFormSymbol(e.target.value)}
              />
              {formSymbol.length === 1 && (
                <div className="adm-modal-hint">Type at least 2 characters to search</div>
              )}
            </div>

            {/* Selected Script — only shown in edit mode */}
            {editIdx !== null && (
              <div className="adm-sheet-field">
                <label className="adm-sheet-label">Selected Script</label>
                <div className="adm-modal-selected">
                  <span className="adm-modal-selected-text">{formSymbol || '—'}</span>
                  <button className="adm-modal-selected-clear" onClick={() => setFormSymbol('')}>✕</button>
                </div>
              </div>
            )}

            <div className="adm-sheet-field">
              <label className="adm-sheet-label">Lot Size</label>
              <input
                className="adm-sheet-input"
                type="number"
                value={formLot}
                onChange={e => setFormLot(e.target.value)}
              />
            </div>

            <div className="adm-modal-actions">
              <button className="adm-sheet-cancel" onClick={handleClose}>Cancel</button>
              <button className="adm-btn-primary" onClick={handleSave}>
                {editIdx !== null ? 'Update Setting' : 'Add Setting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dashboard Page ───────────────────────────────────────────────────────────

type DashboardMetrics = {
  ledger_balance: number; mark_to_market: number;
  net: number; total_deposits: number; total_withdrawals: number;
  avg_deposit: number; avg_withdrawal: number;
  avg_profit: number; avg_loss: number;
  profitable_clients: number; loss_making_clients: number;
  buy_position_count: number; sell_position_count: number;
  registered: number; added_funds: number; conversion: string;
};

function metricsToStore(m: DashboardMetrics | null): Record<string, string> {
  if (!m) return {};
  const ratio = m.buy_position_count + m.sell_position_count > 0
    ? `${Math.round((m.buy_position_count / (m.buy_position_count + m.sell_position_count)) * 100)}%`
    : '0%';
  return {
    'LEDGER BALANCE': String(m.ledger_balance),
    'MARK-TO-MARKET': String(m.mark_to_market),
    'NET': String(m.net),
    'TOTAL DEPOSITS': String(m.total_deposits),
    'TOTAL WITHDRAWALS': String(m.total_withdrawals),
    'AVG DEPOSIT': String(m.avg_deposit),
    'AVG WITHDRAWAL': String(m.avg_withdrawal),
    'REGISTERED': String(m.registered),
    'ADDED FUNDS': String(m.added_funds),
    'CONVERSION': m.conversion,
    'AVG PROFIT': m.avg_profit !== 0 ? String(m.avg_profit) : '—',
    'AVG LOSS': m.avg_loss !== 0 ? String(m.avg_loss) : '—',
    'PROFITABLE CLIENTS': m.profitable_clients !== 0 ? String(m.profitable_clients) : '—',
    'LOSS-MAKING CLIENTS': m.loss_making_clients !== 0 ? String(m.loss_making_clients) : '—',
    'BUY POSITION': m.buy_position_count !== 0 ? String(m.buy_position_count) : '—',
    'SELL POSITION': m.sell_position_count !== 0 ? String(m.sell_position_count) : '—',
    'RATIO': ratio,
  };
}

function DashBoardSection({ title, fields, metrics, onFetch, loading }: {
  title: string;
  fields: { label: string }[];
  metrics: Record<string, string>;
  onFetch?: () => void;
  loading?: boolean;
}) {
  const hasData = Object.keys(metrics).length > 0;

  return (
    <div className="adm-db-section">
      <div className="adm-db-section-header">
        <span className="adm-db-section-title">{title}</span>
        <button
          className="adm-btn-primary adm-db-fetch-btn"
          onClick={onFetch}
          disabled={loading}
        >
          {loading ? <i className="fas fa-spinner fa-spin" /> : 'Fetch'}
        </button>
      </div>
      <div className="adm-db-grid">
        {fields.map((f, i) => {
          const raw = hasData ? (metrics[f.label] ?? '—') : '—';
          const num = raw.replace(/,/g, '');
          const isNeg = num.startsWith('-') && raw !== '—';
          const isPos = !isNeg && raw !== '—' && raw !== '0' && !num.startsWith('—');
          // deposits/totals shown in green, withdrawals in red
          const greenLabels = ['TOTAL DEPOSITS', 'NET', 'ADDED FUNDS', 'AVG DEPOSIT', 'REGISTERED', 'CONVERSION', 'BUY POSITION', 'AVG PROFIT', 'PROFITABLE CLIENTS'];
          const redLabels = ['TOTAL WITHDRAWALS', 'AVG WITHDRAWAL', 'AVG LOSS', 'LOSS-MAKING CLIENTS', 'SELL POSITION'];
          const forceGreen = hasData && raw !== '—' && raw !== '0' && greenLabels.includes(f.label);
          const forceRed = hasData && (isNeg || (raw !== '—' && redLabels.includes(f.label)));
          return (
            <div className="adm-db-cell" key={i}>
              <div className="adm-db-cell-label">{f.label}</div>
              <div className={`adm-db-cell-value ${forceRed ? 'neg' : forceGreen ? 'pos' : ''}`}>{raw}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DashboardPage({ selectedUser, onOpenUserPanel }: {
  selectedUser: { id: string; role: string };
  onOpenUserPanel: () => void;
}) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const uid = selectedUser.id;

  const fetchMetrics = useCallback((manual = false) => {
    if (!uid) {
      if (manual) {
        setToast({ message: 'Please select a user from the sidebar first', type: 'error' });
        onOpenUserPanel();
      }
      return;
    }
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const query = params.toString() ? `?${params.toString()}` : '';
    apiCall(`/api/admin/users/${uid}/dashboard${query}`, { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        setMetrics(data as DashboardMetrics);
        if (manual) setToast({ message: 'Dashboard updated successfully', type: 'success' });
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      })
      .finally(() => setLoading(false));
  }, [uid, dateFrom, dateTo]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (!uid) {
    return (
      <div className="adm-db-root">
        <Toast toast={toast} onDismiss={() => setToast(null)} />
        <div className="adm-db-empty-state">
          <div className="adm-db-empty-icon">
            <i className="fas fa-user-clock" />
          </div>
          <h2 className="adm-db-empty-title">No User Selected</h2>
          <p className="adm-db-empty-text">
            Select a user from the USERS panel to view their detailed performance metrics, balance info, and profit/loss data.
          </p>
          <button className="adm-btn-primary" onClick={onOpenUserPanel} style={{ padding: '12px 32px', fontSize: '1rem' }}>
            Select User Now
          </button>
        </div>
      </div>
    );
  }

  const metricsStore = metricsToStore(metrics);

  return (
    <div className="adm-db-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {/* User + date filter */}
      <div className="adm-db-top-card">
        <div className="adm-db-username">
          <i className="fas fa-user-circle" style={{ marginRight: 8, opacity: 0.7 }} />
          {selectedUser.id}
          <span className="adm-db-role-badge">{selectedUser.role}</span>
        </div>
        <div className="adm-db-filter-row">
          <span className="adm-db-filter-label">Filter:</span>
          <div className="adm-db-date-group">
            <input type="date" className="adm-db-date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span className="adm-db-filter-dash">–</span>
            <input type="date" className="adm-db-date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
      </div>

      <DashBoardSection key={uid + 'bal'} metrics={metricsStore} title="BALANCE INFO" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
        { label: 'LEDGER BALANCE' },
        { label: 'MARK-TO-MARKET' },
      ]} />

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} rows={4} />
          ))}
        </div>
      ) : (<>
        <DashBoardSection key={uid + 'dep'} metrics={metricsStore} title="DEPOSITS & WITHDRAWALS" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'NET' },
          { label: 'TOTAL DEPOSITS' },
          { label: 'TOTAL WITHDRAWALS' },
          { label: 'AVG DEPOSIT' },
          { label: 'AVG WITHDRAWAL' },
        ]} />

        <DashBoardSection key={uid + 'reg'} metrics={metricsStore} title="CLIENT REGISTRATION" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'REGISTERED' },
          { label: 'ADDED FUNDS' },
          { label: 'CONVERSION' },
        ]} />

        <DashBoardSection key={uid + 'pnl'} metrics={metricsStore} title="CLIENT PROFIT & LOSS" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'AVG PROFIT' },
          { label: 'AVG LOSS' },
          { label: 'PROFITABLE CLIENTS' },
          { label: 'LOSS-MAKING CLIENTS' },
        ]} />

        <DashBoardSection key={uid + 'pos'} metrics={metricsStore} title="POSITION DETAILS" onFetch={() => fetchMetrics(true)} loading={loading} fields={[
          { label: 'BUY POSITION' },
          { label: 'SELL POSITION' },
          { label: 'RATIO' },
        ]} />
      </>)}

      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── Instrument data per tab ─────────────────────────────────────────────────
const TAB_INSTRUMENTS: Record<string, string[]> = {
  'INDEX-FUT': ['NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY', 'BANKEX', 'NIFTYNXT50'],
  'INDEX-OPT': ['NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY', 'BANKEX'],
  'STOCK-FUT': ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'WIPRO', 'AXISBANK', 'LT', 'BAJFINANCE', 'MARUTI', 'TATAMOTORS', 'ADANIENT', 'ONGC', 'NTPC', 'POWERGRID', 'COALINDIA', 'BPCL', 'IOC', 'HINDUNILVR'],
  'STOCK-OPT': ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'WIPRO', 'AXISBANK', 'LT', 'BAJFINANCE', 'MARUTI', 'TATAMOTORS', 'ADANIENT', 'ONGC', 'NTPC'],
  'NSE-EQ': ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'WIPRO', 'AXISBANK', 'LT', 'BAJFINANCE', 'MARUTI', 'TATAMOTORS', 'ADANIENT', 'ONGC', 'NTPC', 'POWERGRID', 'COALINDIA', 'BPCL', 'IOC', 'HINDUNILVR', 'NESTLEIND', 'BRITANNIA', 'DABUR', 'MARICO', 'GODREJCP'],
  'MCX-FUT': ['GOLD', 'GOLDMINI', 'SILVER', 'SILVERMINI', 'CRUDEOIL', 'CRUDEOILM', 'NATURALGAS', 'NATURALGASM', 'COPPER', 'ZINC', 'LEAD', 'ALUMINIUM', 'NICKEL'],
  'MCX-OPT': ['GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS', 'COPPER'],
  'COMEX': ['XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD', 'HGUSD', 'CLUSD', 'NGUSD'],
  'CRYPTO': ['BTCUSD', 'ETHUSD', 'XRPUSD', 'BNBUSD', 'SOLUSD', 'ADAUSD', 'DOTUSD', 'MATICUSD', 'LINKUSD', 'AVAXUSD', 'ATOMUSD', 'UNIUSD', 'LTCUSD', 'TRXUSD', 'FILUSD', 'AAVEUSD'],
  'FOREX': ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'CHFJPY', 'EURCHF', 'EURAUD'],
};

type WatchlistItem = { id: string; symbol: string; tab: string };

function MarketWatchPage() {
  const tabs = ['INDEX-FUT', 'INDEX-OPT', 'STOCK-FUT', 'STOCK-OPT', 'NSE-EQ', 'MCX-FUT', 'MCX-OPT', 'COMEX', 'CRYPTO', 'FOREX'];
  const [activeTab, setActiveTab] = useState('INDEX-FUT');
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const [watchlists, setWatchlists] = useState<Record<string, string[]>>({});
  const [toast, setToast] = useState<ToastState>(null);

  // Fetch watchlist for the active tab from the database
  // Validates: Requirements 4.8, 13.3
  useEffect(() => {
    apiCall(`/api/admin/watchlist?tab=${encodeURIComponent(activeTab)}`, { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        const items = data as WatchlistItem[];
        setWatchlists(prev => ({ ...prev, [activeTab]: items.map(item => item.symbol) }));
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
  }, [activeTab]);

  const instruments = watchlists[activeTab] ?? [];
  const allForTab = TAB_INSTRUMENTS[activeTab] ?? [];

  const suggestions = search.trim().length > 0
    ? allForTab.filter(s => s.toLowerCase().includes(search.trim().toLowerCase()))
    : allForTab;

  const showDropdown = focused && search.trim().length > 0;

  // Add instrument: POST to API then update local state on success
  // Validates: Requirements 4.9, 14.1–14.10
  const addInstrument = (sym: string) => {
    setSearch('');
    setFocused(false);
    apiCall('/api/admin/watchlist', {
      method: 'POST',
      body: JSON.stringify({ tab: activeTab, symbol: sym }),
    }).then(({ ok, status }) => {
      if (status === 401) { signOut(); return; }
      if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
      if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
      setWatchlists(prev => ({
        ...prev,
        [activeTab]: [...(prev[activeTab] ?? []).filter(x => x !== sym), sym],
      }));
    }).catch((err: unknown) => {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    });
  };

  // Clear all symbols for the active tab: DELETE (tab only) then clear local state
  // Validates: Requirements 4.9, 14.1–14.10
  const handleClear = () => {
    apiCall(`/api/admin/watchlist?tab=${encodeURIComponent(activeTab)}`, { method: 'DELETE' })
      .then(({ ok, status }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        setWatchlists(prev => ({ ...prev, [activeTab]: [] }));
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
  };

  // Remove individual symbol: DELETE with symbol then update local state
  // Validates: Requirements 4.9, 14.1–14.10
  const removeInstrument = (sym: string, idx: number) => {
    apiCall(`/api/admin/watchlist?tab=${encodeURIComponent(activeTab)}&symbol=${encodeURIComponent(sym)}`, { method: 'DELETE' })
      .then(({ ok, status }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        setWatchlists(prev => ({ ...prev, [activeTab]: prev[activeTab].filter((_, j) => j !== idx) }));
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
  };

  return (
    <div className="adm-mw-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {/* Horizontal scrollable tabs */}
      <div className="adm-mw-tabs">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`adm-mw-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab); setSearch(''); setFocused(false); }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Search + trash */}
      <div className="adm-mw-search-row">
        <div className="adm-mw-search-wrap">
          <i className="fas fa-search adm-mw-search-icon" />
          <input
            className="adm-mw-search"
            placeholder="Search and add"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
          />
          {/* Dropdown */}
          {showDropdown && (
            <div className="adm-mw-dropdown">
              {suggestions.length === 0 ? (
                <div className="adm-mw-dd-empty">No results found</div>
              ) : (
                suggestions.map(sym => {
                  const added = instruments.includes(sym);
                  return (
                    <div
                      key={sym}
                      className={`adm-mw-dd-row ${added ? 'added' : ''}`}
                      onMouseDown={() => !added && addInstrument(sym)}
                    >
                      <span className="adm-mw-dd-sym">{sym}</span>
                      <span className="adm-mw-dd-tag">{activeTab}</span>
                      {added
                        ? <span className="adm-mw-dd-check"><i className="fas fa-check" /></span>
                        : <span className="adm-mw-dd-plus"><i className="fas fa-plus" /></span>
                      }
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
        <button className="adm-mw-trash" onClick={handleClear}>
          <i className="fas fa-trash" />
        </button>
      </div>

      {/* Instrument list */}
      <div className="adm-mw-list">
        {instruments.length === 0 ? (
          <div className="adm-mw-empty">No instruments in this watchlist.</div>
        ) : (
          instruments.map((sym, i) => (
            <div className="adm-mw-row" key={i}>
              <span className="adm-mw-sym">{sym}</span>
              <button className="adm-mw-remove" onClick={() => removeInstrument(sym, i)}>✕</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TelegramPage() {
  const [bots, setBots] = useState<{ token: string; chatId: string; active: boolean }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [active, setActive] = useState(true);

  const handleAdd = () => {
    if (!token.trim()) return;
    setBots(prev => [...prev, { token: token.trim(), chatId: chatId.trim(), active }]);
    setToken('');
    setChatId('');
    setActive(true);
    setShowModal(false);
  };

  const handleClose = () => {
    setToken('');
    setChatId('');
    setActive(true);
    setShowModal(false);
  };

  return (
    <div className="adm-page">
      <h2 className="adm-page-title">Telegram Bot</h2>

      <div className="adm-card">
        <div className="adm-card-header">
          <div>
            <div className="adm-card-title">Telegram Configuration</div>
            <div className="adm-card-sub">Manage Telegram notification bot</div>
          </div>
          <button className="adm-btn-primary" onClick={() => setShowModal(true)}>
            Add Bot
          </button>
        </div>

        {bots.length === 0 ? (
          <div className="adm-dashed-box">No Telegram bot configured</div>
        ) : (
          <div className="adm-bot-list">
            {bots.map((b, i) => (
              <div className="adm-bot-row" key={i}>
                <i className="fab fa-telegram" style={{ color: '#2AABEE', fontSize: '1.2rem' }} />
                <div className="adm-bot-info">
                  <div className="adm-bot-name">{b.token.slice(0, 18)}…</div>
                  <div className="adm-bot-token">Chat ID: {b.chatId || '—'} · {b.active ? 'Active' : 'Inactive'}</div>
                </div>
                <button className="adm-btn-danger" onClick={() => setBots(prev => prev.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Sheet Modal */}
      {showModal && (
        <div className="adm-sheet-overlay" onClick={handleClose}>
          <div className="adm-bottom-sheet" onClick={e => e.stopPropagation()}>
            <div className="adm-sheet-title">Add Telegram Bot</div>
            <div className="adm-sheet-sub">Configure Telegram bot to send trade alerts.</div>
            <div className="adm-sheet-divider" />

            <div className="adm-sheet-field">
              <label className="adm-sheet-label">Bot Token</label>
              <input
                className="adm-sheet-input"
                placeholder="123456:ABCDEF..."
                value={token}
                onChange={e => setToken(e.target.value)}
              />
            </div>

            <div className="adm-sheet-field">
              <label className="adm-sheet-label">Chat ID</label>
              <input
                className="adm-sheet-input"
                placeholder="-100xxxxxxxxxx"
                value={chatId}
                onChange={e => setChatId(e.target.value)}
              />
            </div>

            <div className="adm-sheet-field">
              <label className="adm-sheet-label">Active</label>
              <div
                className={`adm-toggle ${active ? 'on' : ''}`}
                onClick={() => setActive(v => !v)}
              >
                <div className="adm-toggle-thumb" />
              </div>
            </div>

            <div className="adm-sheet-divider" />
            <div className="adm-sheet-actions">
              <button className="adm-sheet-cancel" onClick={handleClose}>Cancel</button>
              <button className="adm-btn-primary" onClick={handleAdd}>Add Bot</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── User Panel ───────────────────────────────────────────────────────────────
type UserListItem = {
  id: string; email: string; full_name: string | null; phone: string | null;
  role: string; parent_id: string | null; segments: string[] | null;
  active: boolean; read_only: boolean; demo_user: boolean;
  balance: number; created_at: string; scheduled_delete_at: string | null;
};

const PAGE_SIZE = 8;

const SEGMENTS = ['INDEX-FUT', 'STOCK-OPT', 'NSE-EQ', 'COMEX', 'INDEX-OPT', 'MCX-FUT', 'CRYPTO', 'STOCK-FUT', 'MCX-OPT', 'FOREX'];

function CreateUserForm({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string, role: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('Broker');
  const [parent, setParent] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const [active, setActive] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [demoUser, setDemoUser] = useState(false);
  const [intradaySqOff, setIntradaySqOff] = useState(false);
  const [autoSqoff, setAutoSqoff] = useState('90');
  const [sqoffMethod, setSqoffMethod] = useState('Credit');
  const [segments, setSegments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const usernameAvailable = username.length >= 3;

  const toggleSegment = (s: string) =>
    setSegments(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const handleCreate = async () => {
    if (!username.trim()) return;
    setLoading(true);
    const { ok, data } = await apiCall('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        username,
        full_name: fullName,
        phone,
        role: role.toLowerCase().replace(' ', '_'),
        parent_id: parent,
        segments,
        active,
        read_only: readOnly,
        demo_user: demoUser,
        intraday_sq_off: intradaySqOff,
        auto_sqoff: Number(autoSqoff),
        sqoff_method: sqoffMethod,
      }),
    });
    if (ok) {
      const d = data as { id: string; role?: string };
      onCreated(d.id, d.role ?? role.toUpperCase().replace(' ', '_'));
    } else {
      const errorMsg = (data as any).error || (data as any).message || 'Failed to create user';
      setToast({ message: errorMsg, type: 'error' });
      setLoading(false);
    }
  };

  return (
    <div className="adm-cu-root">
      {/* Header */}
      <div className="adm-cu-header">
        <button className="adm-cu-back" onClick={onBack}>‹</button>
        <div>
          <div className="adm-cu-title">Create New User</div>
          <div className="adm-cu-sub">Fill user details to create a new broker / subbroker / user.</div>
        </div>
      </div>

      {/* Scrollable form */}
      <div className="adm-cu-scroll">

        {/* Username */}
        <div className="adm-cu-field">
          <label className="adm-cu-label">Username</label>
          <input
            className={`adm-cu-input ${usernameAvailable && username ? 'valid' : ''}`}
            placeholder="FOT290"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          {usernameAvailable && username && (
            <div className="adm-cu-available">✓ Username is available</div>
          )}
        </div>

        {/* Password */}
        <div className="adm-cu-field">
          <label className="adm-cu-label">Password</label>
          <div className="adm-cu-input-wrap">
            <input
              className="adm-cu-input"
              placeholder="Enter password"
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <button className="adm-cu-eye" onClick={() => setShowPass(v => !v)}>
              <i className={`fas ${showPass ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </div>
        </div>

        {/* Full Name */}
        <div className="adm-cu-field">
          <label className="adm-cu-label">Full Name</label>
          <input className="adm-cu-input" placeholder="Enter full name" value={fullName} onChange={e => setFullName(e.target.value)} />
        </div>

        {/* Email */}
        <div className="adm-cu-field">
          <label className="adm-cu-label">Email</label>
          <input className="adm-cu-input" placeholder="user@example.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </div>

        {/* Phone */}
        <div className="adm-cu-field">
          <label className="adm-cu-label">Phone Number</label>
          <input className="adm-cu-input" placeholder="1234567890" type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>

        {/* Role */}
        <div className="adm-cu-field">
          <label className="adm-cu-label">Role</label>
          <select className="adm-cu-input adm-cu-select" value={role} onChange={e => setRole(e.target.value)}>
            <option>Broker</option>
            <option>Sub Broker</option>
          </select>
        </div>

        {/* Parent Account */}
        <div className="adm-cu-field">
          <label className="adm-cu-label">Parent Account</label>
          <input className="adm-cu-input" placeholder="Search parent by username or name..." value={parent} onChange={e => setParent(e.target.value)} />
        </div>

        {/* Copy Settings From */}
        <div className="adm-cu-field">
          <label className="adm-cu-label">Copy Settings From (optional)</label>
          <input className="adm-cu-input" placeholder="Search by username or full name..." value={copyFrom} onChange={e => setCopyFrom(e.target.value)} />
        </div>

        <div className="adm-cu-divider" />

        {/* User Settings */}
        <div className="adm-cu-section-title">User Settings</div>
        <div className="adm-cu-toggles-grid">
          <div className="adm-cu-toggle-item">
            <span className="adm-cu-toggle-label">Active</span>
            <div className={`adm-toggle ${active ? 'on' : ''}`} onClick={() => setActive(v => !v)}>
              <div className="adm-toggle-thumb" />
            </div>
          </div>
          <div className="adm-cu-toggle-item">
            <span className="adm-cu-toggle-label">Read Only</span>
            <div className={`adm-toggle ${readOnly ? 'on' : ''}`} onClick={() => setReadOnly(v => !v)}>
              <div className="adm-toggle-thumb" />
            </div>
          </div>
          <div className="adm-cu-toggle-item">
            <span className="adm-cu-toggle-label">Demo User</span>
            <div className={`adm-toggle ${demoUser ? 'on' : ''}`} onClick={() => setDemoUser(v => !v)}>
              <div className="adm-toggle-thumb" />
            </div>
          </div>
          <div className="adm-cu-toggle-item">
            <span className="adm-cu-toggle-label">Intraday Square Off</span>
            <div className={`adm-toggle ${intradaySqOff ? 'on' : ''}`} onClick={() => setIntradaySqOff(v => !v)}>
              <div className="adm-toggle-thumb" />
            </div>
          </div>
        </div>

        {/* Global Settings */}
        <div className="adm-cu-section-title">Global Settings</div>
        <div className="adm-cu-global-row">
          <div className="adm-cu-field" style={{ flex: 1 }}>
            <label className="adm-cu-label">Auto Sqoff %</label>
            <input className="adm-cu-input" type="number" value={autoSqoff} onChange={e => setAutoSqoff(e.target.value)} />
          </div>
          <div className="adm-cu-field" style={{ flex: 1 }}>
            <label className="adm-cu-label">Auto Sqoff Method</label>
            <select className="adm-cu-input adm-cu-select" value={sqoffMethod} onChange={e => setSqoffMethod(e.target.value)}>
              <option>Credit</option>
              <option>Debit</option>
              <option>Net</option>
            </select>
          </div>
        </div>

        {/* Exchange Segments */}
        <div className="adm-cu-section-title">Exchange Segments</div>
        <div className="adm-cu-segments-grid">
          {SEGMENTS.map(s => (
            <label className="adm-cu-seg-item" key={s}>
              <input
                type="checkbox"
                className="adm-cu-checkbox"
                checked={segments.includes(s)}
                onChange={() => toggleSegment(s)}
              />
              <span className="adm-cu-seg-label">{s}</span>
            </label>
          ))}
        </div>

        {/* Segment Settings placeholder */}
        <div className="adm-cu-section-title">Segment Settings</div>
        <div className="adm-cu-divider" />

        {/* Actions */}
        <div className="adm-cu-actions">
          <button className="adm-sheet-cancel" onClick={onBack}>Cancel</button>
          <button className="adm-btn-primary" style={{ padding: '10px 24px' }} onClick={handleCreate} disabled={loading}>
            {loading ? 'Creating…' : 'Create User'}
          </button>
        </div>

        <div style={{ height: 24 }} />
      </div>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}

function UserPanel({ open, onClose, onCreateUser, selectedUser, onSelectUser }: {
  open: boolean;
  onClose: () => void;
  onCreateUser: () => void;
  selectedUser: { id: string; role: string };
  onSelectUser: (u: { id: string; role: string }) => void;
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<ToastState>(null);

  useEffect(() => {
    setUsersLoading(true);
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
        {/* Close button */}
        <div className="adm-up-header">
          <button className="adm-up-close" onClick={onClose}>✕</button>
        </div>

        {/* Search */}
        <div className="adm-up-search-wrap">
          <i className="fas fa-search adm-up-search-icon" />
          <input
            className="adm-up-search"
            placeholder="Search by name"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>

        {/* Create New User row */}
        <div className="adm-up-create-row">
          <span className="adm-up-create-label">Create New User</span>
          <button className="adm-up-add-link" onClick={onCreateUser}>Add</button>
        </div>

        {/* User list */}
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

        {/* Pagination */}
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

// ─── Orders Page ──────────────────────────────────────────────────────────────
type Order = {
  symbol: string;
  side: 'BUY' | 'SELL';
  status: 'EXECUTED' | 'CANCELLED' | 'REJECTED';
  qty: number;
  price: number;
  orderType: 'MARKET' | 'LIMIT';
  info: string;
  time: string;
};

function OrdersPage({ selectedUser }: { selectedUser: { id: string; role: string } }) {
  // Validates: Requirements 6.9, 13.5, 14.1–14.10
  const [tab, setTab] = useState<'executed' | 'limit' | 'rejected'>('executed');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState('10');
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const uid = selectedUser.id;

  useEffect(() => {
    if (!uid) return;
    setOrdersLoading(true);
    apiCall(`/api/admin/users/${uid}/orders?tab=${encodeURIComponent(tab)}`, { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        const items = data as { id: string; symbol: string; side: 'BUY' | 'SELL'; status: 'EXECUTED' | 'CANCELLED' | 'REJECTED'; qty: number; price: number; order_type: 'MARKET' | 'LIMIT'; info: string; time: string }[];
        setOrders(items.map(r => ({
          symbol: r.symbol,
          side: r.side,
          status: r.status,
          qty: r.qty,
          price: r.price,
          orderType: r.order_type,
          info: r.info,
          time: r.time,
        })));
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      })
      .finally(() => setOrdersLoading(false));
  }, [uid, tab]);

  const allOrders = orders;

  const filtered = allOrders.filter(o =>
    o.symbol.toLowerCase().includes(search.toLowerCase()) ||
    uid.toLowerCase().includes(search.toLowerCase())
  );
  const displayed = filtered.slice(0, Number(rows));

  const buyCount = allOrders.filter(o => o.side === 'BUY').length;
  const sellCount = allOrders.filter(o => o.side === 'SELL').length;

  return (
    <div className="adm-ord-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {/* Stat cards */}
      <div className="adm-ord-stats">
        <div className="adm-ord-stat">
          <div className="adm-ord-stat-label">USER</div>
          <div className="adm-ord-stat-value">{uid}</div>
        </div>
        <div className="adm-ord-stat">
          <div className="adm-ord-stat-label">BUY TRADES</div>
          <div className="adm-ord-stat-value pos">{buyCount}</div>
        </div>
        <div className="adm-ord-stat">
          <div className="adm-ord-stat-label">SELL TRADES</div>
          <div className="adm-ord-stat-value neg">{sellCount}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="adm-ord-tabs">
        {(['executed', 'limit', 'rejected'] as const).map(t => (
          <button
            key={t}
            className={`adm-ord-tab ${tab === t ? 'active' : ''}`}
            onClick={() => { setTab(t); setSearch(''); }}
          >
            {t === 'executed' ? 'Executed Orders' : t === 'limit' ? 'Limit Orders' : 'Rejected Orders'}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="adm-ord-search-wrap">
        <i className="fas fa-search adm-ord-search-icon" />
        <input
          className="adm-ord-search"
          placeholder="Search by username, name or symbol"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Rows + Download */}
      <div className="adm-ord-controls">
        <div className="adm-ord-rows-wrap">
          <span className="adm-ord-rows-label">Rows</span>
          <select className="adm-ord-rows-select" value={rows} onChange={e => setRows(e.target.value)}>
            {['10', '25', '50', '100'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <button className="adm-ord-download">
        <i className="fas fa-download" /> Download Excel
      </button>

      {/* Order cards */}
      <div className="adm-ord-list">
        {ordersLoading ? (
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
                {Array.from({ length: 4 }).map((_, j) => <SkeletonLine key={j} height={12} width="70%" />)}
              </div>
            </div>
          ))
        ) : displayed.length === 0 ? (
          <div className="adm-mw-empty">No orders found.</div>
        ) : displayed.map((o, i) => (
          <div className="adm-ord-card" key={i}>
            <div className="adm-ord-card-top">
              <div>
                <div className="adm-ord-symbol">{o.symbol}</div>
                <div className="adm-ord-user">{uid}</div>
              </div>
              <div className="adm-ord-badges">
                <span className={`adm-ord-side ${o.side === 'BUY' ? 'buy' : 'sell'}`}>{o.side}</span>
                <span className={`adm-ord-status ${o.status === 'EXECUTED' ? 'exec' : o.status === 'CANCELLED' ? 'cancel' : 'reject'}`}>{o.status}</span>
              </div>
            </div>
            <div className="adm-ord-details">
              <div className="adm-ord-detail-row">
                <span className="adm-ord-dl">Qty</span>
                <span className="adm-ord-dv">{o.qty}</span>
                <span className="adm-ord-dl">Price</span>
                <span className="adm-ord-dv">{o.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="adm-ord-detail-row">
                <span className="adm-ord-dl">Order Type</span>
                <span className="adm-ord-dv bold">{o.orderType}</span>
                <span className="adm-ord-dl">Info</span>
                <span className="adm-ord-dv">{o.info}</span>
              </div>
              <div className="adm-ord-detail-row">
                <span className="adm-ord-dl">Time</span>
                <span className="adm-ord-dv" style={{ gridColumn: '2 / -1' }}>{o.time}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── Position Page ────────────────────────────────────────────────────────────
type PositionItem = {
  id: string; symbol: string; side: 'BUY' | 'SELL'; pnl: number;
  qty_open: number; qty_total: number; avg_price: number; entry_price: number;
  ltp: number | null; exit_price: number | null; duration_seconds: number;
  brokerage: number; sl: number | null; tp: number | null;
  entry_time: string; exit_time: string | null; settlement: string | null;
};

type Position = {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  pnl: number;
  qty: string;       // e.g. "4/4" open, "0/5" closed
  avgPrice: number;
  entry: number;
  ltp?: number;      // open/active
  exit?: number;     // closed
  duration: string;
  brokerage: number;
  slTp: string;
  entryTime: string;
  exitTime?: string;
  settlement?: string;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function positionItemToPosition(item: PositionItem): Position {
  return {
    id: item.id,
    symbol: item.symbol,
    side: item.side,
    pnl: item.pnl,
    qty: `${item.qty_open}/${item.qty_total}`,
    avgPrice: item.avg_price,
    entry: item.entry_price,
    ltp: item.ltp ?? undefined,
    exit: item.exit_price ?? undefined,
    duration: formatDuration(item.duration_seconds),
    brokerage: item.brokerage,
    slTp: `${item.sl ?? '–'} / ${item.tp ?? '–'}`,
    entryTime: item.entry_time,
    exitTime: item.exit_time ?? undefined,
    settlement: item.settlement ?? undefined,
  };
}

// Validates: Requirements 7.7–7.11, 13.6, 14.1–14.10

function PositionPage({ selectedUser }: { selectedUser: { id: string; role: string } }) {
  // Validates: Requirements 7.7–7.11, 13.6, 14.1–14.10
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      {/* Stat cards */}
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

      {/* Tabs */}
      <div className="adm-pos-tabs">
        {(['open', 'active', 'closed'] as const).map(t => (
          <button key={t} className={`adm-pos-tab ${tab === t ? 'active' : ''}`} onClick={() => switchTab(t)}>
            {t === 'open' ? 'Open Position' : t === 'active' ? 'Active Trades' : 'Closed Position'}
          </button>
        ))}
      </div>

      {/* Select Multiple (open/active only) */}
      {tab !== 'closed' && (
        <div className="adm-pos-select-wrap">
          <button className="adm-pos-select-btn">Select Multiple</button>
        </div>
      )}

      {/* Search */}
      <div className="adm-ord-search-wrap">
        <i className="fas fa-search adm-ord-search-icon" />
        <input className="adm-ord-search" placeholder="Search by user or symbol" value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {/* Rows + Download */}
      <div className="adm-ord-controls">
        <div className="adm-ord-rows-wrap">
          <span className="adm-ord-rows-label">Rows</span>
          <select className="adm-ord-rows-select" value={rows} onChange={e => { setRows(e.target.value); setPage(1); }}>
            {['10', '25', '50', '100'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <button className="adm-ord-download"><i className="fas fa-download" /> Download Excel</button>

      {/* Position cards */}
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
              {/* Open Position: full-width Sqoff only */}
              {tab === 'open' && (
                <button className="adm-pos-act-sqoff-full" onClick={() => handleSqoff(p.id)}>Sqoff</button>
              )}
              {/* Active Trades: Sqoff + Edit + Delete */}
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

      {/* Pagination */}
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

// ─── Update Page ──────────────────────────────────────────────────────────────
const ALL_SEGMENTS = ['INDEX-FUT', 'STOCK-OPT', 'NSE-EQ', 'COMEX', 'INDEX-OPT', 'MCX-FUT', 'CRYPTO', 'STOCK-FUT', 'MCX-OPT', 'FOREX'];

type SegSettings = {
  commissionType: string; commissionValue: string;
  profitHoldSec: string; lossHoldSec: string;
  strikeRange: string; maxLot: string;
  maxOrderLot: string; intradayLeverage: string;
  intradayType: string;
  holdingLeverage: string; entryBuffer: string;
  holdingType: string;
  exitBuffer: string; tradeAllowed: boolean;
};

const defaultSeg = (): SegSettings => ({
  commissionType: 'Per Crore', commissionValue: '4500',
  profitHoldSec: '120', lossHoldSec: '0',
  strikeRange: '0', maxLot: '50',
  maxOrderLot: '50', intradayLeverage: '50',
  intradayType: 'Multiplier',
  holdingLeverage: '5', entryBuffer: '0.003',
  holdingType: 'Multiplier',
  exitBuffer: '0.0017', tradeAllowed: true,
});

function SegmentBlock({ name, value, onChange }: { name: string; value: SegSettings; onChange: (k: keyof SegSettings, v: string | boolean) => void }) {
  const s = value;
  const upd = (k: keyof SegSettings, v: string | boolean) => onChange(k, v);

  return (
    <div className="adm-upd-seg-block">
      <div className="adm-upd-seg-header">
        <span className="adm-upd-seg-name">{name}</span>
        <button className="adm-upd-copy-btn"><i className="fas fa-copy" /> Copy From</button>
      </div>
      <div className="adm-upd-grid2">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Commission Type</label>
          <select className="adm-upd-input adm-upd-select" value={s.commissionType} onChange={e => upd('commissionType', e.target.value)}>
            <option>Per Crore</option><option>Per Lot</option><option>Per Trade</option>
          </select>
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Commission Value</label>
          <input className="adm-upd-input" value={s.commissionValue} onChange={e => upd('commissionValue', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Profit Hold Sec</label>
          <input className="adm-upd-input" value={s.profitHoldSec} onChange={e => upd('profitHoldSec', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Loss Hold Sec</label>
          <input className="adm-upd-input" value={s.lossHoldSec} onChange={e => upd('lossHoldSec', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Strike Range</label>
          <input className="adm-upd-input" value={s.strikeRange} onChange={e => upd('strikeRange', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Max Lot</label>
          <input className="adm-upd-input" value={s.maxLot} onChange={e => upd('maxLot', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Max Order Lot</label>
          <input className="adm-upd-input" value={s.maxOrderLot} onChange={e => upd('maxOrderLot', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Intraday Leverage</label>
          <input className="adm-upd-input" value={s.intradayLeverage} onChange={e => upd('intradayLeverage', e.target.value)} />
        </div>
      </div>
      <div className="adm-upd-field">
        <label className="adm-upd-label">Intraday Type</label>
        <select className="adm-upd-input adm-upd-select" value={s.intradayType} onChange={e => upd('intradayType', e.target.value)}>
          <option>Multiplier</option><option>Fixed</option>
        </select>
        <div className="adm-upd-hint">Req Funds = (Qty × Market Price) ÷ Leverage</div>
      </div>
      <div className="adm-upd-grid2">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Holding Leverage</label>
          <input className="adm-upd-input" value={s.holdingLeverage} onChange={e => upd('holdingLeverage', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Entry Buffer</label>
          <input className="adm-upd-input" value={s.entryBuffer} onChange={e => upd('entryBuffer', e.target.value)} />
        </div>
      </div>
      <div className="adm-upd-field">
        <label className="adm-upd-label">Holding Type</label>
        <select className="adm-upd-input adm-upd-select" value={s.holdingType} onChange={e => upd('holdingType', e.target.value)}>
          <option>Multiplier</option><option>Fixed</option>
        </select>
        <div className="adm-upd-hint">Req Funds = (Qty × Market Price) ÷ Leverage</div>
      </div>
      <div className="adm-upd-grid2">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Exit Buffer</label>
          <input className="adm-upd-input" value={s.exitBuffer} onChange={e => upd('exitBuffer', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Trade Allowed</label>
          <div className={`adm-toggle ${s.tradeAllowed ? 'on' : ''}`} onClick={() => upd('tradeAllowed', !s.tradeAllowed)}>
            <div className="adm-toggle-thumb" />
          </div>
        </div>
      </div>
    </div>
  );
}

function UpdatePage({ selectedUser }: { selectedUser: { id: string; role: string } }) {
  const uid = selectedUser.id;

  const [activation, setActivation] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('User');
  const [parent, setParent] = useState('');
  const [copyFrom, setCopyFrom] = useState('undefined (undefined)');
  const [readOnly, setReadOnly] = useState(false);
  const [demoUser, setDemoUser] = useState(false);
  const [intradaySqOff, setIntradaySqOff] = useState(false);
  const [autoSqoff, setAutoSqoff] = useState('90');
  const [sqoffMethod, setSqoffMethod] = useState('Credit');
  const [segments, setSegments] = useState<string[]>([]);
  const [segSettings, setSegSettings] = useState<Record<string, SegSettings>>({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  // Helper: map a SegmentSettingRow to SegSettings (string-valued form state)
  const rowToSegSettings = (row: {
    commission_type: string; commission_value: number;
    profit_hold_sec: number; loss_hold_sec: number;
    strike_range: number; max_lot: number; max_order_lot: number;
    intraday_leverage: number; intraday_type: string;
    holding_leverage: number; entry_buffer: number;
    holding_type: string; exit_buffer: number; trade_allowed: boolean;
  }): SegSettings => ({
    commissionType: row.commission_type,
    commissionValue: String(row.commission_value),
    profitHoldSec: String(row.profit_hold_sec),
    lossHoldSec: String(row.loss_hold_sec),
    strikeRange: String(row.strike_range),
    maxLot: String(row.max_lot),
    maxOrderLot: String(row.max_order_lot),
    intradayLeverage: String(row.intraday_leverage),
    intradayType: row.intraday_type,
    holdingLeverage: String(row.holding_leverage),
    entryBuffer: String(row.entry_buffer),
    holdingType: row.holding_type,
    exitBuffer: String(row.exit_buffer),
    tradeAllowed: row.trade_allowed,
  });

  // Fetch user profile and segment settings when selectedUser changes
  // Validates: Requirements 8.5, 13.7, 14.1–14.10
  useEffect(() => {
    if (!uid) return;
    setPassword('');

    // Fetch user profile
    apiCall(`/api/admin/users/${uid}`, { method: 'GET' }).then(({ ok, status, data }) => {
      if (status === 401) { signOut(); return; }
      if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
      if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
      const p = data as {
        email: string; full_name: string | null; phone: string | null;
        role: string; parent_id: string | null; segments: string[] | null;
        active: boolean; read_only: boolean; demo_user: boolean;
        intraday_sq_off: boolean; auto_sqoff: number | null; sqoff_method: string | null;
      };
      setEmail(p.email ?? '');
      setFullName(p.full_name ?? '');
      setPhone(p.phone ?? '');
      // Normalize role from snake_case to display form
      const roleMap: Record<string, string> = {
        user: 'User', sub_broker: 'Sub Broker', broker: 'Broker', admin: 'Admin', super_admin: 'Admin',
      };
      setRole(roleMap[p.role] ?? 'User');
      setParent(p.parent_id ?? '');
      setActivation(p.active ?? false);
      setReadOnly(p.read_only ?? false);
      setDemoUser(p.demo_user ?? false);
      setIntradaySqOff(p.intraday_sq_off ?? false);
      setAutoSqoff(String(p.auto_sqoff ?? 90));
      setSqoffMethod(p.sqoff_method ?? 'Credit');
      setSegments(p.segments ?? []);
    }).catch((err: unknown) => {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    });

    // Fetch segment settings
    apiCall(`/api/admin/users/${uid}/segments`, { method: 'GET' }).then(({ ok, status, data }) => {
      if (status === 401) { signOut(); return; }
      if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
      if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
      const rows = data as Array<{
        segment: string; side: string;
        commission_type: string; commission_value: number;
        profit_hold_sec: number; loss_hold_sec: number;
        strike_range: number; max_lot: number; max_order_lot: number;
        intraday_leverage: number; intraday_type: string;
        holding_leverage: number; entry_buffer: number;
        holding_type: string; exit_buffer: number; trade_allowed: boolean;
      }>;
      const map: Record<string, SegSettings> = {};
      for (const row of rows) {
        const key = `${row.segment}-${row.side}`;
        map[key] = rowToSegSettings(row);
      }
      setSegSettings(map);
    }).catch((err: unknown) => {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const toggleSeg = (s: string) => setSegments(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  // Segment blocks: each enabled segment gets BUY and SELL block
  const segBlocks = ALL_SEGMENTS.filter(s => segments.includes(s)).flatMap(s => [`${s}-BUY`, `${s}-SELL`]);

  return (
    <div className="adm-upd-root">
      {/* Breadcrumb */}
      <div className="adm-settings-tab">User Details</div>

      {/* User Settings card */}
      <div className="adm-upd-card">
        <div className="adm-upd-card-header">
          <span className="adm-upd-card-title">User Settings</span>
          <div className="adm-upd-activation">
            <span className="adm-upd-label">Activation</span>
            <div className={`adm-toggle ${activation ? 'on' : ''}`} onClick={() => setActivation(v => !v)}>
              <div className="adm-toggle-thumb" />
            </div>
          </div>
        </div>

        <div className="adm-upd-field">
          <label className="adm-upd-label">Username</label>
          <input className="adm-upd-input" value={uid} readOnly />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Email</label>
          <input className="adm-upd-input" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Password</label>
          <div className="adm-cu-input-wrap">
            <input className="adm-upd-input" style={{ paddingRight: 40 }} type={showPass ? 'text' : 'password'} placeholder="Leave blank to keep same" value={password} onChange={e => setPassword(e.target.value)} />
            <button className="adm-cu-eye" onClick={() => setShowPass(v => !v)}><i className={`fas ${showPass ? 'fa-eye-slash' : 'fa-eye'}`} /></button>
          </div>
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Full Name</label>
          <input className="adm-upd-input" value={fullName} onChange={e => setFullName(e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Phone Number</label>
          <input className="adm-upd-input" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Role</label>
          <select className="adm-upd-input adm-upd-select" value={role} onChange={e => setRole(e.target.value)}>
            <option>User</option><option>Sub Broker</option><option>Broker</option><option>Admin</option>
          </select>
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Parent Account</label>
          <div className="adm-upd-parent-wrap">
            <input className="adm-upd-input" value={parent} onChange={e => setParent(e.target.value)} />
            {parent && <button className="adm-upd-parent-clear" onClick={() => setParent('')}>✕</button>}
          </div>
          {parent && <div className="adm-cu-available">✓ Parent selected</div>}
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Copy Settings From (optional)</label>
          <input className="adm-upd-input" value={copyFrom} onChange={e => {
            const val = e.target.value;
            setCopyFrom(val);
            // When a user id is typed/selected, fetch their segments and populate form
            // Validates: Requirements 8.7, 14.1–14.10
            const trimmed = val.trim();
            if (trimmed && trimmed !== 'undefined (undefined)') {
              apiCall(`/api/admin/users/${encodeURIComponent(trimmed)}/segments`, { method: 'GET' })
                .then(({ ok, status, data }) => {
                  if (status === 401) { signOut(); return; }
                  if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
                  if (!ok) return; // silently ignore if user not found
                  const rows = data as Array<{
                    segment: string; side: string;
                    commission_type: string; commission_value: number;
                    profit_hold_sec: number; loss_hold_sec: number;
                    strike_range: number; max_lot: number; max_order_lot: number;
                    intraday_leverage: number; intraday_type: string;
                    holding_leverage: number; entry_buffer: number;
                    holding_type: string; exit_buffer: number; trade_allowed: boolean;
                  }>;
                  const map: Record<string, SegSettings> = {};
                  for (const row of rows) {
                    const key = `${row.segment}-${row.side}`;
                    map[key] = rowToSegSettings(row);
                  }
                  setSegSettings(map);
                })
                .catch(() => { /* silently ignore copy-from errors */ });
            }
          }} />
        </div>
      </div>

      {/* User Options & Global Settings */}
      <div className="adm-upd-card">
        <div className="adm-upd-section-title">User Options &amp; Global Settings</div>
        <div className="adm-upd-toggles-row">
          <div className="adm-upd-toggle-item">
            <span className="adm-upd-label">Read Only</span>
            <div className={`adm-toggle ${readOnly ? 'on' : ''}`} onClick={() => setReadOnly(v => !v)}><div className="adm-toggle-thumb" /></div>
          </div>
          <div className="adm-upd-toggle-item">
            <span className="adm-upd-label">Demo User</span>
            <div className={`adm-toggle ${demoUser ? 'on' : ''}`} onClick={() => setDemoUser(v => !v)}><div className="adm-toggle-thumb" /></div>
          </div>
          <div className="adm-upd-toggle-item">
            <span className="adm-upd-label">Intraday Square Off</span>
            <div className={`adm-toggle ${intradaySqOff ? 'on' : ''}`} onClick={() => setIntradaySqOff(v => !v)}><div className="adm-toggle-thumb" /></div>
          </div>
        </div>

        <div className="adm-upd-section-title" style={{ marginTop: 8 }}>Global Settings</div>
        <div className="adm-upd-grid2">
          <div className="adm-upd-field">
            <label className="adm-upd-label">Auto Sqoff %</label>
            <input className="adm-upd-input" value={autoSqoff} onChange={e => setAutoSqoff(e.target.value)} />
          </div>
          <div className="adm-upd-field">
            <label className="adm-upd-label">Auto Sqoff Method</label>
            <select className="adm-upd-input adm-upd-select" value={sqoffMethod} onChange={e => setSqoffMethod(e.target.value)}>
              <option>Credit</option><option>Debit</option><option>Net</option>
            </select>
          </div>
        </div>

        <div className="adm-upd-section-title" style={{ marginTop: 8 }}>Exchange Segments</div>
        <div className="adm-cu-segments-grid">
          {ALL_SEGMENTS.map(s => (
            <label className="adm-cu-seg-item" key={s}>
              <input type="checkbox" className="adm-cu-checkbox" checked={segments.includes(s)} onChange={() => toggleSeg(s)} />
              <span className="adm-cu-seg-label">{s}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Segment Settings */}
      <div className="adm-upd-section-title">Segment Settings</div>
      {segBlocks.map(name => <SegmentBlock key={name} name={name} value={segSettings[name] ?? defaultSeg()} onChange={(k, v) => setSegSettings(prev => ({ ...prev, [name]: { ...(prev[name] ?? defaultSeg()), [k]: v } }))} />)}

      {/* Save button */}
      <button
        className="adm-btn-primary"
        style={{ width: '100%', padding: '14px', fontSize: '0.9rem', borderRadius: 10 }}
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          // Step 1: PATCH user profile
          // Validates: Requirements 8.6, 14.1–14.10
          const { ok, status, data } = await apiCall(`/api/admin/users/${uid}`, {
            method: 'PATCH',
            body: JSON.stringify({
              email,
              password: password || undefined,
              full_name: fullName,
              phone,
              role: role.toLowerCase().replace(' ', '_'),
              parent_id: parent,
              active: activation,
              read_only: readOnly,
              demo_user: demoUser,
              intraday_sq_off: intradaySqOff,
              auto_sqoff: Number(autoSqoff),
              sqoff_method: sqoffMethod,
              segments,
            }),
          });
          if (status === 401) { signOut(); setLoading(false); return; }
          if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); setLoading(false); return; }
          if (!ok) { setToast({ message: 'Server Error', type: 'error' }); setLoading(false); return; }

          // Step 2: POST segment settings for all enabled segment blocks
          // Validates: Requirements 8.6, 14.1–14.10
          if (segBlocks.length > 0) {
            const segRows = segBlocks.map(name => {
              const parts = name.split('-');
              const side = parts[parts.length - 1] as 'BUY' | 'SELL';
              const segment = parts.slice(0, parts.length - 1).join('-');
              const s = segSettings[name] ?? defaultSeg();
              return {
                user_id: uid,
                segment,
                side,
                commission_type: s.commissionType,
                commission_value: Number(s.commissionValue),
                profit_hold_sec: Number(s.profitHoldSec),
                loss_hold_sec: Number(s.lossHoldSec),
                strike_range: Number(s.strikeRange),
                max_lot: Number(s.maxLot),
                max_order_lot: Number(s.maxOrderLot),
                intraday_leverage: Number(s.intradayLeverage),
                intraday_type: s.intradayType,
                holding_leverage: Number(s.holdingLeverage),
                entry_buffer: Number(s.entryBuffer),
                holding_type: s.holdingType,
                exit_buffer: Number(s.exitBuffer),
                trade_allowed: s.tradeAllowed,
              };
            });
            const segRes = await apiCall(`/api/admin/users/${uid}/segments`, {
              method: 'POST',
              body: JSON.stringify(segRows),
            });
            if (segRes.status === 401) { signOut(); setLoading(false); return; }
            if (segRes.status === 403) { setToast({ message: 'Access Denied', type: 'error' }); setLoading(false); return; }
            if (!segRes.ok) { setToast({ message: 'Server Error', type: 'error' }); setLoading(false); return; }
          }

          setToast({ message: 'Changes saved successfully', type: 'success' });
          setLoading(false);
        }}
      >
        {loading ? 'Saving…' : 'Save Changes'}
      </button>

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── Users Page ───────────────────────────────────────────────────────────────
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

function UsersPage({ selectedUser, onSelectUser, onNavigate }: {
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
      {/* Stat cards */}
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

      {/* Search + Create */}
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

      {/* Rows + Download */}
      <div className="adm-ord-controls">
        <div className="adm-ord-rows-wrap">
          <span className="adm-ord-rows-label">Rows</span>
          <select className="adm-ord-rows-select" value={rows} onChange={e => { setRows(e.target.value); setPage(1); }}>
            {['10', '25', '50', '100'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <button className="adm-ord-download"><i className="fas fa-download" /> Download Excel</button>

      {/* User cards */}
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
            {/* Header */}
            <div className="adm-users-card-header">
              <span className="adm-users-fullname">{u.fullName} <span className="adm-users-role-tag">({u.role})</span></span>
              <span className={`adm-users-status ${u.active ? 'active' : 'inactive'}`}>{u.active ? 'Active' : 'Inactive'}</span>
            </div>
            {/* Username */}
            <div className="adm-users-uid">{u.id}</div>
            {/* Details grid */}
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
            {/* Action buttons */}
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

      {/* Pagination */}
      <div className="adm-pos-pagination">
        <span className="adm-pos-page-info">Page {page} of {totalPages}</span>
        <div className="adm-pos-page-btns">
          <button className="adm-pos-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <button className="adm-pos-page-btn active-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      </div>

      {confirmDialog && (
        <ConfirmDialog
          message={`Are you sure you want to delete ${confirmDialog.userId}?`}
          loading={loading}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={async () => {
            const userId = confirmDialog.userId;
            setLoading(true);
            const { ok, data } = await apiCall(`/api/admin/users/${userId}`, { method: 'DELETE' });
            if (ok) {
              setUsers(prev => prev.filter(u => u.id !== userId));
              setConfirmDialog(null);
              setToast({ message: 'User deleted successfully', type: 'success' });
            } else {
              setToast({ message: (data as { error: string }).error, type: 'error' });
              setConfirmDialog(null);
            }
            setLoading(false);
          }}
        />
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── Act Ledger Page ──────────────────────────────────────────────────────────
// ACT_LOGS constant removed — data is now fetched from /api/admin/actlogs

const LOG_ROWS = 10;

// ActLogItem matches the API response shape
type ActLogItem = {
  id: string; type: string; time: string; by: string; target: string;
  symbol: string | null; qty: number | null; price: number | null;
  reason: string | null; ip: string;
};

function ActLedgerPage() {
  // Validates: Requirements 9.7–9.8, 13.8, 14.1–14.10
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dlRows, setDlRows] = useState('100');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [logs, setLogs] = useState<ActLogItem[]>([]);
  const [toast, setToast] = useState<ToastState>(null);

  // Fetch logs from API; re-fetch when search or date filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (search) params.set('search', search);
    params.set('rows', dlRows);
    params.set('page', String(page));
    const query = params.toString() ? `?${params.toString()}` : '';
    apiCall(`/api/admin/actlogs${query}`, { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        setLogs(data as ActLogItem[]);
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, search, page, dlRows]);

  // Export CSV: fetch with export=csv param and trigger browser download
  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (search) params.set('search', search);
    params.set('rows', dlRows);
    params.set('export', 'csv');
    supabase.auth.getSession().then(({ data: sessionData }) => {
      const token = sessionData.session?.access_token ?? '';
      fetch(`/api/admin/actlogs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(res => {
        if (!res.ok) { setToast({ message: 'Export failed', type: 'error' }); return; }
        return res.blob();
      }).then(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'actlogs.csv';
        a.click();
        URL.revokeObjectURL(url);
      }).catch(() => setToast({ message: 'Export failed', type: 'error' }));
    });
  };

  // Client-side filtering is now handled server-side; logs already filtered
  const displayed = logs;
  const totalPages = Math.max(1, Math.ceil(logs.length / LOG_ROWS));

  return (
    <div className="adm-al-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <h2 className="adm-page-title">Action Logs</h2>

      {/* Date filter */}
      <div className="adm-al-dates">
        <div className="adm-al-date-field">
          <label className="adm-al-label">From</label>
          <input type="date" className="adm-db-date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="adm-al-date-field">
          <label className="adm-al-label">To</label>
          <input type="date" className="adm-db-date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* Download rows + Export */}
      <div className="adm-al-export-row">
        <div className="adm-al-dl-wrap">
          <label className="adm-al-label">Download Rows</label>
          <div className="adm-al-dl-inner">
            <select className="adm-ord-rows-select" value={dlRows} onChange={e => setDlRows(e.target.value)}>
              {['10', '25', '50', '100'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button className="adm-al-export-btn" onClick={handleExportCsv}>Export CSV</button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="adm-ord-search-wrap">
        <i className="fas fa-search adm-ord-search-icon" />
        <input className="adm-ord-search" placeholder="Search..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {/* Log cards */}
      <div className="adm-al-list">
        {displayed.map((l, i) => (
          <div className="adm-al-card" key={i}>
            <div className="adm-al-card-top">
              <div>
                <div className="adm-al-type">{l.type}</div>
                <div className="adm-al-time">{l.time}</div>
              </div>
              <button className="adm-al-details-btn" onClick={() => setExpanded(expanded === i ? null : i)}>
                Details
              </button>
            </div>
            <div className="adm-al-grid">
              <span className="adm-al-dl">By</span>
              <span className="adm-al-dv bold">{l.by}</span>
              <span className="adm-al-dl">Target</span>
              <span className="adm-al-dv bold">{l.target}</span>
              {l.symbol && (<>
                <span className="adm-al-dl">Symbol</span>
                <span className="adm-al-dv">{l.symbol}</span>
                <span className="adm-al-dl">Qty @ Price</span>
                <span className="adm-al-dv">{l.qty} @ {l.price}</span>
              </>)}
              {l.reason && (<>
                <span className="adm-al-dl">Reason</span>
                <span className="adm-al-dv">{l.reason}</span>
              </>)}
              <span className="adm-al-dl">IP</span>
              <span className="adm-al-dv muted">{l.ip}</span>
            </div>
            {expanded === i && (
              <div className="adm-al-expanded">
                <div className="adm-al-exp-row"><span>Type</span><span>{l.type}</span></div>
                <div className="adm-al-exp-row"><span>Time</span><span>{l.time}</span></div>
                <div className="adm-al-exp-row"><span>By</span><span>{l.by}</span></div>
                <div className="adm-al-exp-row"><span>Target</span><span>{l.target}</span></div>
                {l.symbol && <div className="adm-al-exp-row"><span>Symbol</span><span>{l.symbol}</span></div>}
                {l.qty && <div className="adm-al-exp-row"><span>Qty</span><span>{l.qty}</span></div>}
                {l.price && <div className="adm-al-exp-row"><span>Price</span><span>{l.price}</span></div>}
                {l.reason && <div className="adm-al-exp-row"><span>Reason</span><span>{l.reason}</span></div>}
                <div className="adm-al-exp-row"><span>IP</span><span>{l.ip}</span></div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
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

// ACCOUNTS_DATA constant removed — data is now fetched from /api/admin/accounts

// AccountItem matches the API response shape
type AccountItem = {
  id: string; full_name: string; broker: string;
  net_pnl: number; brokerage: number; pnl_bkg: number; settlement: number;
};

// AccountSummary for the summary stat cards (computed from fetched data)
type AccountSummary = {
  id: string; pnlBkg: number; clientNetPnl: number;
  totalBrokerage: number; sharingBkg: number; sharingPnl: number;
};

function AccountsPageImpl() {
  // Validates: Requirements 10.9–10.10, 13.9, 14.1–14.10
  const [filter, setFilter] = useState<'all' | 'subbrokers' | 'brokers'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [page, setPage] = useState(1);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [toast, setToast] = useState<ToastState>(null);
  const ROWS = 10;

  // Fetch accounts from API; re-fetch when filter or date changes
  useEffect(() => {
    const params = new URLSearchParams();
    params.set('filter', filter);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (search) params.set('search', search);
    apiCall(`/api/admin/accounts?${params.toString()}`, { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
        if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
        setAccounts(data as AccountItem[]);
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, dateFrom, dateTo, search]);

  // Compute summary from fetched accounts
  const totalNetPnl = accounts.reduce((s, a) => s + a.net_pnl, 0);
  const totalBrokerage = accounts.reduce((s, a) => s + a.brokerage, 0);
  const totalPnlBkg = accounts.reduce((s, a) => s + a.pnl_bkg, 0);
  const summary: AccountSummary = {
    id: accounts.length > 0 ? (accounts[0].broker || '—') : '—',
    pnlBkg: totalPnlBkg,
    clientNetPnl: totalNetPnl,
    totalBrokerage: totalBrokerage,
    sharingBkg: 0,
    sharingPnl: 0,
  };

  // Export helper: generate CSV from fetched accounts data
  const exportAccountsCsv = (rows: AccountItem[], filename: string) => {
    const header = 'ID,Full Name,Broker,Net PNL,Brokerage,PNL+BKG,Settlement\n';
    const body = rows.map(r =>
      `${r.id},${r.full_name},${r.broker},${r.net_pnl},${r.brokerage},${r.pnl_bkg},${r.settlement}`
    ).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export Excel: generate CSV (Excel-compatible) from fetched data
  const handleExportExcel = () => exportAccountsCsv(accounts, 'accounts.csv');

  // Export PDF: open print dialog with a simple HTML table
  const handleExportPdf = () => {
    const rows = accounts.map(r =>
      `<tr><td>${r.id}</td><td>${r.full_name}</td><td>${r.broker}</td><td>${r.net_pnl}</td><td>${r.brokerage}</td><td>${r.pnl_bkg}</td><td>${r.settlement}</td></tr>`
    ).join('');
    const html = `<html><head><title>Accounts</title></head><body>
      <table border="1" cellpadding="4" cellspacing="0">
        <thead><tr><th>ID</th><th>Full Name</th><th>Broker</th><th>Net PNL</th><th>Brokerage</th><th>PNL+BKG</th><th>Settlement</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  };

  const filtered = accounts.filter(u =>
    u.id.toLowerCase().includes(search.toLowerCase()) ||
    u.full_name.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS));
  const displayed = filtered.slice((page - 1) * ROWS, page * ROWS);

  const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="adm-acc-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      {/* Filter tabs */}
      <div className="adm-acc-tabs">
        {(['all', 'subbrokers', 'brokers'] as const).map(t => (
          <button key={t} className={`adm-acc-tab ${filter === t ? 'active' : ''}`}
            onClick={() => { setFilter(t); setPage(1); setUserSearch(''); }}>
            {t === 'all' ? 'All' : t === 'subbrokers' ? 'Sub-Brokers' : 'Brokers'}
          </button>
        ))}
      </div>

      {/* Search user — only on sub-brokers/brokers tabs */}
      {filter !== 'all' && (
        <div className="adm-ord-search-wrap">
          <i className="fas fa-search adm-ord-search-icon" />
          <input className="adm-ord-search" placeholder="Search user..." value={userSearch}
            onChange={e => setUserSearch(e.target.value)} />
        </div>
      )}

      <div className="adm-acc-showing">Showing: <strong>
        {filter === 'all' ? 'ALL' : filter === 'subbrokers' ? 'SUB_BROKER' : 'BROKER'}
      </strong></div>
      <div className="adm-cu-divider" />

      {/* Date filter */}
      <div className="adm-al-dates">
        <div className="adm-al-date-field">
          <label className="adm-al-label">From</label>
          <input type="date" className="adm-db-date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="adm-al-date-field">
          <label className="adm-al-label">To</label>
          <input type="date" className="adm-db-date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* Search + Export */}
      <div className="adm-acc-search-row">
        <div className="adm-ord-search-wrap" style={{ flex: 1 }}>
          <i className="fas fa-search adm-ord-search-icon" />
          <input className="adm-ord-search" placeholder="Search..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <button className="adm-acc-export-btn excel" onClick={handleExportExcel}>Export Excel</button>
        <button className="adm-acc-export-btn pdf" onClick={handleExportPdf}>Export PDF</button>
      </div>

      {/* Summary stat cards */}
      <div className="adm-acc-stats-grid">
        <div className="adm-acc-stat">
          <div className="adm-acc-stat-label">USER ID</div>
          <div className="adm-acc-stat-value">{summary.id}</div>
        </div>
        <div className="adm-acc-stat">
          <div className="adm-acc-stat-label">PNL + BKG</div>
          <div className="adm-acc-stat-value">{fmt(summary.pnlBkg)}</div>
        </div>
        <div className="adm-acc-stat">
          <div className="adm-acc-stat-label">CLIENT NET PNL</div>
          <div className="adm-acc-stat-value">{fmt(summary.clientNetPnl)}</div>
        </div>
        <div className="adm-acc-stat">
          <div className="adm-acc-stat-label">TOTAL BROKERAGE</div>
          <div className="adm-acc-stat-value">{fmt(summary.totalBrokerage)}</div>
        </div>
        <div className="adm-acc-stat wide">
          <div className="adm-acc-stat-label">SHARING BROKERAGE</div>
          <div className="adm-acc-stat-value">{fmt(summary.sharingBkg)}</div>
        </div>
        <div className="adm-acc-stat wide">
          <div className="adm-acc-stat-label">SHARING PNL</div>
          <div className="adm-acc-stat-value">
            {summary.sharingPnl === 0 ? '0' : fmt(summary.sharingPnl)}
          </div>
        </div>
      </div>

      {/* Broker detail card — only on sub-brokers/brokers tabs */}
      {filter !== 'all' && (
        <div className="adm-acc-broker-card">
          <div className="adm-acc-broker-top">
            <div>
              <div className="adm-acc-stat-label">USER ID</div>
              <div className="adm-acc-stat-value" style={{ fontSize: '1.3rem' }}>
                {filter === 'subbrokers' ? 'SDR001' : 'QPG446'}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="adm-acc-export-btn excel" style={{ fontSize: '0.72rem', padding: '6px 10px' }} onClick={handleExportExcel}>Export Excel</button>
              <button className="adm-acc-export-btn pdf" style={{ fontSize: '0.72rem', padding: '6px 10px' }} onClick={handleExportPdf}>Export PDF</button>
            </div>
          </div>
          <div className="adm-acc-broker-detail-grid">
            <div className="adm-acc-stat" style={{ background: '#0d1117' }}>
              <div className="adm-acc-stat-label">Sharing PNL</div>
              <div className="adm-acc-stat-value" style={{ fontSize: '0.95rem' }}>
                ₹{summary.sharingPnl === 0 ? '0' : fmt(summary.sharingPnl)}
              </div>
            </div>
            <div className="adm-acc-stat" style={{ background: '#0d1117' }}>
              <div className="adm-acc-stat-label">Sharing BKG</div>
              <div className="adm-acc-stat-value" style={{ fontSize: '0.95rem' }}>₹{fmt(summary.sharingBkg)}</div>
            </div>
            <div className="adm-acc-stat" style={{ background: '#0d1117' }}>
              <div className="adm-acc-stat-label">PNL + BKG</div>
              <div className="adm-acc-stat-value" style={{ fontSize: '0.95rem' }}>₹{fmt(summary.pnlBkg)}</div>
            </div>
            <div className="adm-acc-stat" style={{ background: '#0d1117' }}>
              <div className="adm-acc-stat-label">Client Net PNL</div>
              <div className="adm-acc-stat-value" style={{ fontSize: '0.95rem' }}>₹{fmt(summary.clientNetPnl)}</div>
            </div>
            <div className="adm-acc-stat wide" style={{ background: '#0d1117' }}>
              <div className="adm-acc-stat-label">Total Brokerage</div>
              <div className="adm-acc-stat-value" style={{ fontSize: '0.95rem' }}>₹{fmt(summary.totalBrokerage)}</div>
            </div>
          </div>
        </div>
      )}

      {/* User account cards */}
      <div className="adm-acc-list">
        {displayed.map((u, i) => (
          <div className="adm-acc-card" key={i}>
            <div className="adm-acc-card-top">
              <div>
                <div className="adm-acc-uid">{u.id}</div>
                <div className="adm-acc-name">{u.full_name}</div>
              </div>
              <div className="adm-acc-card-btns">
                <button className="adm-acc-xls">XLS</button>
                <button className="adm-acc-pdf">PDF</button>
              </div>
            </div>
            <div className="adm-acc-card-grid">
              <span className="adm-acc-dl">Net PNL</span>
              <span className="adm-acc-dv">₹{fmt(u.net_pnl)}</span>
              <span className="adm-acc-dl">Brokerage</span>
              <span className="adm-acc-dv">₹{fmt(u.brokerage)}</span>
              <span className="adm-acc-dl">PNL+BKG</span>
              <span className="adm-acc-dv">₹{fmt(u.pnl_bkg)}</span>
              <span className="adm-acc-dl">Settlement</span>
              <span className="adm-acc-dv">₹{fmt(u.settlement)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
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

// ─── PayIn/Out Page ───────────────────────────────────────────────────────────

function PayinOutPageImpl() {
  const [tab, setTab] = useState<'deposit' | 'withdrawal' | 'rules'>('deposit');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [status, setStatus] = useState('All Status');
  const [rows, setRows] = useState('10');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // Rules state
  const [withdrawEnabled, setWithdrawEnabled] = useState(true);
  const [allowedDays, setAllowedDays] = useState(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('16:00');
  const [minWithdraw, setMinWithdraw] = useState('100');
  const [minDeposit, setMinDeposit] = useState('1000');

  // Dynamic data state
  const [requests, setRequests] = useState<PayRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const allDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const toggleDay = (d: string) => setAllowedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  // Fetch requests whenever filters change (not for rules tab)
  useEffect(() => {
    if (tab === 'rules') return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    params.set('type', tab.toUpperCase());
    if (status !== 'All Status') params.set('status', status);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('rows', rows);
    apiCall(`/api/admin/payinout?${params.toString()}`, { method: 'GET' })
      .then(({ ok, status: httpStatus, data }) => {
        if (httpStatus === 401) { signOut(); return; }
        if (!ok) {
          const msg = (data as { error?: string })?.error ?? 'Failed to load requests';
          setError(msg);
          setRequests([]);
          return;
        }
        setRequests(data as PayRequest[]);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Network error');
        setRequests([]);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, dateFrom, dateTo, status, search, page, rows, refreshKey]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin_pay_requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pay_requests' },
        (payload) => {
          console.log('Realtime update received:', payload);
          setRefreshKey(prev => prev + 1);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('Realtime subscription active for pay_requests');
        } else if (status === 'CLOSED') {
          console.log('Realtime subscription closed');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('Realtime subscription error');
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Fetch rules when rules tab is opened
  useEffect(() => {
    if (tab !== 'rules') return;
    setRulesLoading(true);
    apiCall('/api/admin/payinout/rules', { method: 'GET' })
      .then(({ ok, status: httpStatus, data }) => {
        if (httpStatus === 401) { signOut(); return; }
        if (!ok) {
          setToast({ message: (data as { error?: string })?.error ?? 'Failed to load rules', type: 'error' });
          return;
        }
        const r = data as {
          withdraw_enabled: boolean; allowed_days: string[];
          start_time: string; end_time: string;
          min_withdraw: number; min_deposit: number;
        };
        setWithdrawEnabled(r.withdraw_enabled);
        setAllowedDays(r.allowed_days);
        setStartTime(r.start_time);
        setEndTime(r.end_time);
        setMinWithdraw(String(r.min_withdraw));
        setMinDeposit(String(r.min_deposit));
      })
      .catch((err: unknown) => {
        setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
      })
      .finally(() => setRulesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleAccept = async (r: PayRequest) => {
    setActionLoading(prev => ({ ...prev, [r.id]: true }));
    try {
      const { ok, status: httpStatus, data } = await apiCall(`/api/admin/payinout/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'approve' }),
      });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setToast({ message: (data as { error?: string })?.error ?? 'Failed to approve', type: 'error' });
        return;
      }
      setRequests(prev => prev.map(req => req.id === r.id ? { ...req, status: 'APPROVED' } : req));
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setActionLoading(prev => ({ ...prev, [r.id]: false }));
    }
  };

  const handleReject = async (r: PayRequest) => {
    setActionLoading(prev => ({ ...prev, [r.id]: true }));
    try {
      const { ok, status: httpStatus, data } = await apiCall(`/api/admin/payinout/${r.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reject' }),
      });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setToast({ message: (data as { error?: string })?.error ?? 'Failed to reject', type: 'error' });
        return;
      }
      setRequests(prev => prev.map(req => req.id === r.id ? { ...req, status: 'REJECTED' } : req));
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setActionLoading(prev => ({ ...prev, [r.id]: false }));
    }
  };

  const handleDelete = async (r: PayRequest) => {
    if (!window.confirm('Are you sure you want to delete this request?')) return;
    setActionLoading(prev => ({ ...prev, [r.id]: true }));
    try {
      const { ok, status: httpStatus, data } = await apiCall(`/api/admin/payinout/${r.id}`, {
        method: 'DELETE',
      });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setToast({ message: (data as { error?: string })?.error ?? 'Failed to delete', type: 'error' });
        return;
      }
      setRequests(prev => prev.filter(req => req.id !== r.id));
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setActionLoading(prev => { const next = { ...prev }; delete next[r.id]; return next; });
    }
  };

  const handleSaveRules = async () => {
    setRulesSaving(true);
    try {
      const { ok, status: httpStatus, data } = await apiCall('/api/admin/payinout/rules', {
        method: 'PUT',
        body: JSON.stringify({
          withdraw_enabled: withdrawEnabled,
          allowed_days: allowedDays,
          start_time: startTime,
          end_time: endTime,
          min_withdraw: Number(minWithdraw),
          min_deposit: Number(minDeposit),
        }),
      });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setToast({ message: (data as { error?: string })?.error ?? 'Failed to save rules', type: 'error' });
        return;
      }
      setToast({ message: 'Rules saved successfully', type: 'success' });
    } catch (err: unknown) {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setRulesSaving(false);
    }
  };

  const handleDownloadCsv = () => {
    const csv = toCsvPayRequests(requests);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const today = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payinout_${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rowsNum = Number(rows);
  const totalPages = Math.max(1, Math.ceil(requests.length / rowsNum));
  const displayed = requests.slice((page - 1) * rowsNum, page * rowsNum);

  const statusColor = (s: string) => s === 'APPROVED' ? '#2ea043' : s === 'PENDING' ? '#e3b341' : '#f85149';

  return (
    <div className="adm-pay-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <h2 className="adm-page-title">Pay In / Out</h2>

      {/* Tabs */}
      <div className="adm-pay-tabs">
        <button className={`adm-pay-tab ${tab === 'deposit' ? 'active' : ''}`} onClick={() => { setTab('deposit'); setPage(1); }}>Deposit Requests</button>
        <button className={`adm-pay-tab ${tab === 'withdrawal' ? 'active' : ''}`} onClick={() => { setTab('withdrawal'); setPage(1); }}>Withdrawal Requests</button>
        <button className={`adm-pay-tab ${tab === 'rules' ? 'active' : ''}`} onClick={() => setTab('rules')}>Rules</button>
      </div>

      {tab === 'rules' ? (
        <div className="adm-pay-rules">
          <div className="adm-upd-section-title">Wallet Rules</div>
          <div className="adm-pay-rules-sub">Configure withdrawal and deposit settings.</div>
          <div className="adm-cu-divider" />

          {rulesLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonLine key={i} height={36} />)}
            </div>
          ) : (<>
            <div className="adm-upd-section-title" style={{ fontSize: '0.95rem' }}>Withdrawal Rules</div>
            <div className="adm-pay-rule-row">
              <span className="adm-upd-label">Withdrawals Enabled</span>
              <div className={`adm-toggle ${withdrawEnabled ? 'on' : ''}`} onClick={() => setWithdrawEnabled(v => !v)}>
                <div className="adm-toggle-thumb" />
              </div>
            </div>
            <div className="adm-upd-field">
              <label className="adm-upd-label">Allowed Days</label>
              <div className="adm-pay-days-grid">
                {allDays.map(d => (
                  <label key={d} className="adm-cu-seg-item">
                    <input type="checkbox" className="adm-cu-checkbox" checked={allowedDays.includes(d)} onChange={() => toggleDay(d)} />
                    <span className="adm-cu-seg-label" style={{ color: '#e6edf3', fontSize: '0.8rem' }}>{d}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="adm-upd-grid2">
              <div className="adm-upd-field">
                <label className="adm-upd-label">Allowed Start Time</label>
                <input type="time" className="adm-upd-input" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="adm-upd-field">
                <label className="adm-upd-label">Allowed End Time</label>
                <input type="time" className="adm-upd-input" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
            <div className="adm-upd-field">
              <label className="adm-upd-label">Minimum Withdrawal Amount</label>
              <input className="adm-upd-input" value={minWithdraw} onChange={e => setMinWithdraw(e.target.value)} />
            </div>

            <div className="adm-cu-divider" />
            <div className="adm-upd-section-title" style={{ fontSize: '0.95rem' }}>Deposit Rules</div>
            <div className="adm-upd-field">
              <label className="adm-upd-label">Minimum Deposit Amount</label>
              <input className="adm-upd-input" value={minDeposit} onChange={e => setMinDeposit(e.target.value)} />
            </div>
            <div className="adm-cu-divider" />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="adm-btn-primary"
                style={{ padding: '12px 28px', fontSize: '0.9rem', borderRadius: 10 }}
                disabled={rulesSaving}
                onClick={handleSaveRules}
              >
                {rulesSaving ? 'Saving…' : 'Save Rules'}
              </button>
            </div>
          </>)}
        </div>
      ) : (<>
        {/* Filter Bar */}
        <div className="adm-card" style={{ padding: '12px 16px', marginBottom: 16 }}>
          <div className="adm-pay-controls" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div className="adm-al-date-field">
              <label className="adm-al-label" style={{ marginBottom: 4, display: 'block' }}>From</label>
              <input type="date" className="adm-db-date" style={{ width: '100%', boxSizing: 'border-box' }} value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="adm-al-date-field">
              <label className="adm-al-label" style={{ marginBottom: 4, display: 'block' }}>To</label>
              <input type="date" className="adm-db-date" style={{ width: '100%', boxSizing: 'border-box' }} value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <div className="adm-al-date-field">
              <label className="adm-al-label" style={{ marginBottom: 4, display: 'block' }}>Status</label>
              <select className="adm-ord-rows-select" style={{ width: '100%', height: 38 }} value={status} onChange={e => setStatus(e.target.value)}>
                {['All Status', 'APPROVED', 'PENDING', 'REJECTED'].map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="adm-al-date-field">
              <label className="adm-al-label" style={{ marginBottom: 4, display: 'block' }}>Rows</label>
              <select className="adm-ord-rows-select" style={{ width: '100%', height: 38 }} value={rows} onChange={e => { setRows(e.target.value); setPage(1); }}>
                {['10', '25', '50', '100'].map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, borderTop: '1px solid #21262d', paddingTop: 16 }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <i className="fas fa-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8b949e', fontSize: '0.8rem' }} />
              <input
                className="adm-ord-search"
                style={{ width: '100%', paddingLeft: 34, height: 38 }}
                placeholder="Search by username, reference id..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <button className="adm-pay-clear-btn" style={{ height: 38, padding: '0 20px' }} onClick={() => { setStatus('All Status'); setSearch(''); setDateFrom(''); setDateTo(''); }}>
              <i className="fas fa-times-circle" style={{ marginRight: 6 }} /> Clear
            </button>
            <button className="adm-btn-primary" style={{ height: 38, padding: '0 20px', background: '#238636' }} onClick={handleDownloadCsv}>
              <i className="fas fa-file-excel" style={{ marginRight: 6 }} /> Export
            </button>
          </div>
        </div>

        {/* Request cards */}
        <div className="adm-pay-list">
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} rows={5} />)}
            </div>
          ) : error ? (
            <div className="adm-mw-empty" style={{ color: '#f85149' }}>{error}</div>
          ) : displayed.length === 0 ? (
            <div className="adm-mw-empty">No requests found.</div>
          ) : displayed.map((r) => (
            <div className="adm-pay-card" key={r.id}>
              <div className="adm-pay-card-top">
                <div>
                  <div className="adm-pay-uid">{r.user_id}</div>
                  <div className="adm-pay-time">
                    <i className="far fa-clock" style={{ marginRight: 4, fontSize: '0.7rem' }} />
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  <div className="adm-pay-refid">ID: {r.id}</div>
                </div>
                <span className="adm-pay-status" style={{ background: statusColor(r.status) + '15', color: statusColor(r.status), border: `1px solid ${statusColor(r.status)}40` }}>
                  {r.status}
                </span>
              </div>

              <div className="adm-pay-grid">
                <div className="adm-pay-item">
                  <span className="adm-pay-dl">Transaction Type</span>
                  <span className="adm-pay-dv bold" style={{ color: r.type === 'DEPOSIT' ? '#2ea043' : '#f85149' }}>
                    {r.type === 'DEPOSIT' ? '↑ DEPOSIT' : '↓ WITHDRAWAL'}
                  </span>
                </div>
                <div className="adm-pay-item">
                  <span className="adm-pay-dl">Requested Amount</span>
                  <span className="adm-pay-dv bold" style={{ fontSize: '1.1rem' }}>₹{r.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="adm-pay-item">
                  <span className="adm-pay-dl">Last Updated</span>
                  <span className="adm-pay-dv">{new Date(r.updated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>

              {r.type === 'WITHDRAWAL' && r.account_name && (
                <div className="adm-pay-account-box">
                  <div className="adm-pay-account-title">Bank Account Details</div>
                  <div className="adm-pay-account-grid">
                    <span className="adm-pay-dl">Beneficiary</span><span className="adm-pay-dv bold">{r.account_name}</span>
                    <span className="adm-pay-dl">Account No</span><span className="adm-pay-dv" style={{ letterSpacing: '0.5px' }}>{r.account_no}</span>
                    <span className="adm-pay-dl">IFSC / UPI</span><span className="adm-pay-dv">{r.ifsc} / {r.upi}</span>
                  </div>
                </div>
              )}

              {r.type === 'DEPOSIT' && r.utr && (
                <div className="adm-pay-utr-box">
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span className="adm-pay-utr-label">Transaction Reference (UTR)</span>
                    <span className="adm-pay-utr-value">{r.utr}</span>
                  </div>
                  <i className="fas fa-shield-alt" style={{ color: '#58a6ff', fontSize: '1.2rem', opacity: 0.5 }} />
                </div>
              )}

              {r.type === 'DEPOSIT' && r.screenshot_url && (
                <div className="adm-pay-account-box" style={{ marginTop: '12px', border: '1px dashed #30363d' }}>
                  <div className="adm-pay-account-title">Payment Proof (Screenshot)</div>
                  <div style={{ marginTop: '8px', textAlign: 'center' }}>
                    <a href={r.screenshot_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', position: 'relative' }}>
                      <img
                        src={r.screenshot_url}
                        alt="Proof"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '200px',
                          borderRadius: '8px',
                          border: '1px solid #30363d',
                          cursor: 'pointer'
                        }}
                      />
                      <div style={{ position: 'absolute', bottom: 8, right: 8, background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 4, fontSize: '0.65rem', color: '#fff' }}>
                        Click to view full size
                      </div>
                    </a>
                  </div>
                </div>
              )}

              <div className="adm-pay-actions">
                <button
                  className="adm-pay-btn accept"
                  disabled={!!actionLoading[r.id] || r.status !== 'PENDING'}
                  onClick={() => handleAccept(r)}
                  style={{ opacity: r.status !== 'PENDING' ? 0.5 : 1 }}
                >
                  {actionLoading[r.id] ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-check" /> Approve</>}
                </button>
                <button
                  className="adm-pay-btn reject"
                  disabled={!!actionLoading[r.id] || r.status !== 'PENDING'}
                  onClick={() => handleReject(r)}
                  style={{ opacity: r.status !== 'PENDING' ? 0.5 : 1 }}
                >
                  {actionLoading[r.id] ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-times" /> Reject</>}
                </button>
                <button className="adm-pay-btn position"><i className="fas fa-chart-line" /> Position</button>
                <button className="adm-pay-btn ledger"><i className="fas fa-book" /> Ledger</button>
                <button
                  className="adm-pay-btn delete"
                  disabled={!!actionLoading[r.id]}
                  onClick={() => handleDelete(r)}
                >
                  {actionLoading[r.id] ? <i className="fas fa-spinner fa-spin" /> : <><i className="fas fa-trash-alt" /> Delete</>}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        <div className="adm-pos-pagination">
          <span className="adm-pos-page-info">Page {page} of {totalPages}</span>
          <div className="adm-pos-page-btns">
            <button className="adm-pos-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
            <button className="adm-pos-page-btn active-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
          </div>
        </div>
      </>)}
      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── Payment Accounts Page ────────────────────────────────────────────────────

type PaymentAccount = {
  id: string;
  account_holder: string;
  bank_name: string;
  account_no: string;
  ifsc: string;
  upi_id: string;
  qr_image_url: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type PAFormState = {
  account_holder: string;
  bank_name: string;
  account_no: string;
  ifsc: string;
  upi_id: string;
  sort_order: string;
  is_active: boolean;
  qr_image: File | null;
};

const emptyPAForm = (): PAFormState => ({
  account_holder: '',
  bank_name: '',
  account_no: '',
  ifsc: '',
  upi_id: '',
  sort_order: '0',
  is_active: true,
  qr_image: null,
});

function accountToForm(a: PaymentAccount): PAFormState {
  return {
    account_holder: a.account_holder,
    bank_name: a.bank_name,
    account_no: a.account_no,
    ifsc: a.ifsc,
    upi_id: a.upi_id,
    sort_order: String(a.sort_order),
    is_active: a.is_active,
    qr_image: null,
  };
}

function PaymentAccountsPageImpl() {
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [paLoading, setPaLoading] = useState(false);
  const [paError, setPaError] = useState<string | null>(null);
  const [paActionLoading, setPaActionLoading] = useState<Record<string, boolean>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccount | null>(null);
  const [paToast, setPaToast] = useState<ToastState>(null);

  // Form state (shared for add and edit)
  const [form, setForm] = useState<PAFormState>(emptyPAForm());
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Confirm dialog state for delete
  const [deleteTarget, setDeleteTarget] = useState<PaymentAccount | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchAccounts = async () => {
    setPaLoading(true);
    setPaError(null);
    try {
      const { ok, status: httpStatus, data } = await apiCall('/api/admin/payment-accounts', { method: 'GET' });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setPaError((data as { error?: string })?.error ?? 'Failed to load payment accounts');
        return;
      }
      setPaymentAccounts(data as PaymentAccount[]);
    } catch (err: unknown) {
      setPaError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setPaLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open add form
  const handleOpenAdd = () => {
    setEditingAccount(null);
    setForm(emptyPAForm());
    setShowAddForm(true);
  };

  // Open edit form
  const handleOpenEdit = (account: PaymentAccount) => {
    setShowAddForm(false);
    setEditingAccount(account);
    setForm(accountToForm(account));
  };

  // Cancel form
  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingAccount(null);
    setForm(emptyPAForm());
  };

  // Submit add or edit form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';

      const fd = new FormData();
      fd.append('account_holder', form.account_holder);
      fd.append('bank_name', form.bank_name);
      fd.append('account_no', form.account_no);
      fd.append('ifsc', form.ifsc);
      fd.append('upi_id', form.upi_id);
      fd.append('sort_order', form.sort_order);
      fd.append('is_active', String(form.is_active));
      if (form.qr_image) {
        fd.append('qr_image', form.qr_image);
      }

      if (editingAccount) {
        // PATCH existing account
        const res = await fetch(`/api/admin/payment-accounts/${editingAccount.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (res.status === 401) { signOut(); return; }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setPaToast({ message: (errData as { error?: string })?.error ?? 'Failed to update account', type: 'error' });
          return;
        }
        setPaToast({ message: 'Account updated successfully', type: 'success' });
        setEditingAccount(null);
        setForm(emptyPAForm());
        await fetchAccounts();
      } else {
        // POST new account
        const res = await fetch('/api/admin/payment-accounts', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (res.status === 401) { signOut(); return; }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setPaToast({ message: (errData as { error?: string })?.error ?? 'Failed to create account', type: 'error' });
          return;
        }
        setPaToast({ message: 'Account created successfully', type: 'success' });
        setShowAddForm(false);
        setForm(emptyPAForm());
        await fetchAccounts();
      }
    } catch (err: unknown) {
      setPaToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle active/inactive
  const handleToggleActive = async (account: PaymentAccount) => {
    setPaActionLoading(prev => ({ ...prev, [account.id]: true }));
    try {
      const { ok, status: httpStatus, data } = await apiCall(`/api/admin/payment-accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !account.is_active }),
      });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setPaToast({ message: (data as { error?: string })?.error ?? 'Failed to update account', type: 'error' });
        return;
      }
      setPaymentAccounts(prev =>
        prev.map(a => a.id === account.id ? { ...a, is_active: !account.is_active } : a),
      );
    } catch (err: unknown) {
      setPaToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setPaActionLoading(prev => ({ ...prev, [account.id]: false }));
    }
  };

  // Delete account
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { ok, status: httpStatus, data } = await apiCall(`/api/admin/payment-accounts/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setPaToast({ message: (data as { error?: string })?.error ?? 'Failed to delete account', type: 'error' });
        return;
      }
      setPaymentAccounts(prev => prev.filter(a => a.id !== deleteTarget.id));
      setPaToast({ message: 'Account deleted', type: 'success' });
      setDeleteTarget(null);
    } catch (err: unknown) {
      setPaToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const formTitle = editingAccount ? 'Edit Payment Account' : 'Add Payment Account';
  const isFormOpen = showAddForm || editingAccount !== null;

  return (
    <div className="adm-page">
      <Toast toast={paToast} onDismiss={() => setPaToast(null)} />

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete account "${deleteTarget.account_holder}" (${deleteTarget.bank_name})? This cannot be undone.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 className="adm-page-title" style={{ margin: 0 }}>Payment Accounts</h2>
        {!isFormOpen && (
          <button className="adm-btn-primary" onClick={handleOpenAdd}>
            + Add Account
          </button>
        )}
      </div>

      {/* Add / Edit Form */}
      {isFormOpen && (
        <div className="adm-card" style={{ marginBottom: 20 }}>
          <div className="adm-upd-section-title" style={{ marginBottom: 16 }}>{formTitle}</div>
          <form onSubmit={handleFormSubmit}>
            <div className="adm-upd-grid2">
              <div className="adm-upd-field">
                <label className="adm-upd-label">Account Holder *</label>
                <input
                  className="adm-upd-input"
                  value={form.account_holder}
                  onChange={e => setForm(f => ({ ...f, account_holder: e.target.value }))}
                  required
                  placeholder="e.g. John Doe"
                />
              </div>
              <div className="adm-upd-field">
                <label className="adm-upd-label">Bank Name *</label>
                <input
                  className="adm-upd-input"
                  value={form.bank_name}
                  onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                  required
                  placeholder="e.g. HDFC Bank"
                />
              </div>
              <div className="adm-upd-field">
                <label className="adm-upd-label">Account Number *</label>
                <input
                  className="adm-upd-input"
                  value={form.account_no}
                  onChange={e => setForm(f => ({ ...f, account_no: e.target.value }))}
                  required
                  placeholder="e.g. 1234567890"
                />
              </div>
              <div className="adm-upd-field">
                <label className="adm-upd-label">IFSC Code *</label>
                <input
                  className="adm-upd-input"
                  value={form.ifsc}
                  onChange={e => setForm(f => ({ ...f, ifsc: e.target.value }))}
                  required
                  placeholder="e.g. HDFC0001234"
                />
              </div>
              <div className="adm-upd-field">
                <label className="adm-upd-label">UPI ID *</label>
                <input
                  className="adm-upd-input"
                  value={form.upi_id}
                  onChange={e => setForm(f => ({ ...f, upi_id: e.target.value }))}
                  required
                  placeholder="e.g. name@upi"
                />
              </div>
              <div className="adm-upd-field">
                <label className="adm-upd-label">Sort Order</label>
                <input
                  type="number"
                  className="adm-upd-input"
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="adm-upd-field" style={{ marginTop: 12 }}>
              <label className="adm-upd-label">
                QR Image (Optional - auto-generated from UPI ID)
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png"
                style={{ color: '#e6edf3', fontSize: '0.875rem' }}
                onChange={e => setForm(f => ({ ...f, qr_image: e.target.files?.[0] ?? null }))}
              />
            </div>

            <div className="adm-pay-rule-row" style={{ marginTop: 12 }}>
              <span className="adm-upd-label">Active</span>
              <div
                className={`adm-toggle ${form.is_active ? 'on' : ''}`}
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              >
                <div className="adm-toggle-thumb" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button type="submit" className="adm-btn-primary" disabled={formSubmitting}>
                {formSubmitting ? 'Saving…' : editingAccount ? 'Update Account' : 'Create Account'}
              </button>
              <button type="button" className="adm-sheet-cancel" onClick={handleCancelForm} disabled={formSubmitting}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Account list */}
      {paLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} rows={6} />)}
        </div>
      ) : paError ? (
        <div className="adm-mw-empty" style={{ color: '#f85149' }}>{paError}</div>
      ) : paymentAccounts.length === 0 ? (
        <div className="adm-mw-empty">No payment accounts found. Add one to get started.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {paymentAccounts.map(account => (
            <div className="adm-pay-card" key={account.id}>
              <div className="adm-pay-card-top">
                <div>
                  <div className="adm-pay-uid">{account.account_holder}</div>
                  <div className="adm-pay-time">{account.bank_name}</div>
                  <div className="adm-pay-refid">{account.id}</div>
                </div>
                <span
                  className="adm-pay-status"
                  style={{
                    background: account.is_active ? '#2ea04322' : '#f8514922',
                    color: account.is_active ? '#2ea043' : '#f85149',
                    border: `1px solid ${account.is_active ? '#2ea043' : '#f85149'}`,
                  }}
                >
                  {account.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="adm-pay-grid">
                <span className="adm-pay-dl">Account No</span>
                <span className="adm-pay-dv bold">{account.account_no}</span>
                <span className="adm-pay-dl">IFSC</span>
                <span className="adm-pay-dv">{account.ifsc}</span>
                <span className="adm-pay-dl">UPI ID</span>
                <span className="adm-pay-dv">{account.upi_id}</span>
                <span className="adm-pay-dl">Sort Order</span>
                <span className="adm-pay-dv">{account.sort_order}</span>
              </div>

              {account.qr_image_url && (
                <div style={{ marginTop: 10 }}>
                  <div className="adm-pay-dl" style={{ marginBottom: 6 }}>QR Code</div>
                  <img
                    src={account.qr_image_url}
                    alt={`QR code for ${account.account_holder}`}
                    style={{
                      width: 80,
                      height: 80,
                      objectFit: 'cover',
                      borderRadius: 6,
                      border: '1px solid #30363d',
                    }}
                  />
                </div>
              )}

              <div className="adm-pay-actions" style={{ marginTop: 12 }}>
                <button
                  className="adm-pay-btn accept"
                  disabled={!!paActionLoading[account.id]}
                  onClick={() => handleOpenEdit(account)}
                >
                  Edit
                </button>
                <button
                  className="adm-pay-btn"
                  style={{
                    background: account.is_active ? '#7c2d1222' : '#16532422',
                    color: account.is_active ? '#fca5a5' : '#86efac',
                    border: `1px solid ${account.is_active ? '#fca5a5' : '#86efac'}`,
                    borderRadius: 6,
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    cursor: paActionLoading[account.id] ? 'not-allowed' : 'pointer',
                    opacity: paActionLoading[account.id] ? 0.6 : 1,
                  }}
                  disabled={!!paActionLoading[account.id]}
                  onClick={() => handleToggleActive(account)}
                >
                  {paActionLoading[account.id] ? '…' : account.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  className="adm-pay-btn delete"
                  disabled={!!paActionLoading[account.id]}
                  onClick={() => setDeleteTarget(account)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
