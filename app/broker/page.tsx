'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { signOut } from '@/lib/auth';
import '../admin-layout.css';
import './page.css';

// --- Constants ---
const PAGE_SIZE = 20;

// --- Types ---
type NavPage = 'dashboard' | 'users' | 'position' | 'order' | 'actledger' | 'accounts' | 'payinout';

type ToastState = { message: string; type: 'success' | 'error' | 'info' } | null;

interface UserProfile {
  id: string;
  email: string;
  role: string;
  full_name: string | null;
  balance?: number;
  phone?: string;
}

interface UserListItem extends UserProfile {
  active: boolean;
  ledgerBal: number;
  mAvailable: number;
  openPnl: number;
  m2m: number;
  weeklyPnl: number;
  alltimePnl: number;
  marginUsed: number;
  holdingMargin: number;
}

// --- Icons Mapping ---
const navItems: { id: NavPage; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'fas fa-th-large' },
  { id: 'users', label: 'Users', icon: 'fas fa-users' },
  { id: 'position', label: 'Positions', icon: 'fas fa-chart-pie' },
  { id: 'order', label: 'Orders', icon: 'fas fa-list-ul' },
  { id: 'actledger', label: 'Activity Logs', icon: 'fas fa-history' },
  { id: 'accounts', label: 'P&L Accounts', icon: 'fas fa-wallet' },
  { id: 'payinout', label: 'Pay In / Out', icon: 'fas fa-exchange-alt' },
];

// --- Shared Components ---

const Toast = ({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) => {
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <div className={`adm-toast ${toast.type}`}>
      <div className="adm-toast-content">
        <i className={`fas ${toast.type === 'success' ? 'fa-check-circle' : toast.type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}`} />
        <span>{toast.message}</span>
      </div>
      <button className="adm-toast-close" onClick={onDismiss}>✕</button>
    </div>
  );
};

const SkeletonLine = ({ width = '100%', height = 12, style = {} }: { width?: string | number; height?: string | number; style?: React.CSSProperties }) => (
  <div className="adm-skeleton" style={{ width, height, ...style }} />
);

// --- Main Page Component ---

