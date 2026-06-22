'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, getRole, signOut } from '@/lib/auth';
import KiteConnectButton from '@/components/KiteConnectButton';
import '../admin-layout.css';

export type AdminUserPayload = {
  id: string;
  role: string;
};

// Modular Components
import TelegramPage from '@/components/admin/TelegramPage';
import SettingsPage from '@/components/admin/SettingsPage';
import MarketWatchPage from '@/components/admin/MarketWatchPage';
import DashboardPage from '@/components/admin/DashboardPage';
import OrdersPage from '@/components/admin/OrdersPage';
import PositionPage from '@/components/admin/PositionPage';
import UpdatePage from '@/components/admin/UpdatePage';
import UsersPage from '@/components/admin/UsersPage';
import CreateUserForm from '@/components/admin/CreateUserForm';
import ActLedgerPage from '@/components/admin/ActLedgerPage';
import AccountsPage from '@/components/admin/AccountsPage';
import PayinOutPage from '@/components/admin/PayinOutPage';
import PayAccountsPage from '@/components/admin/PayAccountsPage';
import TransactionsPage from '@/components/admin/TransactionsPage';
import UserPanel from '@/components/admin/UserPanel';

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
  { key: 'transactions', label: 'TRANSACTIONS' },
  { key: 'logout', label: 'LOGOUT' },
];

export default function AdminPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [userPanelOpen, setUserPanelOpen] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [activePage, setActivePage] = useState('marketwatch');
  const [selectedUser, setSelectedUser] = useState<AdminUserPayload>({ id: '', role: '' });
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
        <div style={{ padding: '16px', borderTop: '1px solid #21262d', marginTop: 'auto' }}>
          <KiteConnectButton />
        </div>
      </div>

      <UserPanel
        open={userPanelOpen}
        onClose={() => setUserPanelOpen(false)}
        onCreateUser={() => { setUserPanelOpen(false); setCreatingUser(true); }}
        selectedUser={selectedUser}
        onSelectUser={(u) => { setSelectedUser(u); setUserPanelOpen(false); }}
      />

      <div className="adm-main-area">
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

        <div className="adm-content">
          <PageContent
            activePage={activePage}
            selectedUser={selectedUser}
            onSelectUser={(u) => { setSelectedUser(u); setUserPanelOpen(false); }}
            onOpenUserPanel={() => setUserPanelOpen(true)}
            onNavigate={(page) => { setActivePage(page); }}
          />
        </div>
      </div>
    </div>
  );
}

function PageContent({ activePage, selectedUser, onSelectUser, onOpenUserPanel, onNavigate }: {
  activePage: string;
  selectedUser: AdminUserPayload;
  onSelectUser: (u: AdminUserPayload) => void;
  onOpenUserPanel: () => void;
  onNavigate: (page: string) => void;
}) {
  const show = (key: string) => ({ display: activePage === key ? undefined : 'none' } as React.CSSProperties);

  return (
    <>
      <div style={show('telegram')}><TelegramPage /></div>
      <div style={show('settings')}><SettingsPage /></div>
      <div style={show('marketwatch')}><MarketWatchPage /></div>
      <div style={show('dashboard')}><DashboardPage selectedUser={selectedUser} onOpenUserPanel={onOpenUserPanel} /></div>
      <div style={show('orders')}><OrdersPage selectedUser={selectedUser} onOpenUserPanel={onOpenUserPanel} /></div>
      <div style={show('position')}><PositionPage selectedUser={selectedUser} onOpenUserPanel={onOpenUserPanel} /></div>
      <div style={show('update')}><UpdatePage selectedUser={selectedUser} onOpenUserPanel={onOpenUserPanel} /></div>
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
      <div style={show('actledger')}><ActLedgerPage selectedUser={selectedUser} onOpenUserPanel={onOpenUserPanel} /></div>
      <div style={show('accounts')}><AccountsPage /></div>
      <div style={show('payinout')}><PayinOutPage /></div>
      <div style={show('transactions')}><TransactionsPage /></div>
      <div style={show('paymentaccounts')}><PayAccountsPage /></div>
    </>
  );
}
