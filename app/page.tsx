'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Footer from '@/components/Footer';
import { getSession } from '@/lib/auth';
import './page.css';

// --- DATA CONSTANTS ---
const marketRow1 = [
  { name: "NIFTY 50", price: 79842.35, change: 0.62, type: "positive", icon: "fas fa-chart-line" },
  { name: "SENSEX", price: 264512.80, change: 0.48, type: "positive", icon: "fas fa-chart-simple" },
  { name: "BANK NIFTY", price: 51234.65, change: 0.35, type: "positive", icon: "fas fa-building" },
  { name: "USD/INR", price: 83.42, change: -0.18, type: "negative", icon: "fas fa-dollar-sign" },
  { name: "EUR/USD", price: 1.0875, change: 0.12, type: "positive", icon: "fas fa-euro-sign" },
  { name: "GBP/USD", price: 1.2640, change: -0.08, type: "negative", icon: "fas fa-pound-sign" }
];

const marketRow2 = [
  { name: "USD/JPY", price: 151.42, change: -0.25, type: "negative", icon: "fas fa-chart-line" },
  { name: "BTC/USD", price: 71892.40, change: 2.85, type: "positive", icon: "fab fa-bitcoin" },
  { name: "ETH/USD", price: 3820.15, change: 1.92, type: "positive", icon: "fab fa-ethereum" },
  { name: "XAU/USD", price: 2478.30, change: 0.95, type: "positive", icon: "fas fa-coins" },
  { name: "XAG/USD", price: 28.90, change: 1.12, type: "positive", icon: "fas fa-gem" },
  { name: "CRUDEOIL", price: 82.40, change: -0.45, type: "negative", icon: "fas fa-oil-can" }
];

const learningData = [
  { id: 1, name: "Try Algo", icon: "fas fa-chart-line", iconClass: "algo", badge: "Free", action: "algo" },
  { id: 2, name: "AI Trading", icon: "fas fa-brain", iconClass: "ai", badge: "Beta", action: "ai" },
  { id: 3, name: "Indicator", icon: "fas fa-chart-simple", iconClass: "default", badge: "Pro", action: "indicator" },
  { id: 4, name: "Course", icon: "fas fa-video", iconClass: "default", badge: "Enroll", action: "course" },
  { id: 5, name: "Classes", icon: "fas fa-chalkboard-user", iconClass: "default", badge: "Live", action: "classes" },
  { id: 6, name: "Books", icon: "fas fa-book", iconClass: "default", badge: "Free", action: "books" }
];