export default function BrokerPage() {
  const router = useRouter();
  const [broker, setBroker] = useState<UserProfile | null>(null);
  const [activePage, setActivePage] = useState<NavPage>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; role: string } | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const apiCall = useCallback(async (url: string, options: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      signOut();
      router.replace('/login');
      return { ok: false, status: 401, data: null };
    }
    const headers = {
      ...options.headers,
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    };
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  }, [router]);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      
      const { ok, data } = await apiCall('/api/broker/users/me');
      if (ok) {
        if (!['broker', 'admin', 'super_admin'].includes(data.role)) {
          router.replace('/');
          return;
        }
        setBroker(data as UserProfile);
      } else {
        router.replace('/login');
      }
      setAuthLoading(false);
    };
    checkAuth();
  }, [apiCall, router]);

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  if (authLoading) {
    return (
      <div className="adm-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="adm-loader" />
      </div>
    );
  }

  return (
    <div className="adm-root adm-dark brk-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      
      {/* Drawer (Sidebar) */}
      {sidebarOpen && <div className="adm-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`adm-drawer ${sidebarOpen ? 'open' : ''}`}>
        <button className="adm-drawer-close" onClick={() => setSidebarOpen(false)}>✕</button>
        <div className="adm-drawer-brand">
          BROKER<span style={{ color: '#2ea043' }}>PANEL</span>
        </div>
        <nav className="adm-nav">
          {navItems.map(item => (
            <button
              key={item.id}
              className={`adm-nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => { setActivePage(item.id); setSidebarOpen(false); }}
            >
              <i className={`${item.icon} adm-nav-icon`} style={{ width: '20px', display: 'inline-block', textAlign: 'center', marginRight: '10px' }} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div style={{ padding: '16px', borderTop: '1px solid #21262d', marginTop: 'auto' }}>
          <div style={{ fontSize: '0.82rem', color: '#8b949e', fontWeight: 500, marginBottom: '10px', wordBreak: 'break-all' }}>
            {broker?.full_name || broker?.email}
          </div>
          <button className="adm-btn-ghost" onClick={handleLogout} style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '8px' }}>
            <i className="fas fa-sign-out-alt" /> Logout
          </button>
        </div>
      </aside>

      {/* Content Area */}
      <main className="adm-main-area">
        {/* Top Bar */}
        <header className="adm-topbar">
          <button className="adm-hamburger" onClick={() => setSidebarOpen(true)}>
            <span /><span /><span />
          </button>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#e6edf3' }}>
            BROKER<span style={{ color: '#006400' }}>PANEL</span>
          </div>
          <button className="adm-hamburger-right" onClick={handleLogout}>
            <span /><span /><span />
          </button>
        </header>

        <div className="adm-content">
          <div className="adm-page-header">
            <h1 className="adm-page-title">{navItems.find(n => n.id === activePage)?.label}</h1>
            <div className="adm-breadcrumb">
              <span>Broker</span>
              <i className="fas fa-chevron-right" />
              <span>{navItems.find(n => n.id === activePage)?.label}</span>
            </div>
          </div>

          <PageContent 
            page={activePage} 
            broker={broker} 
            apiCall={apiCall} 
            setToast={setToast}
            setSelectedUser={setSelectedUser}
            selectedUser={selectedUser}
            onNavigate={setActivePage}
          />
        </div>
      </main>
    </div>
  );
}

// --- Page Switcher ---

function PageContent({ page, broker, apiCall, setToast, setSelectedUser, selectedUser, onNavigate }: any) {
  switch (page) {
    case 'dashboard': return <BrokerDashboard apiCall={apiCall} onNavigate={onNavigate} onSelectUser={setSelectedUser} />;
    case 'users': return <BrokerUsers apiCall={apiCall} onSelectUser={setSelectedUser} onNavigate={onNavigate} />;
    case 'position': return <BrokerPositions apiCall={apiCall} selectedUser={selectedUser} />;
    case 'order': return <BrokerOrders apiCall={apiCall} selectedUser={selectedUser} />;
    default: return (
      <div className="adm-card" style={{ padding: 40, textAlign: 'center' }}>
        <i className="fas fa-tools" style={{ fontSize: '3rem', color: '#30363d', marginBottom: 20 }} />
        <h2 style={{ color: '#e6edf3' }}>Section Under Construction</h2>
        <p style={{ color: '#8b949e' }}>This module is currently being optimized for the Broker Panel.</p>
      </div>
    );
  }
}

// --- Sub-Pages ---

function BrokerDashboard({ apiCall, onNavigate, onSelectUser }: any) {
  const [stats, setStats] = useState({ totalUsers: 0, activeUsers: 0, todayPnl: 0 });
  const [recentUsers, setRecentUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const { ok, data } = await apiCall('/api/broker/users');
      if (ok) {
        const users = data as UserListItem[];
        setStats({
          totalUsers: users.length,
          activeUsers: users.filter(u => u.active).length,
          todayPnl: users.reduce((acc, u) => acc + (u.openPnl || 0), 0),
        });
        setRecentUsers(users.slice(0, 5));
      }
      setLoading(false);
    };
    fetchData();
  }, [apiCall]);

  return (
    <div className="adm-db-root">
      <div className="adm-db-section">
        <div className="adm-db-section-header">
          <span className="adm-db-section-title">BROKER SUMMARY</span>
        </div>
        <div className="adm-db-grid">
          <div className="adm-db-cell">
            <div className="adm-db-cell-label">TOTAL USERS</div>
            <div className="adm-db-cell-value">{loading ? '...' : stats.totalUsers}</div>
          </div>
          <div className="adm-db-cell">
            <div className="adm-db-cell-label">ACTIVE USERS</div>
            <div className="adm-db-cell-value">{loading ? '...' : stats.activeUsers}</div>
          </div>
          <div className="adm-db-cell">
            <div className="adm-db-cell-label">TOTAL OPEN P&L</div>
            <div className={`adm-db-cell-value ${stats.todayPnl >= 0 ? 'pos' : 'neg'}`}>
              ₹{loading ? '...' : stats.todayPnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      <div className="adm-card" style={{ marginTop: 24 }}>
        <div className="adm-card-header">
          <h3 className="adm-card-title">My Recent Users</h3>
          <button className="adm-btn-ghost" onClick={() => onNavigate('users')}>View All</button>
        </div>
        <div className="adm-ord-list" style={{ marginTop: 16 }}>
          {loading ? Array.from({length:3}).map((_,i)=><SkeletonLine key={i} height={80} style={{ marginBottom: 12 }} />) : 
            recentUsers.map(u => (
                <div key={u.id} className="adm-ord-card">
                    <div className="adm-ord-card-top">
                        <div>
                            <div className="adm-ord-symbol">{u.id}</div>
                            <div className="adm-ord-user">{u.full_name || 'No Name'}</div>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '4px 8px', borderRadius: '4px', background: u.active ? '#2ea0431a' : '#f851491a', color: u.active ? '#2ea043' : '#f85149' }}>
                          {u.active ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                        <button className="adm-btn-primary" style={{ padding: '6px 16px' }} onClick={() => { onSelectUser({ id: u.id, role: u.role }); onNavigate('position'); }}>View Positions</button>
                    </div>
                </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

function BrokerUsers({ apiCall, onSelectUser, onNavigate }: any) {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiCall('/api/broker/users').then(({ ok, data }: any) => {
      if (ok) setUsers(data);
      setLoading(false);
    });
  }, [apiCall]);

  const filtered = users.filter(u => 
    u.id.toLowerCase().includes(search.toLowerCase()) || 
    (u.full_name || '').toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="adm-page">
      <div className="adm-ord-search-wrap">
        <i className="fas fa-search adm-ord-search-icon" style={{ position: 'absolute', left: 14, top: 14, color: '#8b949e' }} />
        <input 
            className="adm-input" 
            style={{ paddingLeft: 40, width: '100%', maxWidth: 400 }}
            placeholder="Search by ID or Name..." 
            value={search} 
            onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="adm-ord-list" style={{ marginTop: 16 }}>
        {loading ? Array.from({length:4}).map((_,i)=><SkeletonLine key={i} height={180} style={{ marginBottom: 12 }} />) : 
          filtered.map((u: any) => (
            <div className="adm-ord-card" key={u.id} style={{ padding: 16 }}>
                <div className="adm-ord-card-top" style={{ marginBottom: 16 }}>
                    <div>
                        <div className="adm-ord-symbol" style={{ fontSize: '1.2rem' }}>{u.id} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#8b949e', border: '1px solid #30363d', padding: '2px 6px', borderRadius: 4, marginLeft: 6, verticalAlign: 'middle' }}>{u.role}</span></div>
                        <div className="adm-ord-user" style={{ fontSize: '0.9rem', marginTop: 4 }}>{u.full_name || 'N/A'}</div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '4px 8px', borderRadius: '4px', background: u.active ? '#2ea0431a' : '#f851491a', color: u.active ? '#2ea043' : '#f85149' }}>
                        {u.active ? 'Active' : 'Inactive'}
                    </span>
                </div>
                
                <div className="adm-db-grid" style={{ gap: 12, marginBottom: 16 }}>
                    <div className="adm-db-cell">
                        <div className="adm-db-cell-label">Balance</div>
                        <div className="adm-db-cell-value">₹{fmt(u.balance || 0)}</div>
                    </div>
                    <div className="adm-db-cell">
                        <div className="adm-db-cell-label">M2M</div>
                        <div className={`adm-db-cell-value ${u.m2m >= 0 ? 'pos' : 'neg'}`}>₹{fmt(u.m2m || 0)}</div>
                    </div>
                    <div className="adm-db-cell">
                        <div className="adm-db-cell-label">Open PnL</div>
                        <div className={`adm-db-cell-value ${u.openPnl >= 0 ? 'pos' : 'neg'}`}>₹{fmt(u.openPnl || 0)}</div>
                    </div>
                    <div className="adm-db-cell">
                        <div className="adm-db-cell-label">Weekly PnL</div>
                        <div className={`adm-db-cell-value ${u.weeklyPnl >= 0 ? 'pos' : 'neg'}`}>₹{fmt(u.weeklyPnl || 0)}</div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                    <button className="adm-btn-primary" style={{ flex: 1 }} onClick={() => { onSelectUser({ id: u.id, role: u.role }); onNavigate('position'); }}>View Positions</button>
                    <button className="adm-btn-ghost" style={{ flex: 1 }} onClick={() => { onSelectUser({ id: u.id, role: u.role }); onNavigate('order'); }}>View Orders</button>
                </div>
            </div>
          ))
        }
      </div>
    </div>
  );
}

function BrokerPositions({ apiCall, selectedUser }: any) {
  const [positions, setPositions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [uid, setUid] = useState(selectedUser?.id || '');

  useEffect(() => {
    if (uid) {
      setLoading(true);
      apiCall(`/api/broker/accounts?user_id=${uid}`).then(({ ok, data }: any) => {
        if (ok) setPositions(data);
        setLoading(false);
      });
    }
  }, [apiCall, uid]);

  if (!uid) return (
    <div className="adm-card" style={{ padding: 60, textAlign: 'center' }}>
        <i className="fas fa-user-circle" style={{ fontSize: '3rem', color: '#30363d', marginBottom: 20 }} />
        <h3 style={{ color: '#8b949e' }}>Please select a user from the Users tab first.</h3>
    </div>
  );

  return (
    <div className="adm-pos-root">
       <div className="adm-pos-stat-card">
            <div className="adm-pos-stat-label">SELECTED USER</div>
            <div className="adm-pos-stat-value">{uid}</div>
       </div>

       <div className="adm-card">
         <div className="adm-card-header">
            <h3 className="adm-card-title">Live Positions</h3>
         </div>
         {loading ? <SkeletonLine height={200}/> : 
           positions.length === 0 ? (
             <div className="adm-mw-empty">No active positions found for this user.</div>
           ) : (
             <div className="adm-ord-list">
                {positions.map((p, i) => (
                    <div key={i} className="adm-ord-card">
                        <div className="adm-ord-card-top">
                            <div>
                                <div className="adm-ord-symbol">{p.symbol}</div>
                                <div className="adm-ord-user">Qty: {p.qty}</div>
                            </div>
                            <div className={`adm-pos-pnl ${p.pnl >= 0 ? 'pos' : 'neg'}`}>
                                ₹{p.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>
                ))}
             </div>
           )}
       </div>
    </div>
  );
}

function BrokerOrders({ apiCall, selectedUser }: any) {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'executed' | 'limit' | 'rejected'>('executed');
  const uid = selectedUser?.id;

  useEffect(() => {
    if (uid) {
        setLoading(true);
        apiCall(`/api/broker/orders?user_id=${uid}&tab=${tab}`).then(({ ok, data }: any) => {
            if (ok) setOrders(data);
            setLoading(false);
        });
    }
  }, [apiCall, uid, tab]);

  if (!uid) return (
    <div className="adm-card" style={{ padding: 60, textAlign: 'center' }}>
        <i className="fas fa-list-alt" style={{ fontSize: '3rem', color: '#30363d', marginBottom: 20 }} />
        <h3 style={{ color: '#8b949e' }}>Please select a user from the Users tab first.</h3>
    </div>
  );

  return (
    <div className="adm-ord-root">
       <div className="adm-ord-stat">
            <div className="adm-ord-stat-label">SELECTED USER</div>
            <div className="adm-ord-stat-value">{uid}</div>
       </div>

       <div className="adm-ord-tabs" style={{ marginBottom: 16 }}>
        {(['executed', 'limit', 'rejected'] as const).map(t => (
          <button
            key={t}
            className={`adm-ord-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

       <div className="adm-card">
            {loading ? <SkeletonLine height={200}/> : 
              orders.length === 0 ? (
                <div className="adm-mw-empty">No {tab} orders found for this user.</div>
              ) : (
                <div className="adm-ord-list">
                    {orders.map((o: any, i: number) => (
                        <div key={i} className="adm-ord-card">
                            <div className="adm-ord-card-top">
                                <div>
                                    <div className="adm-ord-symbol">{o.symbol}</div>
                                    <div className="adm-ord-user">Qty: {o.qty} @ {o.price}</div>
                                </div>
                                <span className={`adm-ord-side ${o.side === 'BUY' ? 'buy' : 'sell'}`}>{o.side}</span>
                            </div>
                        </div>
                    ))}
                </div>
              )
            }
       </div>
    </div>
  );
}
