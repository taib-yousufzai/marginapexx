'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Footer from '@/components/Footer';
import Sidebar from '@/components/Sidebar';
import KiteConnectButton from '@/components/KiteConnectButton';
import { getSession, getRole } from '@/lib/auth';
import { useKiteQuotes } from '@/hooks/useKiteQuotes';
import TickFlash from '@/components/TickFlash';
import './page.css';
import './admin-layout.css';

// --- Kite instrument keys for the market overview ---
const KITE_INSTRUMENTS_ROW1 = [
  'NSE:NIFTY 50',
  'BSE:SENSEX',
  'NSE:NIFTY BANK',
  'CDS:USDINR26JUNFUT',
];
const KITE_INSTRUMENTS_ROW2 = [
  'MCX:CRUDEOIL26JUNFUT',
  'MCX:GOLD26JUNFUT',
  'MCX:SILVER26JULFUT',
  'MCX:NATURALGAS26JUNFUT',
];

const KITE_DISPLAY_MAP: Record<string, { name: string; icon: string }> = {
  'NSE:NIFTY 50': { name: 'NIFTY 50', icon: 'fas fa-chart-line' },
  'BSE:SENSEX': { name: 'SENSEX', icon: 'fas fa-chart-area' },
  'NSE:NIFTY BANK': { name: 'BANK NIFTY', icon: 'fas fa-building' },
  'CDS:USDINR26JUNFUT': { name: 'USD/INR', icon: 'fas fa-dollar-sign' },
  'MCX:CRUDEOIL26JUNFUT': { name: 'CRUDE OIL', icon: 'fas fa-oil-can' },
  'MCX:GOLD26JUNFUT': { name: 'GOLD', icon: 'fas fa-coins' },
  'MCX:SILVER26JULFUT': { name: 'SILVER', icon: 'fas fa-gem' },
  'MCX:NATURALGAS26JUNFUT': { name: 'NAT GAS', icon: 'fas fa-fire' },
};

type MarketItem = { name: string; price: number; change: number; changeAmt?: number; type: string; icon: string };

const learningData = [
  { id: 1, name: "Try Algo", icon: "fas fa-chart-line", iconClass: "algo", badge: "Free", action: "algo" },
  { id: 2, name: "AI Trading", icon: "fas fa-brain", iconClass: "ai", badge: "Beta", action: "ai" },
  { id: 3, name: "Indicator", icon: "fas fa-chart-bar", iconClass: "indicator", badge: "Pro", action: "indicator" },
  { id: 4, name: "Course", icon: "fas fa-video", iconClass: "default", badge: "Enroll", action: "course" },
  { id: 5, name: "Classes", icon: "fas fa-chalkboard-user", iconClass: "default", badge: "Live", action: "classes" },
  { id: 6, name: "Books", icon: "fas fa-book", iconClass: "default", badge: "Free", action: "books" }
];

const equityInstruments = [
  { name: "NIFTY", icon: "fas fa-chart-line", sub: "50 Stocks" },
  { name: "SENSEX", icon: "fas fa-chart-area", sub: "30 Stocks" },
  { name: "BANKNIFTY", icon: "fas fa-building", sub: "Banking" },
  { name: "BANKEX", icon: "fas fa-university", sub: "Bank Index" },
  { name: "FINNIFTY", icon: "fas fa-chart-pie", sub: "Financial" },
  { name: "MIDCAP", icon: "fas fa-chart-bar", sub: "Mid Cap" }
];

const commodityInstruments = [
  { name: "GOLD", icon: "fas fa-coins", sub: "Gold Spot" },
  { name: "SILVER", icon: "fas fa-gem", sub: "Silver" },
  { name: "CRUDEOIL", icon: "fas fa-oil-can", sub: "Crude Oil" },
  { name: "NATURALGAS", icon: "fas fa-fire", sub: "Nat Gas" },
  { name: "GOLD MINI", icon: "fas fa-coins", sub: "Mini Gold" },
  { name: "SILVER MINI", icon: "fas fa-gem", sub: "Mini Silver" },
  { name: "CRUDE MINI", icon: "fas fa-oil-can", sub: "Mini Crude" },
  { name: "NG MINI", icon: "fas fa-fire", sub: "Mini NG" }
];

const getNextExpiryDate = (dayOfWeek: number) => {
  const today = new Date();
  const todayDay = today.getDay();
  let daysUntil = dayOfWeek - todayDay;
  if (daysUntil < 0) daysUntil += 7;
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + daysUntil);
  return {
    dateStr: targetDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
    isToday: daysUntil === 0
  };
};