const equityInstruments = [
  { name: "NIFTY", icon: "fas fa-chart-line", sub: "50 Stocks" },
  { name: "SENSEX", icon: "fas fa-chart-simple", sub: "30 Stocks" },
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

const expiryIndexes = [
  { name: "NIFTY", fullName: "NIFTY 50", expiryDate: "28 Mar 2026", lotSize: 50, icon: "fas fa-chart-line" },
  { name: "BANK NIFTY", fullName: "BANK NIFTY", expiryDate: "28 Mar 2026", lotSize: 25, icon: "fas fa-building" },
  { name: "SENSEX", fullName: "SENSEX", expiryDate: "28 Mar 2026", lotSize: 15, icon: "fas fa-chart-simple" },
  { name: "BANKEX", fullName: "BANKEX", expiryDate: "28 Mar 2026", lotSize: 20, icon: "fas fa-university" },
  { name: "FIN NIFTY", fullName: "FINNIFTY", expiryDate: "28 Mar 2026", lotSize: 40, icon: "fas fa-chart-pie" },
  { name: "MIDCAP NIFTY", fullName: "MIDCAP NIFTY", expiryDate: "28 Mar 2026", lotSize: 75, icon: "fas fa-chart-bar" }
];

export default function Page() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [scrollKey, setScrollKey] = useState(() => Date.now());

  useEffect(() => {
    if (!getSession()) {
      router.replace('/login');
    } else {
      setIsChecking(false);
    }
  }, [router]);

  useEffect(() => {
    setScrollKey(Date.now());
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = 0;
    // Keep resetting until stable
    const interval = setInterval(() => {
      if (el.scrollTop !== 0) el.scrollTop = 0;
      else clearInterval(interval);
    }, 16);
    setTimeout(() => clearInterval(interval), 500);
  }, [pathname]);
  const [activeCategory, setActiveCategory] = useState<'equity' | 'commodity'>('equity');
  const [fundsBalance, setFundsBalance] = useState(8142.60);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isExpiryDrawerOpen, setIsExpiryDrawerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [infoState, setInfoState] = useState<{ title: string, content: string } | null>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem('marginApexTheme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.body.classList.toggle('dark', savedTheme === 'dark');
    }

    const resetScroll = () => {
      if (containerRef.current) containerRef.current.scrollTop = 0;
    };

    resetScroll();
    requestAnimationFrame(() => {
      requestAnimationFrame(resetScroll);
    });

    window.addEventListener('popstate', resetScroll);
    return () => {
      window.removeEventListener('popstate', resetScroll);
    };
  }, []);

  // Reset scroll every time we navigate back to home
  useEffect(() => {
    if (containerRef.current) containerRef.current.scrollTop = 0;
  }, [pathname]);

  if (isChecking) return null;

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.body.classList.toggle('dark', newTheme === 'dark');
    localStorage.setItem('marginApexTheme', newTheme);
    showToast(newTheme === 'dark' ? '🌙 Dark mode' : '☀️ Light mode', 1000);
  };

  const showToast = (msg: string, duration = 2000) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, duration);
  };

  const handleNavFunds = () => {
    showToast(`💰 Funds: $${fundsBalance.toFixed(2)} | Tap again to add $500`, 1200);
    if (window.confirm(`Add $500 demo funds?`)) {
      setFundsBalance(prev => prev + 500);
      showToast("✅ +$500 added to funds", 1500);
    }
  };

  const handleNavNotification = () => showToast("🔔 New: Margin updates & trading reminders", 2000);
  const handleNavSettings = () => { window.location.href = '/profile'; };

  const handleWhatsAppCommunity = () => {
    setInfoState({
      title: "🎯 WHATSAPP COMMUNITY",
      content: "✅ Free daily trading tips\n✅ Live market updates\n✅ Expert insights\n✅ Signal alerts\n\nClick to receive invite link (Demo)"
    });
  };

  const handleWhatsAppSupport = () => {
    setInfoState({
      title: "📞 24/7 WHATSAPP SUPPORT",
      content: "Get instant help anytime on WhatsApp.\n\nClick to chat with our support team."
    });
  };

  const redirectToMarginSettings = () => {
    window.location.href = '/margin-settings';
  };

  const handleLearningCardClick = (item: { name: string; action: string; icon: string; iconClass: string; badge: string; id: number }) => {
    const messages: Record<string, string> = {
      algo: "🤖 TRY OUR ALGO: Automated trading strategies — start free trial!",
      ai: "🧠 AI TRADING: Machine learning predictions — get beta access!",
      indicator: "📊 Purchase Indicator: Advanced signals — starts at $49/mo",
      course: "📚 Trading Course: Complete masterclass",
      classes: "🎓 Trading Classes: Live weekly sessions",
      books: "📖 Books: Download free e-books"
    };
    const msg = messages[item.action] || `✨ ${item.name}`;
    setInfoState({
      title: `🔹 ${item.name.toUpperCase()}`,
      content: msg
    });
  };

  const instruments = activeCategory === 'equity' ? equityInstruments : commodityInstruments;

  return (
    <div className="app-container">
      {/* Top Navigation Bar */}
      <div className="nav-bar-full">
        <div className="nav-icon-btn" onClick={handleNavNotification}><i className="fas fa-bell"></i></div>
        <div className="nav-app-name">MARGIN<span style={{ color: '#006400' }}>APEX</span></div>
        <div className="nav-group">
          <div className="nav-icon-btn" onClick={toggleTheme}><i className={theme === 'dark' ? "fas fa-sun" : "fas fa-moon"}></i></div>
          <div className="nav-funds" onClick={handleNavFunds}><i className="fas fa-coins"></i><span>Funds</span></div>
          <div className="nav-icon-btn" onClick={handleNavSettings}><i className="fas fa-user-cog"></i></div>
        </div>
      </div>

      {/* Scrollable Main Content - only this div scrolls */}
      <div ref={containerRef} key={scrollKey} className="main-scroll-wrapper" style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }} onScroll={() => {}}>
        {/* Scrollable Main Content */}
        <div className="main-content">
          <div className="screen">
            <div className="content-padded">
              {/* WhatsApp Community Button */}
              <div className="whatsapp-community" onClick={handleWhatsAppCommunity}>
                <div className="whatsapp-inner">
                  <div className="whatsapp-icon"><i className="fab fa-whatsapp"></i></div>
                  <div className="whatsapp-content">
                    <div className="whatsapp-headline">FREE WHATSAPP COMMUNITY</div>
                    <div className="whatsapp-sub"><i className="fas fa-lightbulb"></i> You&apos;ll get FREE tips here — join now!</div>
                  </div>
                  <div className="whatsapp-arrow"><i className="fas fa-chevron-right"></i></div>
                </div>
              </div>

              {/* Margin Settings Row */}
              <div className="margin-settings-row" onClick={redirectToMarginSettings}>
                <div className="margin-settings-left">
                  <div className="margin-settings-icon"><i className="fas fa-chart-line"></i></div>
                  <div className="margin-settings-text"><h4>Margin Settings</h4><p>Check requirements &amp; limits</p></div>
                </div>
                <div className="margin-settings-arrow"><i className="fas fa-arrow-right"></i></div>
              </div>

              {/* Option Chain */}
              <div className="option-chain-section">
                <div className="section-header">
                  <div className="section-title"><i className="fas fa-link"></i> OPTION CHAIN</div>
                  <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Swipe →</span>
                </div>
                <div className="category-toggle-wrapper">
                  <div className={`category-toggle-slider ${activeCategory === 'commodity' ? 'slide-right' : ''}`}></div>
                  <div className={`cat-btn ${activeCategory === 'equity' ? 'active' : ''}`} onClick={() => { setActiveCategory('equity'); showToast('📊 EQUITY option chain loaded', 1000); }}>EQUITY</div>
                  <div className={`cat-btn ${activeCategory === 'commodity' ? 'active' : ''}`} onClick={() => { setActiveCategory('commodity'); showToast('🏆 COMMODITY option chain loaded', 1000); }}>COMMODITY</div>
                </div>
                <div className="scrollable-instruments">
                  <div className="instruments-row">
                    {instruments.map((inst, i) => (
                      <div className="circle-instrument" key={i} onClick={() => {
                        setInfoState({
                          title: `📈 OPTION CHAIN: ${inst.name}`,
                          content: `Expiry: ${new Date().toLocaleDateString()}\nCALL OI: 1,24,500 | PUT OI: 98,200`
                        });
                      }}>
                        <div className="circle-icon"><i className={inst.icon}></i></div>
                        <div className="circle-label">{inst.name}</div>
                        <div className="circle-sub">{inst.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Expiry Today */}
              <div className="expiry-block" onClick={() => { setIsExpiryDrawerOpen(true); showToast("📅 Upcoming expiries — tap arrow to open option chain", 1500); }}>
                <div className="expiry-left">
                  <div className="expiry-icon"><i className="fas fa-calendar-day"></i></div>
                  <div className="expiry-text">
                    <h4>EXPIRY TODAY</h4>
                    <p>Weekly &amp; Monthly contracts</p>
                  </div>
                </div>
                <div className="expiry-arrow"><i className="fas fa-arrow-right"></i></div>
              </div>

              {/* Market Overview */}
              <div className="market-overview">
                <div className="overview-header">
                  <h4>Live Market Overview</h4>
                </div>
                <div className="markets-two-rows">
                  {[marketRow1, marketRow2].map((row, rowIdx) => (
                    <div className="market-row-scroll" key={`market-row-${rowIdx}`}>
                      <div className="market-row-blocks">
                        {row.map((market, i) => {
                          const changePercent = market.change > 0 ? `+${market.change}%` : `${market.change}%`;
                          const formattedPrice = market.price.toLocaleString('en-IN', { minimumFractionDigits: market.price < 100 ? 2 : 0 });
                          return (
                            <div className="market-rectangle" key={i} onClick={() => showToast(`📊 ${market.name} : ${formattedPrice} (${changePercent})`, 1500)}>
                              <div className="market-rect-header">
                                <i className={market.icon}></i>
                                <span className="market-rect-name">{market.name}</span>
                              </div>
                              <div className="market-rect-price">{formattedPrice}</div>
                              <div className={`market-rect-change ${market.type}`}>{changePercent}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* AI & Learning */}
              <div className="learning-section">
                <div className="section-title"><i className="fas fa-robot"></i> AI &amp; LEARNING</div>
                <div className="learning-grid">
                  {learningData.map((item, i) => (
                    <div className="learning-card" key={i} onClick={() => handleLearningCardClick(item)}>
                      <div className={`learning-icon ${item.iconClass}`}>
                        <i className={item.icon}></i>
                      </div>
                      <div className="learning-title">{item.name}</div>
                      <div className="learning-badge">{item.badge}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* WhatsApp Support Button */}
              <div className="whatsapp-community" onClick={handleWhatsAppSupport} style={{ marginTop: '20px' }}>
                <div className="whatsapp-inner">
                  <div className="whatsapp-icon"><i className="fab fa-whatsapp"></i></div>
                  <div className="whatsapp-content">
                    <div className="whatsapp-headline">24/7 WHATSAPP SUPPORT</div>
                    <div className="whatsapp-sub"><i className="fas fa-headset"></i> Get instant help anytime on WhatsApp</div>
                  </div>
                  <div className="whatsapp-arrow"><i className="fas fa-chevron-right"></i></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Info Drawer */}
        <div className={`expiry-half-drawer-overlay ${infoState !== null ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setInfoState(null); }}>
          <div className="expiry-half-sheet">
            <div className="expiry-sheet-header">
              <h3><i className="fas fa-info-circle"></i> {infoState?.title}</h3>
              <div className="expiry-sheet-close" onClick={() => setInfoState(null)}><i className="fas fa-times"></i></div>
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6, whiteSpace: 'pre-line', paddingBottom: '20px' }}>
              {infoState?.content}
            </div>
          </div>
        </div>

        {/* Expiry Drawer */}
        <div className={`expiry-half-drawer-overlay ${isExpiryDrawerOpen ? 'active' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setIsExpiryDrawerOpen(false); }}>
          <div className="expiry-half-sheet">
            <div className="expiry-sheet-header">
              <h3><i className="fas fa-calendar-alt"></i> Upcoming Expiries</h3>
              <div className="expiry-sheet-close" onClick={() => setIsExpiryDrawerOpen(false)}><i className="fas fa-times"></i></div>
            </div>
            <div id="expiryListContainer">
              {expiryIndexes.map((item, i) => (
                <div className="expiry-list-item" key={i} onClick={() => {
                  setIsExpiryDrawerOpen(false);
                  setInfoState({
                    title: `📊 OPTION CHAIN: ${item.fullName}`,
                    content: `Expiry: ${item.expiryDate}\nStrike range: ATM +- 500\nCall OI: 2.4L | Put OI: 1.9L`
                  });
                }}>
                  <div className="expiry-info">
                    <h4><i className={item.icon} style={{ marginRight: '6px' }}></i> {item.name}</h4>
                    <p>📅 Expiry: {item.expiryDate} • Lot: {item.lotSize}</p>
                  </div>
                  <div className="expiry-arrow-btn"><i className="fas fa-arrow-right"></i></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Footer activeTab="home" />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast-msg" style={{ opacity: 1, transition: 'opacity 0.3s', pointerEvents: 'none' }}>
          {toastMessage}
        </div>
      )}
    </div>
  );
}
