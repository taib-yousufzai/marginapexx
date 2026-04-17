'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession, getRole, signOut } from '@/lib/auth';
import './page.css';

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
  const [selectedUser, setSelectedUser] = useState<{ id: string; role: string }>(DEMO_USERS[0]);

  // Route guard — Supabase session + admin role check
  useEffect(() => {
    getSession().then((session) => {
      if (!session) {
        router.replace('/login');
        return;
      }
      const role = getRole(session.user);
      if (role !== 'admin') {
        router.replace('/');
        return;
      }
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
          <button className="adm-hamburger" onClick={() => {}}>
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
        </nav>
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
            onNavigate={(page) => { setActivePage(page); }}
          />
        </div>
      </div>{/* end adm-main-area */}
    </div>
  );
}

// Forward declarations to fix Turbopack hoisting
function AccountsPage() { return <AccountsPageImpl />; }
function PayinOutPage()  { return <PayinOutPageImpl />; }

function PageContent({ activePage, selectedUser, onSelectUser, onNavigate }: {
  activePage: string;
  selectedUser: { id: string; role: string };
  onSelectUser: (u: { id: string; role: string }) => void;
  onNavigate: (page: string) => void;
}) {
  const titles: Record<string, string> = {
    telegram: 'Telegram Bot',
    settings: 'Settings',
    marketwatch: 'Market Watch',
    dashboard: 'Dashboard',
    orders: 'Orders',
    position: 'Position',
    update: 'Update',
    users: 'Users',
    actledger: 'Act Ledger',
    accounts: 'Accounts',
    payinout: 'Payin-Out',
    logout: 'Logout',
  };

  if (activePage === 'telegram') return <TelegramPage />;
  if (activePage === 'settings') return <SettingsPage />;
  if (activePage === 'marketwatch') return <MarketWatchPage />;
  if (activePage === 'dashboard') return <DashboardPage selectedUser={selectedUser} />;
  if (activePage === 'orders') return <OrdersPage selectedUser={selectedUser} />;
  if (activePage === 'position') return <PositionPage selectedUser={selectedUser} />;
  if (activePage === 'update') return <UpdatePage selectedUser={selectedUser} />;
  if (activePage === 'users') return <UsersPage selectedUser={selectedUser} onSelectUser={onSelectUser} onNavigate={onNavigate} />;
  if (activePage === 'actledger') return <ActLedgerPage />;
  if (activePage === 'accounts') return <AccountsPage />;
  if (activePage === 'payinout') return <PayinOutPage />;

  return (
    <div className="adm-page">
      <h2 className="adm-page-title">{titles[activePage] ?? activePage}</h2>
      <div className="adm-card">
        <div className="adm-empty-state">No data available</div>
      </div>
    </div>
  );
}

// ─── Default stocks ───────────────────────────────────────────────────────────
const DEFAULT_SCRIPTS = [
  { symbol: 'ETHUSD',    lotSize: 35 },
  { symbol: 'XRPUSD',   lotSize: 60000 },
  { symbol: 'LTCUSD',   lotSize: 1400 },
  { symbol: 'SOLUSD',   lotSize: 900 },
  { symbol: 'BNBUSD',   lotSize: 200 },
  { symbol: 'ADAUSD',   lotSize: 15000 },
  { symbol: 'DOTUSD',   lotSize: 2500 },
  { symbol: 'MATICUSD', lotSize: 20000 },
  { symbol: 'LINKUSD',  lotSize: 1200 },
  { symbol: 'AVAXUSD',  lotSize: 500 },
  { symbol: 'ATOMUSD',  lotSize: 800 },
  { symbol: 'UNIUSD',   lotSize: 1800 },
  { symbol: 'AAVEUSD',  lotSize: 60 },
  { symbol: 'FILUSD',   lotSize: 700 },
  { symbol: 'TRXUSD',   lotSize: 80000 },
  // Equity / Forex
  { symbol: 'NIFTY',    lotSize: 50 },
  { symbol: 'BANKNIFTY',lotSize: 25 },
  { symbol: 'SENSEX',   lotSize: 15 },
  { symbol: 'FINNIFTY', lotSize: 40 },
  { symbol: 'MIDCPNIFTY',lotSize: 75 },
  { symbol: 'EURUSD',   lotSize: 100000 },
  { symbol: 'GBPUSD',   lotSize: 100000 },
  { symbol: 'USDJPY',   lotSize: 100000 },
  { symbol: 'AUDUSD',   lotSize: 100000 },
  { symbol: 'USDCAD',   lotSize: 100000 },
  // Commodities
  { symbol: 'XAUUSD',   lotSize: 100 },
  { symbol: 'XAGUSD',   lotSize: 5000 },
  { symbol: 'CRUDEOIL', lotSize: 100 },
  { symbol: 'NATURALGAS',lotSize: 10000 },
  { symbol: 'BTCUSD',   lotSize: 1 },
];

type Script = { symbol: string; lotSize: number };

function SettingsPage() {
  const [scripts, setScripts] = useState<Script[]>(DEFAULT_SCRIPTS);
  const [showModal, setShowModal] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [formSymbol, setFormSymbol] = useState('');
  const [formLot, setFormLot] = useState('');

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
    const entry: Script = { symbol: formSymbol.trim().toUpperCase(), lotSize: Number(formLot) };
    if (editIdx !== null) {
      setScripts(prev => prev.map((s, i) => i === editIdx ? entry : s));
    } else {
      setScripts(prev => [...prev, entry]);
    }
    setShowModal(false);
  };

  const handleDelete = (i: number) => {
    setScripts(prev => prev.filter((_, j) => j !== i));
  };

  const handleClose = () => {
    setShowModal(false);
    setEditIdx(null);
  };

  return (
    <div className="adm-page">
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

// Static per-user data — only the 5 original sections
const USER_DATA: Record<string, Record<string, string>> = {
  QEE875: {
    'LEDGER BALANCE': '0', 'MARK-TO-MARKET': '0',
    'NET': '17,800', 'TOTAL DEPOSITS': '27,800', 'TOTAL WITHDRAWALS': '10,000', 'AVG DEPOSIT': '2,138.462', 'AVG WITHDRAWAL': '10,000',
    'REGISTERED': '1', 'ADDED FUNDS': '1', 'CONVERSION': '100.00%',
    'AVG PROFIT': '—', 'AVG LOSS': '-17800.04', 'PROFITABLE CLIENTS': '—', 'LOSS-MAKING CLIENTS': '1',
    'BUY POSITION': '—', 'SELL POSITION': '—', 'RATIO': '0%',
  },
  BMC986: {
    'LEDGER BALANCE': '0', 'MARK-TO-MARKET': '0',
    'NET': '8,500', 'TOTAL DEPOSITS': '12,000', 'TOTAL WITHDRAWALS': '3,500', 'AVG DEPOSIT': '1,500.000', 'AVG WITHDRAWAL': '3,500',
    'REGISTERED': '1', 'ADDED FUNDS': '1', 'CONVERSION': '100.00%',
    'AVG PROFIT': '—', 'AVG LOSS': '-8500.00', 'PROFITABLE CLIENTS': '—', 'LOSS-MAKING CLIENTS': '1',
    'BUY POSITION': '—', 'SELL POSITION': '—', 'RATIO': '0%',
  },
  SJE055: {
    'LEDGER BALANCE': '0', 'MARK-TO-MARKET': '0',
    'NET': '5,200', 'TOTAL DEPOSITS': '8,000', 'TOTAL WITHDRAWALS': '2,800', 'AVG DEPOSIT': '1,600.000', 'AVG WITHDRAWAL': '2,800',
    'REGISTERED': '1', 'ADDED FUNDS': '1', 'CONVERSION': '100.00%',
    'AVG PROFIT': '—', 'AVG LOSS': '-5200.00', 'PROFITABLE CLIENTS': '—', 'LOSS-MAKING CLIENTS': '1',
    'BUY POSITION': '—', 'SELL POSITION': '—', 'RATIO': '0%',
  },
  KWF295: {
    'LEDGER BALANCE': '0', 'MARK-TO-MARKET': '0',
    'NET': '22,400', 'TOTAL DEPOSITS': '35,000', 'TOTAL WITHDRAWALS': '12,600', 'AVG DEPOSIT': '3,500.000', 'AVG WITHDRAWAL': '12,600',
    'REGISTERED': '1', 'ADDED FUNDS': '1', 'CONVERSION': '100.00%',
    'AVG PROFIT': '—', 'AVG LOSS': '-22400.00', 'PROFITABLE CLIENTS': '—', 'LOSS-MAKING CLIENTS': '1',
    'BUY POSITION': '—', 'SELL POSITION': '—', 'RATIO': '0%',
  },
  JBI977: {
    'LEDGER BALANCE': '0', 'MARK-TO-MARKET': '0',
    'NET': '17,800', 'TOTAL DEPOSITS': '27,800', 'TOTAL WITHDRAWALS': '10,000', 'AVG DEPOSIT': '2,138.462', 'AVG WITHDRAWAL': '10,000',
    'REGISTERED': '1', 'ADDED FUNDS': '1', 'CONVERSION': '100.00%',
    'AVG PROFIT': '—', 'AVG LOSS': '-17800.04', 'PROFITABLE CLIENTS': '—', 'LOSS-MAKING CLIENTS': '1',
    'BUY POSITION': '—', 'SELL POSITION': '—', 'RATIO': '0%',
  },
  CXF406: {
    'LEDGER BALANCE': '0', 'MARK-TO-MARKET': '0',
    'NET': '4,100', 'TOTAL DEPOSITS': '6,500', 'TOTAL WITHDRAWALS': '2,400', 'AVG DEPOSIT': '1,300.000', 'AVG WITHDRAWAL': '2,400',
    'REGISTERED': '1', 'ADDED FUNDS': '1', 'CONVERSION': '100.00%',
    'AVG PROFIT': '—', 'AVG LOSS': '-4100.00', 'PROFITABLE CLIENTS': '—', 'LOSS-MAKING CLIENTS': '1',
    'BUY POSITION': '—', 'SELL POSITION': '—', 'RATIO': '0%',
  },
  SDR001: {
    'LEDGER BALANCE': '0', 'MARK-TO-MARKET': '0',
    'NET': '1,24,500', 'TOTAL DEPOSITS': '2,10,000', 'TOTAL WITHDRAWALS': '85,500', 'AVG DEPOSIT': '15,000.000', 'AVG WITHDRAWAL': '85,500',
    'REGISTERED': '8', 'ADDED FUNDS': '8', 'CONVERSION': '100.00%',
    'AVG PROFIT': '—', 'AVG LOSS': '-15600.00', 'PROFITABLE CLIENTS': '—', 'LOSS-MAKING CLIENTS': '8',
    'BUY POSITION': '—', 'SELL POSITION': '—', 'RATIO': '0%',
  },
  SIH008: {
    'LEDGER BALANCE': '0', 'MARK-TO-MARKET': '0',
    'NET': '9,300', 'TOTAL DEPOSITS': '14,000', 'TOTAL WITHDRAWALS': '4,700', 'AVG DEPOSIT': '2,000.000', 'AVG WITHDRAWAL': '4,700',
    'REGISTERED': '1', 'ADDED FUNDS': '1', 'CONVERSION': '100.00%',
    'AVG PROFIT': '—', 'AVG LOSS': '-9300.00', 'PROFITABLE CLIENTS': '—', 'LOSS-MAKING CLIENTS': '1',
    'BUY POSITION': '—', 'SELL POSITION': '—', 'RATIO': '0%',
  },
};

function DashBoardSection({ title, fields, userId }: {
  title: string;
  fields: { label: string }[];
  userId: string;
}) {
  const [fetched, setFetched] = useState(false);
  const userStore = USER_DATA[userId] ?? {};

  return (
    <div className="adm-db-section">
      <div className="adm-db-section-header">
        <span className="adm-db-section-title">{title}</span>
        <button className="adm-btn-primary adm-db-fetch-btn" onClick={() => setFetched(true)}>
          Fetch
        </button>
      </div>
      <div className="adm-db-grid">
        {fields.map((f, i) => {
          const raw = fetched ? (userStore[f.label] ?? '—') : '—';
          const num = raw.replace(/,/g, '');
          const isNeg = num.startsWith('-') && raw !== '—';
          const isPos = !isNeg && raw !== '—' && raw !== '0' && !num.startsWith('—');
          // deposits/totals shown in green, withdrawals in red
          const greenLabels = ['TOTAL DEPOSITS','NET','ADDED FUNDS','AVG DEPOSIT','REGISTERED','CONVERSION','BUY POSITION','AVG PROFIT','PROFITABLE CLIENTS'];
          const redLabels   = ['TOTAL WITHDRAWALS','AVG WITHDRAWAL','AVG LOSS','LOSS-MAKING CLIENTS','SELL POSITION'];
          const forceGreen  = fetched && raw !== '—' && raw !== '0' && greenLabels.includes(f.label);
          const forceRed    = fetched && (isNeg || (raw !== '—' && redLabels.includes(f.label)));
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

function DashboardPage({ selectedUser }: { selectedUser: { id: string; role: string } }) {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');

  const uid = selectedUser.id;

  return (
    <div className="adm-db-root">
      {/* User + date filter */}
      <div className="adm-db-top-card">
        <div className="adm-db-username">{selectedUser.id}
          <span className="adm-db-role-badge">{selectedUser.role}</span>
        </div>
        <div className="adm-db-filter-row">
          <span className="adm-db-filter-label">Filter:</span>
          <input type="date" className="adm-db-date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="adm-db-filter-dash">–</span>
        </div>
        <div>
          <input type="date" className="adm-db-date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
      </div>

      <DashBoardSection key={uid+'bal'} userId={uid} title="BALANCE INFO" fields={[
        { label: 'LEDGER BALANCE' },
        { label: 'MARK-TO-MARKET' },
      ]} />

      <DashBoardSection key={uid+'dep'} userId={uid} title="DEPOSITS & WITHDRAWALS" fields={[
        { label: 'NET' },
        { label: 'TOTAL DEPOSITS' },
        { label: 'TOTAL WITHDRAWALS' },
        { label: 'AVG DEPOSIT' },
        { label: 'AVG WITHDRAWAL' },
      ]} />

      <DashBoardSection key={uid+'reg'} userId={uid} title="CLIENT REGISTRATION" fields={[
        { label: 'REGISTERED' },
        { label: 'ADDED FUNDS' },
        { label: 'CONVERSION' },
      ]} />

      <DashBoardSection key={uid+'pnl'} userId={uid} title="CLIENT PROFIT & LOSS" fields={[
        { label: 'AVG PROFIT' },
        { label: 'AVG LOSS' },
        { label: 'PROFITABLE CLIENTS' },
        { label: 'LOSS-MAKING CLIENTS' },
      ]} />

      <DashBoardSection key={uid+'pos'} userId={uid} title="POSITION DETAILS" fields={[
        { label: 'BUY POSITION' },
        { label: 'SELL POSITION' },
        { label: 'RATIO' },
      ]} />

      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── Instrument data per tab ─────────────────────────────────────────────────
const TAB_INSTRUMENTS: Record<string, string[]> = {
  'INDEX-FUT': ['NIFTY','BANKNIFTY','SENSEX','FINNIFTY','MIDCPNIFTY','BANKEX','NIFTYNXT50'],
  'INDEX-OPT': ['NIFTY','BANKNIFTY','SENSEX','FINNIFTY','MIDCPNIFTY','BANKEX'],
  'STOCK-FUT': ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','SBIN','WIPRO','AXISBANK','LT','BAJFINANCE','MARUTI','TATAMOTORS','ADANIENT','ONGC','NTPC','POWERGRID','COALINDIA','BPCL','IOC','HINDUNILVR'],
  'STOCK-OPT': ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','SBIN','WIPRO','AXISBANK','LT','BAJFINANCE','MARUTI','TATAMOTORS','ADANIENT','ONGC','NTPC'],
  'NSE-EQ':    ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','SBIN','WIPRO','AXISBANK','LT','BAJFINANCE','MARUTI','TATAMOTORS','ADANIENT','ONGC','NTPC','POWERGRID','COALINDIA','BPCL','IOC','HINDUNILVR','NESTLEIND','BRITANNIA','DABUR','MARICO','GODREJCP'],
  'MCX-FUT':   ['GOLD','GOLDMINI','SILVER','SILVERMINI','CRUDEOIL','CRUDEOILM','NATURALGAS','NATURALGASM','COPPER','ZINC','LEAD','ALUMINIUM','NICKEL'],
  'MCX-OPT':   ['GOLD','SILVER','CRUDEOIL','NATURALGAS','COPPER'],
  'COMEX':     ['XAUUSD','XAGUSD','XPTUSD','XPDUSD','HGUSD','CLUSD','NGUSD'],
  'CRYPTO':    ['BTCUSD','ETHUSD','XRPUSD','BNBUSD','SOLUSD','ADAUSD','DOTUSD','MATICUSD','LINKUSD','AVAXUSD','ATOMUSD','UNIUSD','LTCUSD','TRXUSD','FILUSD','AAVEUSD'],
  'FOREX':     ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF','NZDUSD','EURGBP','EURJPY','GBPJPY','AUDJPY','CADJPY','CHFJPY','EURCHF','EURAUD'],
};

function MarketWatchPage() {
  const tabs = ['INDEX-FUT','INDEX-OPT','STOCK-FUT','STOCK-OPT','NSE-EQ','MCX-FUT','MCX-OPT','COMEX','CRYPTO','FOREX'];
  const [activeTab, setActiveTab] = useState('INDEX-FUT');
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const [watchlists, setWatchlists] = useState<Record<string, string[]>>({});

  const instruments = watchlists[activeTab] ?? [];
  const allForTab = TAB_INSTRUMENTS[activeTab] ?? [];

  const suggestions = search.trim().length > 0
    ? allForTab.filter(s => s.toLowerCase().includes(search.trim().toLowerCase()))
    : allForTab;

  const showDropdown = focused && search.trim().length > 0;

  const addInstrument = (sym: string) => {
    setWatchlists(prev => ({
      ...prev,
      [activeTab]: [...(prev[activeTab] ?? []).filter(x => x !== sym), sym],
    }));
    setSearch('');
    setFocused(false);
  };

  const handleClear = () => setWatchlists(prev => ({ ...prev, [activeTab]: [] }));

  return (
    <div className="adm-mw-root">
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
              <button className="adm-mw-remove" onClick={() =>
                setWatchlists(prev => ({ ...prev, [activeTab]: prev[activeTab].filter((_, j) => j !== i) }))
              }>✕</button>
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
const DEMO_USERS = [
  { id: 'QEE875', role: 'USER' },
  { id: 'BMC986', role: 'USER' },
  { id: 'SJE055', role: 'USER' },
  { id: 'KWF295', role: 'USER' },
  { id: 'JBI977', role: 'USER' },
  { id: 'CXF406', role: 'USER' },
  { id: 'SDR001', role: 'SUB_BROKER' },
  { id: 'SIH008', role: 'USER' },
];

const PAGE_SIZE = 8;

const SEGMENTS = ['INDEX-FUT','STOCK-OPT','NSE-EQ','COMEX','INDEX-OPT','MCX-FUT','CRYPTO','STOCK-FUT','MCX-OPT','FOREX'];

function CreateUserForm({ onBack, onCreated }: { onBack: () => void; onCreated: (id: string, role: string) => void }) {
  const [username, setUsername]     = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [fullName, setFullName]     = useState('');
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [role, setRole]             = useState('User');
  const [parent, setParent]         = useState('');
  const [copyFrom, setCopyFrom]     = useState('');
  const [active, setActive]         = useState(true);
  const [readOnly, setReadOnly]     = useState(false);
  const [demoUser, setDemoUser]     = useState(false);
  const [intradaySqOff, setIntradaySqOff] = useState(false);
  const [autoSqoff, setAutoSqoff]   = useState('90');
  const [sqoffMethod, setSqoffMethod] = useState('Credit');
  const [segments, setSegments]     = useState<string[]>([]);

  const usernameAvailable = username.length >= 3;

  const toggleSegment = (s: string) =>
    setSegments(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const handleCreate = () => {
    if (!username.trim()) return;
    // Prototype: password = username, backend will handle real passwords later
    onCreated(username.trim().toUpperCase(), role.toUpperCase().replace(' ', '_'));
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
            <option>User</option>
            <option>Sub Broker</option>
            <option>Broker</option>
            <option>Admin</option>
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
          <button className="adm-btn-primary" style={{ padding: '10px 24px' }} onClick={handleCreate}>Create User</button>
        </div>

        <div style={{ height: 24 }} />
      </div>
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
  const [search, setSearch]   = useState('');
  const [users, setUsers]     = useState(DEMO_USERS);
  const [page, setPage]       = useState(1);

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
          {paged.map((u, i) => {
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
          })}
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

const USER_ORDERS: Record<string, { executed: Order[]; limit: Order[]; rejected: Order[] }> = {
  QEE875: {
    executed: [
      { symbol: 'ETHUSD', side: 'BUY', status: 'EXECUTED', qty: 2, price: 2100.50, orderType: 'MARKET', info: 'Entry', time: '07/04/2026, 10:15:00' },
      { symbol: 'BTCUSD', side: 'SELL', status: 'EXECUTED', qty: 1, price: 71200.00, orderType: 'MARKET', info: 'Exit', time: '06/04/2026, 14:30:00' },
    ],
    limit: [
      { symbol: 'XRPUSD', side: 'BUY', status: 'CANCELLED', qty: 500, price: 0.52, orderType: 'LIMIT', info: 'System Order: EOD Auto-Cancellation', time: '05/04/2026, 21:37:12' },
    ],
    rejected: [
      { symbol: 'SOLUSD', side: 'SELL', status: 'REJECTED', qty: 10, price: 145.00, orderType: 'LIMIT', info: 'Insufficient Margin', time: '04/04/2026, 09:00:00' },
    ],
  },
  JBI977: {
    executed: [
      { symbol: 'ETHUSD', side: 'BUY', status: 'EXECUTED', qty: 4, price: 2080.97, orderType: 'MARKET', info: 'Entry', time: '07/04/2026, 21:07:00' },
      { symbol: 'CRUDEOIL26APR10500PE', side: 'SELL', status: 'EXECUTED', qty: 5, price: 994.33, orderType: 'MARKET', info: 'System Order: Marginal Shortfall (NRML Conversion Failed)', time: '02/04/2026, 23:25:59' },
      { symbol: 'CRUDEOIL26APR10500PE', side: 'SELL', status: 'EXECUTED', qty: 5, price: 994.33, orderType: 'MARKET', info: 'Entry', time: '02/04/2026, 22:10:00' },
      { symbol: 'NIFTY26APR24000CE', side: 'BUY', status: 'EXECUTED', qty: 50, price: 120.50, orderType: 'MARKET', info: 'Entry', time: '01/04/2026, 10:05:00' },
      { symbol: 'BANKNIFTY26APR52000PE', side: 'SELL', status: 'EXECUTED', qty: 25, price: 85.00, orderType: 'MARKET', info: 'Exit', time: '01/04/2026, 15:20:00' },
    ],
    limit: [
      { symbol: 'SILVERMIC26APRFUT', side: 'SELL', status: 'CANCELLED', qty: 1, price: 263800.00, orderType: 'LIMIT', info: 'System Order: EOD Auto-Cancellation', time: '01/04/2026, 21:37:12' },
      { symbol: 'SILVER26APR238000CE', side: 'BUY', status: 'CANCELLED', qty: 30, price: 10983.50, orderType: 'LIMIT', info: 'Entry', time: '31/03/2026, 17:28:55' },
      { symbol: 'BTCUSD', side: 'SELL', status: 'CANCELLED', qty: 1, price: 70000.00, orderType: 'LIMIT', info: 'System Order: EOD Auto-Cancellation', time: '30/03/2026, 21:37:12' },
    ],
    rejected: [
      { symbol: 'SILVERMIC26APRFUT', side: 'SELL', status: 'REJECTED', qty: 1, price: 263800.00, orderType: 'LIMIT', info: 'System Order: EOD Auto-Cancellation', time: '01/04/2026, 21:37:12' },
      { symbol: 'SILVER26APR238000CE', side: 'BUY', status: 'REJECTED', qty: 30, price: 10983.50, orderType: 'LIMIT', info: 'Entry', time: '31/03/2026, 17:28:55' },
      { symbol: 'BTCUSD', side: 'SELL', status: 'REJECTED', qty: 1, price: 70000.00, orderType: 'LIMIT', info: 'Insufficient Margin', time: '30/03/2026, 21:37:12' },
    ],
  },
  SDR001: {
    executed: [
      { symbol: 'GOLD26APRFUT', side: 'BUY', status: 'EXECUTED', qty: 1, price: 92500.00, orderType: 'MARKET', info: 'Entry', time: '07/04/2026, 09:30:00' },
      { symbol: 'CRUDEOIL26APRFUT', side: 'SELL', status: 'EXECUTED', qty: 100, price: 6850.00, orderType: 'MARKET', info: 'Exit', time: '06/04/2026, 15:00:00' },
      { symbol: 'NIFTY26APR23500CE', side: 'BUY', status: 'EXECUTED', qty: 50, price: 210.00, orderType: 'MARKET', info: 'Entry', time: '05/04/2026, 10:10:00' },
    ],
    limit: [
      { symbol: 'GOLDMINI26APRFUT', side: 'BUY', status: 'CANCELLED', qty: 1, price: 9250.00, orderType: 'LIMIT', info: 'System Order: EOD Auto-Cancellation', time: '04/04/2026, 21:37:12' },
      { symbol: 'SILVERMINI26APRFUT', side: 'SELL', status: 'CANCELLED', qty: 5, price: 26500.00, orderType: 'LIMIT', info: 'Entry', time: '03/04/2026, 17:00:00' },
    ],
    rejected: [
      { symbol: 'BTCUSD', side: 'BUY', status: 'REJECTED', qty: 2, price: 72000.00, orderType: 'LIMIT', info: 'Insufficient Margin', time: '02/04/2026, 11:00:00' },
    ],
  },
};

// fallback for users without specific data
const DEFAULT_ORDERS = {
  executed: [
    { symbol: 'ETHUSD', side: 'BUY' as const, status: 'EXECUTED' as const, qty: 1, price: 2050.00, orderType: 'MARKET' as const, info: 'Entry', time: '07/04/2026, 10:00:00' },
  ],
  limit: [],
  rejected: [],
};

function OrdersPage({ selectedUser }: { selectedUser: { id: string; role: string } }) {
  const [tab, setTab] = useState<'executed' | 'limit' | 'rejected'>('executed');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState('10');

  const uid = selectedUser.id;
  const userOrders = USER_ORDERS[uid] ?? DEFAULT_ORDERS;
  const allOrders = userOrders[tab];

  const filtered = allOrders.filter(o =>
    o.symbol.toLowerCase().includes(search.toLowerCase()) ||
    uid.toLowerCase().includes(search.toLowerCase())
  );
  const displayed = filtered.slice(0, Number(rows));

  const buyCount = allOrders.filter(o => o.side === 'BUY').length;
  const sellCount = allOrders.filter(o => o.side === 'SELL').length;

  return (
    <div className="adm-ord-root">
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
            {['10','25','50','100'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      <button className="adm-ord-download">
        <i className="fas fa-download" /> Download Excel
      </button>

      {/* Order cards */}
      <div className="adm-ord-list">
        {displayed.length === 0 ? (
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
type Position = {
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

const USER_POSITIONS: Record<string, {
  open: Position[];
  active: Position[];
  closed: Position[];
}> = {
  JBI977: {
    open: [
      { symbol: 'ETHUSD', side: 'BUY', pnl: 1176.23, qty: '4/4', avgPrice: 2080.97, entry: 2080.97, ltp: 2375.03, duration: '160h 0m 22s', brokerage: 1.25, slTp: '– / –', entryTime: '07/04/2026, 21:07:00' },
    ],
    active: [
      { symbol: 'ETHUSD', side: 'BUY', pnl: 1175.83, qty: '4/4', avgPrice: 2080.97, entry: 2080.97, ltp: 2374.93, duration: '160h 0m 40s', brokerage: 1.25, slTp: '– / –', entryTime: '07/04/2026, 21:07:00' },
    ],
    closed: [
      { symbol: 'CRUDEOIL26APR10500...', side: 'BUY', pnl: -159.89, qty: '0/5', avgPrice: 1025.40, entry: 1025.40, exit: 994.33, duration: '3h 41m 10s', brokerage: 4.55, slTp: '– / –', entryTime: '02/04/2026, 19:44:49', exitTime: '02/04/2026, 23:25:59', settlement: '– –' },
    ],
  },
  QEE875: {
    open: [
      { symbol: 'BTCUSD', side: 'BUY', pnl: 320.50, qty: '1/1', avgPrice: 71200.00, entry: 71200.00, ltp: 71520.50, duration: '24h 10m 5s', brokerage: 2.50, slTp: '– / –', entryTime: '06/04/2026, 14:30:00' },
    ],
    active: [
      { symbol: 'BTCUSD', side: 'BUY', pnl: 318.20, qty: '1/1', avgPrice: 71200.00, entry: 71200.00, ltp: 71518.20, duration: '24h 10m 20s', brokerage: 2.50, slTp: '– / –', entryTime: '06/04/2026, 14:30:00' },
    ],
    closed: [
      { symbol: 'ETHUSD', side: 'SELL', pnl: -45.30, qty: '0/2', avgPrice: 2100.50, entry: 2100.50, exit: 2078.00, duration: '5h 20m 0s', brokerage: 1.00, slTp: '– / –', entryTime: '05/04/2026, 10:00:00', exitTime: '05/04/2026, 15:20:00', settlement: '– –' },
    ],
  },
  SDR001: {
    open: [
      { symbol: 'GOLD26APRFUT', side: 'BUY', pnl: 2400.00, qty: '1/1', avgPrice: 92500.00, entry: 92500.00, ltp: 94900.00, duration: '48h 5m 0s', brokerage: 5.00, slTp: '– / –', entryTime: '05/04/2026, 09:30:00' },
      { symbol: 'NIFTY26APR23500CE', side: 'BUY', pnl: 525.00, qty: '50/50', avgPrice: 210.00, entry: 210.00, ltp: 220.50, duration: '48h 0m 0s', brokerage: 3.00, slTp: '– / –', entryTime: '05/04/2026, 10:10:00' },
    ],
    active: [
      { symbol: 'GOLD26APRFUT', side: 'BUY', pnl: 2380.00, qty: '1/1', avgPrice: 92500.00, entry: 92500.00, ltp: 94880.00, duration: '48h 5m 20s', brokerage: 5.00, slTp: '– / –', entryTime: '05/04/2026, 09:30:00' },
    ],
    closed: [
      { symbol: 'CRUDEOIL26APRFUT', side: 'SELL', pnl: -350.00, qty: '0/100', avgPrice: 6850.00, entry: 6850.00, exit: 6815.00, duration: '6h 30m 0s', brokerage: 8.00, slTp: '– / –', entryTime: '06/04/2026, 09:00:00', exitTime: '06/04/2026, 15:30:00', settlement: '– –' },
    ],
  },
};

const DEFAULT_POSITIONS = { open: [], active: [], closed: [] };

function PositionPage({ selectedUser }: { selectedUser: { id: string; role: string } }) {
  const [tab, setTab] = useState<'open' | 'active' | 'closed'>('open');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState('10');
  const [page, setPage] = useState(1);

  const uid = selectedUser.id;
  const userPos = USER_POSITIONS[uid] ?? DEFAULT_POSITIONS;
  const positions = userPos[tab];

  const openPnl = [...(userPos.open), ...(userPos.active)].reduce((s, p) => s + p.pnl, 0);

  const filtered = positions.filter(p =>
    p.symbol.toLowerCase().includes(search.toLowerCase()) ||
    uid.toLowerCase().includes(search.toLowerCase())
  );
  const rowsNum = Number(rows);
  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsNum));
  const displayed = filtered.slice((page - 1) * rowsNum, page * rowsNum);

  const switchTab = (t: 'open' | 'active' | 'closed') => { setTab(t); setSearch(''); setPage(1); };

  return (
    <div className="adm-pos-root">
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
            {['10','25','50','100'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <button className="adm-ord-download"><i className="fas fa-download" /> Download Excel</button>

      {/* Position cards */}
      <div className="adm-ord-list">
        {displayed.length === 0 ? (
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
                  <button className="adm-pos-act-edit">Edit</button>
                  <button className="adm-pos-act-reopen">Reopen</button>
                  <button className="adm-pos-act-delete">Delete</button>
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
                <button className="adm-pos-act-sqoff-full">Sqoff</button>
              )}
              {/* Active Trades: Sqoff + Edit + Delete */}
              {tab === 'active' && (
                <div className="adm-pos-card-actions">
                  <button className="adm-pos-act-sqoff">Sqoff</button>
                  <button className="adm-pos-act-edit">Edit</button>
                  <button className="adm-pos-act-delete">Delete</button>
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
const ALL_SEGMENTS = ['INDEX-FUT','STOCK-OPT','NSE-EQ','COMEX','INDEX-OPT','MCX-FUT','CRYPTO','STOCK-FUT','MCX-OPT','FOREX'];

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

const USER_UPDATE_DATA: Record<string, {
  email: string; fullName: string; phone: string; role: string; parent: string;
  activation: boolean; readOnly: boolean; demoUser: boolean; intradaySqOff: boolean;
  autoSqoff: string; sqoffMethod: string;
  segments: string[];
}> = {
  JBI977: { email: 'gauravdhu65@gmail.com', fullName: 'GAURAVDHU', phone: '9876543210', role: 'User', parent: 'SDR001', activation: true, readOnly: false, demoUser: false, intradaySqOff: false, autoSqoff: '90', sqoffMethod: 'Credit', segments: ALL_SEGMENTS },
  QEE875: { email: 'qee875@example.com', fullName: 'QEE User', phone: '9000000001', role: 'User', parent: 'SDR001', activation: true, readOnly: false, demoUser: false, intradaySqOff: false, autoSqoff: '90', sqoffMethod: 'Credit', segments: ALL_SEGMENTS },
  BMC986: { email: 'bmc986@example.com', fullName: 'BMC User', phone: '9000000002', role: 'User', parent: 'SDR001', activation: true, readOnly: false, demoUser: false, intradaySqOff: false, autoSqoff: '90', sqoffMethod: 'Credit', segments: ALL_SEGMENTS },
  SJE055: { email: 'sje055@example.com', fullName: 'SJE User', phone: '9000000003', role: 'User', parent: 'SDR001', activation: false, readOnly: false, demoUser: true, intradaySqOff: false, autoSqoff: '90', sqoffMethod: 'Credit', segments: ['INDEX-FUT','NSE-EQ','CRYPTO'] },
  KWF295: { email: 'kwf295@example.com', fullName: 'KWF User', phone: '9000000004', role: 'User', parent: 'SDR001', activation: true, readOnly: false, demoUser: false, intradaySqOff: true, autoSqoff: '80', sqoffMethod: 'Debit', segments: ALL_SEGMENTS },
  CXF406: { email: 'cxf406@example.com', fullName: 'CXF User', phone: '9000000005', role: 'User', parent: 'SDR001', activation: true, readOnly: true, demoUser: false, intradaySqOff: false, autoSqoff: '90', sqoffMethod: 'Credit', segments: ['COMEX','FOREX','CRYPTO'] },
  SDR001: { email: 'sdr001@example.com', fullName: 'SDR Broker', phone: '9000000006', role: 'Sub Broker', parent: '', activation: true, readOnly: false, demoUser: false, intradaySqOff: false, autoSqoff: '90', sqoffMethod: 'Credit', segments: ALL_SEGMENTS },
  SIH008: { email: 'sih008@example.com', fullName: 'SIH User', phone: '9000000007', role: 'User', parent: 'SDR001', activation: true, readOnly: false, demoUser: false, intradaySqOff: false, autoSqoff: '90', sqoffMethod: 'Credit', segments: ALL_SEGMENTS },
};

function SegmentBlock({ name }: { name: string }) {
  const [s, setS] = useState<SegSettings>(defaultSeg());
  const upd = (k: keyof SegSettings, v: string | boolean) => setS(prev => ({ ...prev, [k]: v }));

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
  const base = USER_UPDATE_DATA[uid] ?? USER_UPDATE_DATA['QEE875'];

  const [activation, setActivation] = useState(base.activation);
  const [email, setEmail] = useState(base.email);
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [fullName, setFullName] = useState(base.fullName);
  const [phone, setPhone] = useState(base.phone);
  const [role, setRole] = useState(base.role);
  const [parent, setParent] = useState(base.parent);
  const [copyFrom, setCopyFrom] = useState('undefined (undefined)');
  const [readOnly, setReadOnly] = useState(base.readOnly);
  const [demoUser, setDemoUser] = useState(base.demoUser);
  const [intradaySqOff, setIntradaySqOff] = useState(base.intradaySqOff);
  const [autoSqoff, setAutoSqoff] = useState(base.autoSqoff);
  const [sqoffMethod, setSqoffMethod] = useState(base.sqoffMethod);
  const [segments, setSegments] = useState<string[]>(base.segments);

  // Reset when user changes
  useEffect(() => {
    const d = USER_UPDATE_DATA[uid] ?? USER_UPDATE_DATA['QEE875'];
    setActivation(d.activation); setEmail(d.email); setPassword('');
    setFullName(d.fullName); setPhone(d.phone); setRole(d.role);
    setParent(d.parent); setReadOnly(d.readOnly); setDemoUser(d.demoUser);
    setIntradaySqOff(d.intradaySqOff); setAutoSqoff(d.autoSqoff);
    setSqoffMethod(d.sqoffMethod); setSegments(d.segments);
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
          <input className="adm-upd-input" value={copyFrom} onChange={e => setCopyFrom(e.target.value)} />
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
      {segBlocks.map(name => <SegmentBlock key={name} name={name} />)}

      {/* Save button */}
      <button className="adm-btn-primary" style={{ width: '100%', padding: '14px', fontSize: '0.9rem', borderRadius: 10 }}>
        Save Changes
      </button>

      <div style={{ height: 24 }} />
    </div>
  );
}

// ─── Users Page ───────────────────────────────────────────────────────────────
const USERS_LIST = [
  { id: 'QEE875', fullName: 'Rahul Sharma',    role: 'USER', active: true,  ledgerBal: 12450, mAvailable: 12450, openPnl: 0,    m2m: 0,    weeklyPnl: -5200,    alltimePnl: -22400,   marginUsed: 0, holdingMargin: 0, broker: 'SDR001', mobile: '9000000001' },
  { id: 'BMC986', fullName: 'Priya Mehta',     role: 'USER', active: true,  ledgerBal: 8900,  mAvailable: 8900,  openPnl: 0,    m2m: 0,    weeklyPnl: -3500,    alltimePnl: -8500,    marginUsed: 0, holdingMargin: 0, broker: 'SDR001', mobile: '9000000002' },
  { id: 'SJE055', fullName: 'Amit Verma',      role: 'USER', active: true,  ledgerBal: 5200,  mAvailable: 5200,  openPnl: 0,    m2m: 0,    weeklyPnl: -2800,    alltimePnl: -5200,    marginUsed: 0, holdingMargin: 0, broker: 'SDR001', mobile: '9000000003' },
  { id: 'KWF295', fullName: 'Sneha Patel',     role: 'USER', active: true,  ledgerBal: 18750, mAvailable: 18750, openPnl: 0,    m2m: 0,    weeklyPnl: -12600,   alltimePnl: -22400,   marginUsed: 0, holdingMargin: 0, broker: 'SDR001', mobile: '9000000004' },
  { id: 'JBI977', fullName: 'Gaurav Dhu',      role: 'USER', active: true,  ledgerBal: 545.16,mAvailable: 545.16,openPnl: 0,    m2m: 0,    weeklyPnl: -17377.42,alltimePnl: -94954.86,marginUsed: 0, holdingMargin: 0, broker: 'QPG446', mobile: '9000000005' },
  { id: 'CXF406', fullName: 'Vikram Singh',    role: 'USER', active: true,  ledgerBal: 0,     mAvailable: 0,     openPnl: 0,    m2m: 0,    weeklyPnl: 0,        alltimePnl: -17350,   marginUsed: 0, holdingMargin: 0, broker: 'QPG446', mobile: '9000000006' },
  { id: 'SIH008', fullName: 'Neha Joshi',      role: 'USER', active: true,  ledgerBal: 545.16,mAvailable: 545.16,openPnl: 0,    m2m: 0,    weeklyPnl: -17377.42,alltimePnl: -94954.86,marginUsed: 0, holdingMargin: 0, broker: 'QPG446', mobile: '9000000008' },
];

function UsersPage({ selectedUser, onSelectUser, onNavigate }: {
  selectedUser: { id: string; role: string };
  onSelectUser: (u: { id: string; role: string }) => void;
  onNavigate: (page: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState('10');
  const [page, setPage] = useState(1);

  const filtered = USERS_LIST.filter(u =>
    u.id.toLowerCase().includes(search.toLowerCase()) ||
    u.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const active = USERS_LIST.filter(u => u.active).length;
  const inactive = USERS_LIST.filter(u => !u.active).length;

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
          <div className="adm-users-stat-value">{USERS_LIST.length}</div>
        </div>
      </div>

      {/* Search */}
      <div className="adm-ord-search-wrap">
        <i className="fas fa-search adm-ord-search-icon" />
        <input className="adm-ord-search" placeholder="Search users..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {/* Rows + Download */}
      <div className="adm-ord-controls">
        <div className="adm-ord-rows-wrap">
          <span className="adm-ord-rows-label">Rows</span>
          <select className="adm-ord-rows-select" value={rows} onChange={e => { setRows(e.target.value); setPage(1); }}>
            {['10','25','50','100'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>
      <button className="adm-ord-download"><i className="fas fa-download" /> Download Excel</button>

      {/* User cards */}
      <div className="adm-users-list">
        {displayed.map((u, i) => (
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
              <button className="adm-users-btn ledger-btn">Ledger</button>
              <button className="adm-users-btn update-btn" onClick={() => { onSelectUser({ id: u.id, role: u.role }); onNavigate('update'); }}>Update</button>
              <button className="adm-users-btn delete-btn">Delete</button>
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

// ─── Act Ledger Page ──────────────────────────────────────────────────────────
type LogEntry = {
  type: 'ORDER_EXECUTION' | 'AUTO_SQUARE_OFF' | 'ORDER_CANCEL' | 'LOGIN' | 'LOGOUT';
  time: string;
  by: string;
  target: string;
  symbol?: string;
  qty?: number;
  price?: number;
  reason?: string;
  ip: string;
};

const ACT_LOGS: LogEntry[] = [
  { type: 'ORDER_EXECUTION', time: '13/04/2026, 22:00:58', by: 'System', target: 'SIH008', symbol: 'CRUDEOIL26APR9950CE', qty: 100, price: 200.98593, reason: 'Risk Management: Loss Limit Exce...', ip: 'system-automation' },
  { type: 'ORDER_EXECUTION', time: '13/04/2026, 22:00:58', by: 'System', target: 'SIH008', symbol: 'CRUDEOIL26APR9950CE', qty: 100, price: 200.98593, reason: 'Risk Management: Loss Limit Exce...', ip: 'system-automation' },
  { type: 'AUTO_SQUARE_OFF', time: '13/04/2026, 22:00:58', by: 'System', target: 'SIH008', symbol: 'CRUDEOIL26APR9950CE', qty: 100, price: 200.98593, reason: 'Risk Management: Loss Limit Exce...', ip: 'system-automation' },
  { type: 'ORDER_EXECUTION', time: '09/04/2026, 09:33:37', by: 'BMC986', target: 'BMC986', symbol: 'NIFTY2641323900CE', qty: 65, price: 216.278112, reason: 'Entry', ip: '106.192.43.29' },
  { type: 'ORDER_EXECUTION', time: '09/04/2026, 09:33:37', by: 'BMC986', target: 'BMC986', symbol: 'NIFTY2641323900CE', qty: 65, price: 192.274992, reason: 'Entry', ip: '106.192.43.29' },
  { type: 'ORDER_EXECUTION', time: '09/04/2026, 09:31:11', by: 'BMC986', target: 'BMC986', symbol: 'SENSEX2640977000PE', qty: 80, price: 142.14474, reason: 'Exit', ip: '106.192.43.29' },
  { type: 'ORDER_CANCEL',    time: '09/04/2026, 09:30:23', by: 'BMC986', target: 'BMC986', symbol: 'SENSEX2640977000PE', ip: '106.192.43.29' },
  { type: 'ORDER_EXECUTION', time: '08/04/2026, 14:22:10', by: 'JBI977', target: 'JBI977', symbol: 'ETHUSD', qty: 4, price: 2080.97, reason: 'Entry', ip: '103.45.67.89' },
  { type: 'ORDER_EXECUTION', time: '07/04/2026, 21:07:00', by: 'JBI977', target: 'JBI977', symbol: 'ETHUSD', qty: 4, price: 2080.97, reason: 'Entry', ip: '103.45.67.89' },
  { type: 'AUTO_SQUARE_OFF', time: '02/04/2026, 23:25:59', by: 'System', target: 'JBI977', symbol: 'CRUDEOIL26APR10500PE', qty: 5, price: 994.33, reason: 'Marginal Shortfall (NRML Conversion Failed)', ip: 'system-automation' },
  { type: 'ORDER_EXECUTION', time: '01/04/2026, 21:37:12', by: 'System', target: 'SJE055', symbol: 'SILVERMIC26APRFUT', qty: 1, price: 263800.00, reason: 'System Order: EOD Auto-Cancellation', ip: 'system-automation' },
  { type: 'ORDER_CANCEL',    time: '31/03/2026, 17:28:55', by: 'KWF295', target: 'KWF295', symbol: 'SILVER26APR238000CE', ip: '98.76.54.32' },
  { type: 'LOGIN',           time: '07/04/2026, 09:00:00', by: 'QEE875', target: 'QEE875', ip: '192.168.1.10' },
  { type: 'LOGOUT',          time: '07/04/2026, 18:30:00', by: 'QEE875', target: 'QEE875', ip: '192.168.1.10' },
  { type: 'ORDER_EXECUTION', time: '06/04/2026, 14:30:00', by: 'QEE875', target: 'QEE875', symbol: 'BTCUSD', qty: 1, price: 71200.00, reason: 'Exit', ip: '192.168.1.10' },
  { type: 'ORDER_EXECUTION', time: '05/04/2026, 10:00:00', by: 'SJE055', target: 'SJE055', symbol: 'ETHUSD', qty: 2, price: 2100.50, reason: 'Entry', ip: '77.88.99.11' },
  { type: 'AUTO_SQUARE_OFF', time: '04/04/2026, 21:37:12', by: 'System', target: 'SDR001', symbol: 'GOLDMINI26APRFUT', qty: 1, price: 9250.00, reason: 'System Order: EOD Auto-Cancellation', ip: 'system-automation' },
  { type: 'ORDER_EXECUTION', time: '05/04/2026, 09:30:00', by: 'SDR001', target: 'SDR001', symbol: 'GOLD26APRFUT', qty: 1, price: 92500.00, reason: 'Entry', ip: '55.66.77.88' },
  { type: 'ORDER_CANCEL',    time: '03/04/2026, 17:00:00', by: 'SDR001', target: 'SDR001', symbol: 'SILVERMINI26APRFUT', ip: '55.66.77.88' },
  { type: 'LOGIN',           time: '01/04/2026, 08:55:00', by: 'CXF406', target: 'CXF406', ip: '44.55.66.77' },
];

const LOG_ROWS = 10;

function ActLedgerPage() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [dlRows, setDlRows]     = useState('100');
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = ACT_LOGS.filter(l =>
    l.type.toLowerCase().includes(search.toLowerCase()) ||
    l.target.toLowerCase().includes(search.toLowerCase()) ||
    l.by.toLowerCase().includes(search.toLowerCase()) ||
    (l.symbol ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / LOG_ROWS));
  const displayed  = filtered.slice((page - 1) * LOG_ROWS, page * LOG_ROWS);

  return (
    <div className="adm-al-root">
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
              {['10','25','50','100'].map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button className="adm-al-export-btn">Export CSV</button>
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
                {l.qty    && <div className="adm-al-exp-row"><span>Qty</span><span>{l.qty}</span></div>}
                {l.price  && <div className="adm-al-exp-row"><span>Price</span><span>{l.price}</span></div>}
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

// ─── Accounts Page ────────────────────────────────────────────────────────────
const ACCOUNTS_DATA = [
  { id: 'SIH008', fullName: 'Neha Joshi',   broker: 'SDR001', netPnl: -85052.55, brokerage: 9902.32, pnlBkg: -94954.86, settlement: 9871.94 },
  { id: 'CXF406', fullName: 'Vikram Singh', broker: 'SDR001', netPnl: -15660.99, brokerage: 1689.01, pnlBkg: -17350.00, settlement: 11389.46 },
  { id: 'JBI977', fullName: 'Gaurav Dhu',   broker: 'SDR001', netPnl: -99829.05, brokerage: 5520.43, pnlBkg: -105349.48,settlement: 1201.64 },
  { id: 'KWF295', fullName: 'Sneha Patel',  broker: 'SDR001', netPnl: -7181.38,  brokerage: 123.83,  pnlBkg: -7305.21,  settlement: 1301.46 },
  { id: 'SJE055', fullName: 'Amit Verma',   broker: 'SDR001', netPnl: -7338.19,  brokerage: 2225.84, pnlBkg: -9564.03,  settlement: 2976.42 },
  { id: 'BMC986', fullName: 'Priya Mehta',  broker: 'SDR001', netPnl: 613.62,    brokerage: 9813.56, pnlBkg: -9199.94,  settlement: 16081.49 },
  { id: 'QEE875', fullName: 'Rahul Sharma', broker: 'SDR001', netPnl: -12213.98, brokerage: 5586.06, pnlBkg: -17800.04, settlement: 657.78 },
];

// Sub-broker summary
const SUB_BROKER = { id: 'SDR001', sharingPnl: 0, sharingBkg: 8715.26, pnlBkg: -261523.56, clientNetPnl: -226662.52, totalBrokerage: 34861.05 };
// Broker summary
const BROKER     = { id: 'QPG446', sharingPnl: -113331.26, sharingBkg: 17430.52, pnlBkg: -261523.56, clientNetPnl: -226662.52, totalBrokerage: 34861.05 };

function AccountsPageImpl() {
  const [filter, setFilter] = useState<'all' | 'subbrokers' | 'brokers'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [search, setSearch]     = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [page, setPage]         = useState(1);
  const ROWS = 10;

  // Summary changes per tab
  const summary = filter === 'subbrokers'
    ? { id: 'SDR001', pnlBkg: -261523.56, clientNetPnl: -226662.52, totalBrokerage: 34861.05, sharingBkg: 8715.26,  sharingPnl: 0 }
    : filter === 'brokers'
    ? { id: 'SDR001', pnlBkg: -261523.56, clientNetPnl: -226662.52, totalBrokerage: 34861.05, sharingBkg: 17430.52, sharingPnl: -113331.26 }
    : { id: 'SDR001', pnlBkg: -261523.56, clientNetPnl: -226662.52, totalBrokerage: 34861.05, sharingBkg: 17430.52, sharingPnl: -113331.26 };

  const filtered = ACCOUNTS_DATA.filter(u =>
    u.id.toLowerCase().includes(search.toLowerCase()) ||
    u.fullName.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS));
  const displayed  = filtered.slice((page - 1) * ROWS, page * ROWS);

  const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="adm-acc-root">
      {/* Filter tabs */}
      <div className="adm-acc-tabs">
        {(['all','subbrokers','brokers'] as const).map(t => (
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
        <button className="adm-acc-export-btn excel">Export Excel</button>
        <button className="adm-acc-export-btn pdf">Export PDF</button>
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
              <button className="adm-acc-export-btn excel" style={{ fontSize: '0.72rem', padding: '6px 10px' }}>Export Excel</button>
              <button className="adm-acc-export-btn pdf"   style={{ fontSize: '0.72rem', padding: '6px 10px' }}>Export PDF</button>
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
                <div className="adm-acc-name">{u.fullName}</div>
              </div>
              <div className="adm-acc-card-btns">
                <button className="adm-acc-xls">XLS</button>
                <button className="adm-acc-pdf">PDF</button>
              </div>
            </div>
            <div className="adm-acc-card-grid">
              <span className="adm-acc-dl">Net PNL</span>
              <span className="adm-acc-dv">₹{fmt(u.netPnl)}</span>
              <span className="adm-acc-dl">Brokerage</span>
              <span className="adm-acc-dv">₹{fmt(u.brokerage)}</span>
              <span className="adm-acc-dl">PNL+BKG</span>
              <span className="adm-acc-dv">₹{fmt(u.pnlBkg)}</span>
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
type PayRequest = {
  id: string; userId: string; time: string; refId: string;
  type: 'DEPOSIT' | 'WITHDRAWAL'; amount: number; broker: string;
  updated: string; status: 'APPROVED' | 'PENDING' | 'REJECTED';
  accountName?: string; accountNo?: string; ifsc?: string; upi?: string;
};

const PAY_REQUESTS: PayRequest[] = [
  { id: '1873', userId: 'QEE875', time: '13/04/2026, 19:25:09', refId: '#1873', type: 'DEPOSIT',    amount: 8000,  broker: 'SDR001', updated: '13/04/2026 07:25 PM', status: 'APPROVED' },
  { id: '1856', userId: 'BMC986', time: '13/04/2026, 14:28:27', refId: '#1856', type: 'DEPOSIT',    amount: 5000,  broker: 'SDR001', updated: '13/04/2026 02:30 PM', status: 'APPROVED' },
  { id: '1746', userId: 'KWF295', time: '09/04/2026, 15:35:47', refId: '#1746', type: 'WITHDRAWAL', amount: 14000, broker: 'SDR001', updated: '09/04/2026 04:11 PM', status: 'APPROVED', accountName: 'Sneha Patel', accountNo: '98765432101', ifsc: 'HDFC0001234', upi: 'sneha@upi' },
  { id: '1720', userId: 'JBI977', time: '07/04/2026, 10:00:00', refId: '#1720', type: 'DEPOSIT',    amount: 20000, broker: 'SDR001', updated: '07/04/2026 10:05 AM', status: 'APPROVED' },
  { id: '1698', userId: 'QEE875', time: '06/04/2026, 09:00:00', refId: '#1698', type: 'DEPOSIT',    amount: 15000, broker: 'SDR001', updated: '06/04/2026 09:10 AM', status: 'APPROVED' },
  { id: '1650', userId: 'SJE055', time: '05/04/2026, 11:00:00', refId: '#1650', type: 'WITHDRAWAL', amount: 3000,  broker: 'SDR001', updated: '05/04/2026 11:15 AM', status: 'PENDING',  accountName: 'Amit Verma', accountNo: '11223344556', ifsc: 'ICIC0005678', upi: 'amit@upi' },
  { id: '1620', userId: 'CXF406', time: '04/04/2026, 14:00:00', refId: '#1620', type: 'DEPOSIT',    amount: 6500,  broker: 'SDR001', updated: '04/04/2026 02:05 PM', status: 'APPROVED' },
  { id: '1590', userId: 'BMC986', time: '03/04/2026, 16:00:00', refId: '#1590', type: 'WITHDRAWAL', amount: 3500,  broker: 'SDR001', updated: '03/04/2026 04:10 PM', status: 'REJECTED', accountName: 'Priya Mehta', accountNo: '22334455667', ifsc: 'SBIN0009876', upi: 'priya@upi' },
  { id: '1560', userId: 'SIH008', time: '02/04/2026, 12:00:00', refId: '#1560', type: 'DEPOSIT',    amount: 9000,  broker: 'SDR001', updated: '02/04/2026 12:10 PM', status: 'APPROVED' },
  { id: '1530', userId: 'KWF295', time: '01/04/2026, 10:00:00', refId: '#1530', type: 'DEPOSIT',    amount: 35000, broker: 'SDR001', updated: '01/04/2026 10:15 AM', status: 'APPROVED' },
];

function PayinOutPageImpl() {
  const [tab, setTab]       = useState<'deposit' | 'withdrawal' | 'rules'>('deposit');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [status, setStatus]     = useState('All Status');
  const [rows, setRows]         = useState('10');
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);

  // Rules state
  const [withdrawEnabled, setWithdrawEnabled] = useState(true);
  const [allowedDays, setAllowedDays] = useState(['Monday','Tuesday','Wednesday','Thursday','Friday']);
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime]     = useState('16:00');
  const [minWithdraw, setMinWithdraw] = useState('100');
  const [minDeposit, setMinDeposit]   = useState('1000');

  const allDays = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const toggleDay = (d: string) => setAllowedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const requests = PAY_REQUESTS.filter(r =>
    (tab === 'deposit' ? r.type === 'DEPOSIT' : r.type === 'WITHDRAWAL') &&
    (status === 'All Status' || r.status === status) &&
    (r.userId.toLowerCase().includes(search.toLowerCase()) || r.refId.includes(search))
  );
  const rowsNum = Number(rows);
  const totalPages = Math.max(1, Math.ceil(requests.length / rowsNum));
  const displayed  = requests.slice((page - 1) * rowsNum, page * rowsNum);

  const statusColor = (s: string) => s === 'APPROVED' ? '#2ea043' : s === 'PENDING' ? '#e3b341' : '#f85149';

  return (
    <div className="adm-pay-root">
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
            <button className="adm-btn-primary" style={{ padding: '12px 28px', fontSize: '0.9rem', borderRadius: 10 }}>Save Rules</button>
          </div>
        </div>
      ) : (<>
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

        {/* Status + Clear + Rows */}
        <div className="adm-pay-controls">
          <select className="adm-ord-rows-select" value={status} onChange={e => setStatus(e.target.value)}>
            {['All Status','APPROVED','PENDING','REJECTED'].map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="adm-pay-clear-btn" onClick={() => { setStatus('All Status'); setSearch(''); setDateFrom(''); setDateTo(''); }}>Clear</button>
          <span className="adm-ord-rows-label">Rows</span>
          <select className="adm-ord-rows-select" value={rows} onChange={e => { setRows(e.target.value); setPage(1); }}>
            {['10','25','50','100'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        <button className="adm-ord-download"><i className="fas fa-download" /> Download Excel</button>

        {/* Search */}
        <div className="adm-ord-search-wrap">
          <i className="fas fa-search adm-ord-search-icon" />
          <input className="adm-ord-search" placeholder="Search by username, reference id..." value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>

        {/* Request cards */}
        <div className="adm-pay-list">
          {displayed.length === 0 ? (
            <div className="adm-mw-empty">No requests found.</div>
          ) : displayed.map((r, i) => (
            <div className="adm-pay-card" key={i}>
              <div className="adm-pay-card-top">
                <div>
                  <div className="adm-pay-uid">{r.userId}</div>
                  <div className="adm-pay-time">{r.time}</div>
                  <div className="adm-pay-refid">{r.refId}</div>
                </div>
                <span className="adm-pay-status" style={{ background: statusColor(r.status) + '22', color: statusColor(r.status), border: `1px solid ${statusColor(r.status)}` }}>
                  {r.status}
                </span>
              </div>
              <div className="adm-pay-grid">
                <span className="adm-pay-dl">Type</span>
                <span className="adm-pay-dv bold">{r.type}</span>
                <span className="adm-pay-dl">Amount</span>
                <span className="adm-pay-dv bold">₹{r.amount.toFixed(6)}</span>
                <span className="adm-pay-dl">Broker</span>
                <span className="adm-pay-dv">{r.broker}</span>
                <span className="adm-pay-dl">Updated</span>
                <span className="adm-pay-dv">{r.updated}</span>
              </div>
              {r.type === 'WITHDRAWAL' && r.accountName && (
                <div className="adm-pay-account-box">
                  <div className="adm-pay-account-title">Account Details</div>
                  <div className="adm-pay-account-grid">
                    <span className="adm-pay-dl">Name</span><span className="adm-pay-dv bold">{r.accountName}</span>
                    <span className="adm-pay-dl">Account No</span><span className="adm-pay-dv">{r.accountNo}</span>
                    <span className="adm-pay-dl">IFSC</span><span className="adm-pay-dv">{r.ifsc}</span>
                    <span className="adm-pay-dl">UPI</span><span className="adm-pay-dv">{r.upi}</span>
                  </div>
                </div>
              )}
              <div className="adm-pay-actions">
                <button className="adm-pay-btn accept">Accept</button>
                <button className="adm-pay-btn reject">Reject</button>
                <button className="adm-pay-btn position">Position</button>
                <button className="adm-pay-btn ledger">Ledger</button>
                <button className="adm-pay-btn delete">Delete</button>
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