const getExpiryIndexes = () => [
  { name: "NIFTY",       fullName: "NIFTY 50",     shortCode: "N50",  expiry: getNextExpiryDate(4), lotSize: 50  },
  { name: "BANKNIFTY",   fullName: "BANK NIFTY",   shortCode: "BNF",  expiry: getNextExpiryDate(3), lotSize: 15  },
  { name: "FINNIFTY",    fullName: "FIN NIFTY",    shortCode: "FIN",  expiry: getNextExpiryDate(2), lotSize: 40  },
  { name: "SENSEX",      fullName: "SENSEX",       shortCode: "SEN",  expiry: getNextExpiryDate(5), lotSize: 10  },
  { name: "MIDCAP",      fullName: "MIDCAP NIFTY", shortCode: "MID",  expiry: getNextExpiryDate(1), lotSize: 75  },
  { name: "BANKEX",      fullName: "BANKEX",       shortCode: "BKX",  expiry: getNextExpiryDate(5), lotSize: 15  },
];

const playNotificationSound = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const now = ctx.currentTime;
    
    // Play a gentle two-tone chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
    gain1.gain.setValueAtTime(0.12, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc1.start(now);
    osc1.stop(now + 0.4);
  } catch (err) {
    console.warn('Audio play failed:', err);
  }
};

export default function Page() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [allowedSegments, setAllowedSegments] = useState<string[]>([]);

  useEffect(() => {
    getSession().then((session) => {
      if (!session) { router.replace('/login'); return; }
      const role = getRole(session.user);
      if (role === 'admin' || role === 'super_admin') { router.replace('/admin'); return; }
      if (role === 'broker') { router.replace('/broker'); return; }
    });
  }, [router]);

  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [pathname]);

  useEffect(() => {
    async function fetchAllowedSegments() {
      try {
        const { supabase } = await import('@/lib/supabaseClient');
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/user/profile', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.ok) {
          const profile = await res.json();
          if (profile && profile.segments) {
            setAllowedSegments(profile.segments);
          }
        }
      } catch (err) {
        console.error('Failed to fetch allowed segments', err);
      }
    }
    fetchAllowedSegments();
  }, []);

  const [activeCategory, setActiveCategory] = useState<'equity' | 'commodity'>('equity');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isExpiryDrawerOpen, setIsExpiryDrawerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{ id: string; title: string; message: string; read?: boolean }[]>([]);
  const [isNotifDrawerOpen, setIsNotifDrawerOpen] = useState(false);
  const [activePopupNotif, setActivePopupNotif] = useState<{ id: string; title: string; message: string } | null>(null);

  const [tradingHours, setTradingHours] = useState<{ id: string; name: string; start_time: string; end_time: string; is_active: boolean }[]>([]);

  useEffect(() => {
    async function fetchTradingHours() {
      const { data, error } = await supabase
        .from('trading_hours')
        .select('*')
        .eq('is_active', true);
      if (!error && data) {
        setTradingHours(data);
      }
    }
    fetchTradingHours();
  }, []);

  const getSegmentStatus = (seg: { start_time: string; end_time: string }) => {
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const dayOfWeek = nowIST.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    if (isWeekend) {
      return { status: 'closed', label: 'Closed (Weekend)' };
    }
    
    const currentHHMM = `${String(nowIST.getHours()).padStart(2, '0')}:${String(nowIST.getMinutes()).padStart(2, '0')}`;
    
    if (currentHHMM < seg.start_time) {
      return { status: 'closed', label: `Closed (Opens ${seg.start_time})` };
    } else if (currentHHMM >= seg.end_time) {
      return { status: 'closed', label: `Closed (Closed at ${seg.end_time})` };
    } else {
      return { status: 'open', label: `Open (Closes ${seg.end_time})` };
    }
  };

  const handleDismissPopup = async () => {
    if (!activePopupNotif) return;
    const dismissedId = activePopupNotif.id;
    
    // Optimistically update notifications list to mark it read
    setNotifications(prev => prev.map(n => n.id === dismissedId ? { ...n, read: true } : n));
    setActivePopupNotif(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`/api/notifications/${dismissedId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}` }
      });
    } catch (err) {
      console.error('Failed to mark notification as read', err);
    }
  };

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const res = await fetch('/api/notifications?limit=20', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.ok) {
          const result = await res.json();
          if (result && result.notifications) {
            const list = result.notifications ?? [];
            setNotifications(list);
            
            // Check if there is an unread notification to display as a popup
            const firstUnread = list.find((n: any) => !n.read);
            if (firstUnread) {
              setActivePopupNotif(firstUnread);
              playNotificationSound();
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch notifications', err);
      }
    };
    fetchNotifications();
  }, []);

  const allKiteInstruments = [...KITE_INSTRUMENTS_ROW1, ...KITE_INSTRUMENTS_ROW2];
  const { quotes, connected: kiteConnected, loading: kiteLoading } = useKiteQuotes(allKiteInstruments, 1000);

  const buildRow = (instruments: string[]): MarketItem[] => {
    return instruments.map((key) => {
      const q = quotes[key];
      const display = KITE_DISPLAY_MAP[key] ?? { name: key, icon: 'fas fa-chart-line' };
      if (!q) return { name: display.name, price: 0, change: 0, changeAmt: 0, type: 'positive', icon: display.icon };
      return {
        name: display.name,
        price: q.lastPrice,
        change: q.changePercent,
        changeAmt: q.change,
        type: q.changePercent >= 0 ? 'positive' : 'negative',
        icon: display.icon,
      };
    });
  };

  const marketRow1 = buildRow(KITE_INSTRUMENTS_ROW1);
  const marketRow2 = buildRow(KITE_INSTRUMENTS_ROW2);

  useEffect(() => {
    const savedTheme = localStorage.getItem('marginApexTheme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTimeout(() => {
        setTheme(savedTheme);
        document.body.classList.toggle('dark', savedTheme === 'dark');
      }, 0);
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.body.classList.toggle('dark', newTheme === 'dark');
    localStorage.setItem('marginApexTheme', newTheme);
  };

  const mapOptionChainSymbolToDbSegment = (sym: string): string => {
    const s = sym.toUpperCase().trim();
    if (['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCAP', 'SENSEX', 'BANKEX'].includes(s)) {
      return 'INDEX-OPT';
    }
    if (['GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS', 'GOLD MINI', 'SILVER MINI', 'CRUDE MINI', 'NG MINI'].includes(s)) {
      return 'MCX-OPT';
    }
    return 'STOCK-OPT';
  };

  const filteredEquityInstruments = equityInstruments.filter(inst => {
    if (allowedSegments.length === 0) return true;
    const dbSeg = mapOptionChainSymbolToDbSegment(inst.name);
    return allowedSegments.includes(dbSeg);
  });

  const filteredCommodityInstruments = commodityInstruments.filter(inst => {
    if (allowedSegments.length === 0) return true;
    const dbSeg = mapOptionChainSymbolToDbSegment(inst.name);
    return allowedSegments.includes(dbSeg);
  });

  const instruments = activeCategory === 'equity' ? filteredEquityInstruments : filteredCommodityInstruments;

  const filteredExpiryIndexes = getExpiryIndexes().filter(item => {
    if (allowedSegments.length === 0) return true;
    const dbSeg = mapOptionChainSymbolToDbSegment(item.name);
    return allowedSegments.includes(dbSeg);
  });

  return (
    <div className="desktop-layout">
      <Sidebar />
      
      <main className="main-viewport">
        <div className="app-container">
          {/* Mobile Navigation Bar */}
          <div className="nav-bar-full mobile-only">
            <div className="nav-icon-btn" onClick={() => setIsNotifDrawerOpen(true)}><i className="fas fa-bell"></i></div>
            <div className="nav-app-name">MARGIN<span style={{ color: '#006400' }}>APEX</span></div>
            <div className="nav-group">
              <div className="nav-icon-btn" onClick={toggleTheme}><i className={theme === 'dark' ? "fas fa-sun" : "fas fa-moon"}></i></div>
              <div className="nav-funds" onClick={() => router.push('/funds')}><i className="fas fa-coins"></i><span>Funds</span></div>
              <div className="nav-icon-btn" onClick={() => router.push('/profile')}><i className="fas fa-user-cog"></i></div>
            </div>
          </div>

          <div ref={containerRef} className="main-scroll-wrapper">
            <div className="main-content">
              <div className="screen">
                <div className="content-padded">
                  {/* WhatsApp Community */}
                  <div className="whatsapp-community" onClick={() => window.open(process.env.NEXT_PUBLIC_WHATSAPP_COMMUNITY_LINK || 'https://chat.whatsapp.com/', '_blank')}>
                    <div className="whatsapp-inner">
                      <div className="whatsapp-icon"><i className="fab fa-whatsapp"></i></div>
                      <div className="whatsapp-content">
                        <div className="whatsapp-headline">FREE WHATSAPP COMMUNITY</div>
                        <div className="whatsapp-sub"><i className="fas fa-lightbulb"></i> You&apos;ll get FREE tips here — join now!</div>
                      </div>
                      <div className="whatsapp-arrow"><i className="fas fa-chevron-right"></i></div>
                    </div>
                  </div>

                  {/* Margin Settings */}
                  <div className="margin-settings-row" onClick={() => router.push('/margin-settings')}>
                    <div className="margin-settings-left">
                      <div className="margin-settings-icon"><i className="fas fa-chart-line"></i></div>
                      <div className="margin-settings-text"><h4>Margin Settings</h4><p>Check margin &amp; trading rules before trading</p></div>
                    </div>
                    <div className="margin-settings-arrow"><i className="fas fa-arrow-right"></i></div>
                  </div>

                  {/* Option Chain */}
                  <div className="option-chain-section">
                    <div className="section-header">
                      <div className="section-title"><i className="fas fa-link"></i> OPTION CHAIN</div>
                      <span className="mobile-only" style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Swipe →</span>
                    </div>
                    <div className="category-toggle-wrapper">
                      <div className={`category-toggle-slider ${activeCategory === 'commodity' ? 'slide-right' : ''}`}></div>
                      <div className={`cat-btn ${activeCategory === 'equity' ? 'active' : ''}`} onClick={() => setActiveCategory('equity')}>EQUITY</div>
                      <div className={`cat-btn ${activeCategory === 'commodity' ? 'active' : ''}`} onClick={() => setActiveCategory('commodity')}>COMMODITY</div>
                    </div>
                    <div className="scrollable-instruments">
                      <div className="instruments-row">
                        {instruments.map((inst, i) => (
                          <div className="circle-instrument" key={i} onClick={() => router.push(`/option-chain?symbol=${encodeURIComponent(inst.name)}`)}>
                            <div className="circle-icon"><i className={inst.icon}></i></div>
                            <div className="circle-label">{inst.name}</div>
                            <div className="circle-sub">{inst.sub}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Expiry Today */}
                  <div className="expiry-block" onClick={() => setIsExpiryDrawerOpen(true)}>
                    <div className="expiry-left">
                      <div className="expiry-icon"><i className="fas fa-calendar-day"></i></div>
                      <div className="expiry-text">
                        <h4>EXPIRY TODAY</h4>
                        <p>
                          {(() => {
                            const day = new Date().getDay();
                            switch(day) {
                              case 1: return "MIDCPNIFTY";
                              case 2: return "FINNIFTY";
                              case 3: return "BANKNIFTY";
                              case 4: return "NIFTY 50";
                              case 5: return "SENSEX & BANKEX";
                              default: return "No Expiry Today";
                            }
                          })()}
                        </p>
                      </div>
                    </div>
                    <div className="expiry-arrow"><i className="fas fa-arrow-right"></i></div>
                  </div>

                  {/* Market Overview */}
                  <div className="market-overview">
                    <div className="overview-header">
                      <h4>Live Market Overview</h4>
                      {kiteConnected && (
                        <span className="live-badge"><span className="live-dot" /> LIVE</span>
                      )}
                    </div>



                    {kiteLoading && (
                      <div className="market-status-msg"><i className="fas fa-circle-notch fa-spin" /> Checking connection…</div>
                    )}

                    {!kiteLoading && !kiteConnected && Object.keys(quotes).length === 0 && (
                      <div className="kite-connect-prompt">
                        <i className="fas fa-plug" />
                        <div>
                          <div className="prompt-title">No live data</div>
                          <div className="prompt-desc">Connect your Zerodha account to see real-time prices.</div>
                        </div>
                        <KiteConnectButton />
                      </div>
                    )}

                    {!kiteLoading && Object.keys(quotes).length > 0 && (
                      <div className="markets-two-rows">
                        {[marketRow1, marketRow2].map((row, rowIdx) => (
                          <div className="market-row-scroll" key={`row-${rowIdx}`}>
                            <div className="market-row-blocks">
                              {row.map((market, i) => (
                                <div className="market-rectangle" key={i} onClick={() => router.push(`/watchlist?symbol=${encodeURIComponent(market.name)}`)}>
                                  <div className="market-rect-header">
                                    <span className="market-rect-name">{market.name}</span>
                                  </div>
                                  <div className="market-rect-price">
                                    {market.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                  <div className={`market-rect-change ${market.type}`}>
                                    {market.change >= 0 
                                      ? `+${(market.changeAmt ?? 0).toFixed(2)} (+${market.change.toFixed(2)}%)` 
                                      : `${(market.changeAmt ?? 0).toFixed(2)} (${market.change.toFixed(2)}%)`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* AI & Learning */}
                  <div className="learning-section">
                    <div className="section-title"><i className="fas fa-robot"></i> AI &amp; LEARNING</div>
                    <div className="learning-grid">
                      {learningData.map((item, i) => (
                        <div className="learning-card" key={i} onClick={() => router.push(`/learning/${item.action}`)}>
                          <div className={`learning-icon ${item.iconClass}`}><i className={item.icon}></i></div>
                          <div className="learning-title">{item.name}</div>
                          <div className="learning-badge">{item.badge}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* WhatsApp Support */}
                  <div className="whatsapp-support" onClick={() => window.open(`https://wa.me/${(process.env.NEXT_PUBLIC_SUPPORT_NUMBER || '').replace(/[^0-9]/g, '')}`, '_blank')}>
                    <div className="whatsapp-inner">
                      <div className="whatsapp-icon"><i className="fab fa-whatsapp"></i></div>
                      <div className="whatsapp-content">
                        <div className="whatsapp-headline">24/7 WHATSAPP SUPPORT</div>
                        <div className="whatsapp-sub"><i className="fas fa-headset"></i> Get instant help anytime</div>
                      </div>
                      <div className="whatsapp-arrow"><i className="fas fa-chevron-right"></i></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <Footer activeTab="home" />
        </div>

        {/* Drawers */}
        <div className={`expiry-half-drawer-overlay ${isExpiryDrawerOpen ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setIsExpiryDrawerOpen(false); }}>
          <div className="expiry-half-sheet ew-sheet">
            {/* drag handle */}
            <div className="ew-handle"></div>

            {/* Header */}
            <div className="ew-header">
              <div className="ew-header-left">
                <div className="ew-cal-icon"><i className="fas fa-calendar-check"></i></div>
                <span className="ew-title">Expiry watchlist</span>
              </div>
              <button className="ew-close" onClick={() => setIsExpiryDrawerOpen(false)}>✕</button>
            </div>
            {/* List */}
            <div className="ew-list">
              {filteredExpiryIndexes.map((item, i) => (
                <div
                  key={i}
                  className={`ew-item${item.expiry.isToday ? ' ew-item--today' : ''}`}
                  onClick={() => {
                    setIsExpiryDrawerOpen(false);
                    router.push(`/option-chain?symbol=${encodeURIComponent(item.name)}`);
                  }}
                >
                  {/* EXPIRES TODAY banner */}
                  {item.expiry.isToday && (
                    <div className="ew-today-banner">
                      <span>EXPIRES TODAY</span>
                    </div>
                  )}

                  {/* Short code badge */}
                  <div className="ew-code">{item.shortCode}</div>

                  {/* Info */}
                  <div className="ew-info">
                    <div className="ew-name">{item.fullName}</div>
                    <div className="ew-meta">
                      <span className="ew-date-pill">{item.expiry.dateStr}</span>
                      <span className="ew-lot">Lot: {item.lotSize}</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className={`ew-arrow${item.expiry.isToday ? ' ew-arrow--today' : ''}`}>
                    <i className="fas fa-chevron-right"></i>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`expiry-half-drawer-overlay ${isNotifDrawerOpen ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setIsNotifDrawerOpen(false); }}>
          <div className="expiry-half-sheet">
            <div className="expiry-sheet-header">
              <h3><i className="fas fa-bell"></i> Notifications</h3>
              <div className="expiry-sheet-close" onClick={() => setIsNotifDrawerOpen(false)}><i className="fas fa-times"></i></div>
            </div>
            <div className="notif-list">
              {notifications.length === 0 ? <div className="no-data">No notifications</div> : notifications.map(n => (
                <div key={n.id} className="notif-item">
                  <div className="notif-title">{n.title}</div>
                  <div className="notif-msg">{n.message}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {toastMessage && <div className="toast-msg">{toastMessage}</div>}

        {activePopupNotif && (
          <div className="notif-popup-overlay">
            <div className="notif-popup-card">
              <div className="notif-popup-icon">
                <i className="fas fa-bell"></i>
              </div>
              <h3 className="notif-popup-title">{activePopupNotif.title}</h3>
              <p className="notif-popup-message">{activePopupNotif.message}</p>
              <button className="notif-popup-btn" onClick={handleDismissPopup}>
                Acknowledge
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
