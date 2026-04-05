
'use client';
import { useEffect, useRef } from 'react';
import Footer from '@/components/Footer';
import './page.css';

export default function Page() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Inject scripts
    const script = document.createElement('script');
    script.innerHTML = `
  // Market Data with reliable Font Awesome icons
  var marketRow1 = [
    { name: "NIFTY 50", price: 79842.35, change: 0.62, type: "positive", icon: "fas fa-chart-line" },
    { name: "SENSEX", price: 264512.80, change: 0.48, type: "positive", icon: "fas fa-chart-simple" },
    { name: "BANK NIFTY", price: 51234.65, change: 0.35, type: "positive", icon: "fas fa-building" },
    { name: "USD/INR", price: 83.42, change: -0.18, type: "negative", icon: "fas fa-dollar-sign" },
    { name: "EUR/USD", price: 1.0875, change: 0.12, type: "positive", icon: "fas fa-euro-sign" },
    { name: "GBP/USD", price: 1.2640, change: -0.08, type: "negative", icon: "fas fa-pound-sign" }
  ];
  var marketRow2 = [
    { name: "USD/JPY", price: 151.42, change: -0.25, type: "negative", icon: "fas fa-chart-line" },
    { name: "BTC/USD", price: 71892.40, change: 2.85, type: "positive", icon: "fab fa-bitcoin" },
    { name: "ETH/USD", price: 3820.15, change: 1.92, type: "positive", icon: "fab fa-ethereum" },
    { name: "XAU/USD", price: 2478.30, change: 0.95, type: "positive", icon: "fas fa-coins" },
    { name: "XAG/USD", price: 28.90, change: 1.12, type: "positive", icon: "fas fa-gem" },
    { name: "CRUDEOIL", price: 82.40, change: -0.45, type: "negative", icon: "fas fa-oil-can" }
  ];
  // Learning data
  var learningData = [
    { id: 1, name: "Try Algo", icon: "fas fa-chart-line", iconClass: "algo", badge: "Free", action: "algo" },
    { id: 2, name: "AI Trading", icon: "fas fa-brain", iconClass: "ai", badge: "Beta", action: "ai" },
    { id: 3, name: "Indicator", icon: "fas fa-chart-simple", iconClass: "default", badge: "Pro", action: "indicator" },
    { id: 4, name: "Course", icon: "fas fa-video", iconClass: "default", badge: "Enroll", action: "course" },
    { id: 5, name: "Classes", icon: "fas fa-chalkboard-user", iconClass: "default", badge: "Live", action: "classes" },
    { id: 6, name: "Books", icon: "fas fa-book", iconClass: "default", badge: "Free", action: "books" }
  ];
  var equityInstruments = [
    { name: "NIFTY", icon: "fas fa-chart-line", sub: "50 Stocks" },
    { name: "SENSEX", icon: "fas fa-chart-simple", sub: "30 Stocks" },
    { name: "BANKNIFTY", icon: "fas fa-building", sub: "Banking" },
    { name: "BANKEX", icon: "fas fa-university", sub: "Bank Index" },
    { name: "FINNIFTY", icon: "fas fa-chart-pie", sub: "Financial" },
    { name: "MIDCAP", icon: "fas fa-chart-bar", sub: "Mid Cap" }
  ];
  var commodityInstruments = [
    { name: "GOLD", icon: "fas fa-coins", sub: "Gold Spot" },
    { name: "SILVER", icon: "fas fa-gem", sub: "Silver" },
    { name: "CRUDEOIL", icon: "fas fa-oil-can", sub: "Crude Oil" },
    { name: "NATURALGAS", icon: "fas fa-fire", sub: "Nat Gas" },
    { name: "GOLD MINI", icon: "fas fa-coins", sub: "Mini Gold" },
    { name: "SILVER MINI", icon: "fas fa-gem", sub: "Mini Silver" },
    { name: "CRUDE MINI", icon: "fas fa-oil-can", sub: "Mini Crude" },
    { name: "NG MINI", icon: "fas fa-fire", sub: "Mini NG" }
  ];

  // Expiry data list
  var expiryIndexes = [
    { name: "NIFTY", fullName: "NIFTY 50", expiryDate: "28 Mar 2026", lotSize: 50, icon: "fas fa-chart-line" },
    { name: "BANK NIFTY", fullName: "BANK NIFTY", expiryDate: "28 Mar 2026", lotSize: 25, icon: "fas fa-building" },
    { name: "SENSEX", fullName: "SENSEX", expiryDate: "28 Mar 2026", lotSize: 15, icon: "fas fa-chart-simple" },
    { name: "BANKEX", fullName: "BANKEX", expiryDate: "28 Mar 2026", lotSize: 20, icon: "fas fa-university" },
    { name: "FIN NIFTY", fullName: "FINNIFTY", expiryDate: "28 Mar 2026", lotSize: 40, icon: "fas fa-chart-pie" },
    { name: "MIDCAP NIFTY", fullName: "MIDCAP NIFTY", expiryDate: "28 Mar 2026", lotSize: 75, icon: "fas fa-chart-bar" }
  ];

  var activeCategory = 'equity';
  var activeFooterTab = 'home';
  var fundsBalance = 8142.60;

  function showToast(msg, duration = 2000) {
    var existing = document.querySelector('.toast-msg');
    if(existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, duration);
  }

  // Footer is now a React component, drawer toggle relies on that component's state.

  function renderMarketTwoRows() {
    var container = document.getElementById('marketsTwoRows');
    if (!container) return;
    container.innerHTML = '';
    [marketRow1, marketRow2].forEach(row => {
      var rowDiv = document.createElement('div');
      rowDiv.className = 'market-row-scroll';
      var blocks = document.createElement('div');
      blocks.className = 'market-row-blocks';
      row.forEach(market => {
        var block = document.createElement('div');
        block.className = 'market-rectangle';
        var changePercent = market.change > 0 ? \`+\${market.change}%\` : \`\${market.change}%\`;
        var formattedPrice = market.price.toLocaleString(undefined, { minimumFractionDigits: market.price < 100 ? 2 : 0 });
        block.innerHTML = \`<div class="market-rect-header"><i class="\${market.icon}"></i><span class="market-rect-name">\${market.name}</span></div><div class="market-rect-price">\${formattedPrice}</div><div class="market-rect-change \${market.type}">\${changePercent}</div>\`;
        block.addEventListener('click', () => showToast(\`📊 \${market.name} : \${formattedPrice} (\${changePercent})\`, 1500));
        blocks.appendChild(block);
      });
      rowDiv.appendChild(blocks);
      container.appendChild(rowDiv);
    });
  }

  function renderLearningCards() {
    var container = document.getElementById('learningGrid');
    if (!container) return;
    container.innerHTML = '';
    learningData.forEach(item => {
      var card = document.createElement('div');
      card.className = 'learning-card';
      card.innerHTML = \`<div class="learning-icon \${item.iconClass}"><i class="\${item.icon}"></i></div><div class="learning-title">\${item.name}</div><div class="learning-badge">\${item.badge}</div>\`;
      card.addEventListener('click', () => {
        var msg = { algo: "🤖 TRY OUR ALGO: Automated trading strategies — start free trial!", ai: "🧠 AI TRADING: Machine learning predictions — get beta access!", indicator: "📊 Purchase Indicator: Advanced signals — starts at \$49/mo", course: "📚 Trading Course: Complete masterclass", classes: "🎓 Trading Classes: Live weekly sessions", books: "📖 Books: Download free e-books" }[item.action] || \`✨ \${item.name}\`;
        showToast(msg, 2000);
        setTimeout(() => alert(\`🔹 \${item.name.toUpperCase()}\\n\\n\${msg}\`), 200);
      });
      container.appendChild(card);
    });
  }

  function renderInstruments() {
    var container = document.getElementById('instrumentsRow');
    if (!container) return;
    var instruments = activeCategory === 'equity' ? equityInstruments : commodityInstruments;
    container.innerHTML = '';
    instruments.forEach(inst => {
      var circle = document.createElement('div');
      circle.className = 'circle-instrument';
      circle.innerHTML = \`<div class="circle-icon"><i class="\${inst.icon}"></i></div><div class="circle-label">\${inst.name}</div><div class="circle-sub">\${inst.sub || ''}</div>\`;
      circle.addEventListener('click', () => { showToast(\`📊 Opening Option Chain: \${inst.name}\`, 1500); setTimeout(() => alert(\`📈 OPTION CHAIN - \${inst.name}\\n\\nExpiry: \${new Date().toLocaleDateString()}\\nCALL OI: 1,24,500 | PUT OI: 98,200\`), 200); });
      container.appendChild(circle);
    });
  }

  function renderExpiryDrawerList() {
    var container = document.getElementById('expiryListContainer');
    if(!container) return;
    container.innerHTML = '';
    expiryIndexes.forEach(item => {
      var div = document.createElement('div');
      div.className = 'expiry-list-item';
      div.innerHTML = \`
        <div class="expiry-info">
          <h4><i class="\${item.icon}" style="margin-right:6px;"></i> \${item.name}</h4>
          <p>📅 Expiry: \${item.expiryDate} • Lot: \${item.lotSize}</p>
        </div>
        <div class="expiry-arrow-btn"><i class="fas fa-arrow-right"></i></div>
      \`;
      div.addEventListener('click', (e) => {
        e.stopPropagation();
        showToast(\`📈 Opening Option Chain: \${item.name} Expiry\`, 1200);
        setTimeout(() => alert(\`📊 OPTION CHAIN - \${item.fullName}\\nExpiry: \${item.expiryDate}\\nStrike range: ATM +- 500\\nCall OI: 2.4L | Put OI: 1.9L\`), 200);
        closeExpiryDrawer();
      });
      container.appendChild(div);
    });
  }

  function openExpiryDrawer() {
    var overlay = document.getElementById('expiryHalfDrawer');
    if(overlay) overlay.classList.add('active');
    renderExpiryDrawerList();
    showToast("📅 Upcoming expiries — tap arrow to open option chain", 1500);
  }
  function closeExpiryDrawer() {
    var overlay = document.getElementById('expiryHalfDrawer');
    if(overlay) overlay.classList.remove('active');
  }

  function setActiveCategory(category) {
    activeCategory = category;
    document.getElementById('equityCatBtn').classList.toggle('active', category === 'equity');
    document.getElementById('commodityCatBtn').classList.toggle('active', category === 'commodity');
    renderInstruments();
    showToast(\`\${category === 'equity' ? '📊 EQUITY' : '🏆 COMMODITY'} option chain loaded\`, 1000);
  }

  function setActiveFooterTab(tabId) {
    activeFooterTab = tabId;
    document.querySelectorAll('.footer-tab').forEach(tab => {
      tab.classList.remove('active');
      if (tab.getAttribute('data-tab') === tabId) tab.classList.add('active');
    });
    showToast(\`📱 \${tabId.charAt(0).toUpperCase() + tabId.slice(1)} section\`, 1000);
  }

  function setTheme(theme) {
    var isDark = theme === 'dark';
    document.body.classList.toggle('dark', isDark);
    localStorage.setItem('marginApexTheme', theme);
    var icon = document.getElementById('themeNavIcon');
    icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    renderMarketTwoRows();
    renderLearningCards();
  }
  function toggleTheme() { var isDark = document.body.classList.contains('dark'); setTheme(isDark ? 'light' : 'dark'); showToast(isDark ? "☀️ Light mode" : "🌙 Dark mode", 1000); }
  function loadSavedTheme() { var saved = localStorage.getItem('marginApexTheme'); setTheme(saved === 'dark' ? 'dark' : 'light'); }

  function handleNavFunds() {
    showToast(\`💰 Funds: \$\${fundsBalance.toFixed(2)} | Tap again to add \$500\`, 1200);
    if(confirm(\`Add \$500 demo funds?\`)) { fundsBalance += 500; showToast("✅ +\$500 added to funds", 1500); }
  }
  function handleNavNotification() { showToast("🔔 New: Margin updates & trading reminders", 2000); }
  function handleNavSettings() { window.location.href = '/profile'; }
  function handleWhatsAppCommunity() { showToast("📱 Join FREE WhatsApp Community — Get daily trading tips & signals!", 2000); setTimeout(() => alert("🎯 MARGIN APEX WHATSAPP COMMUNITY\\n\\n✅ Free daily trading tips\\n✅ Live market updates\\n✅ Expert insights\\n✅ Signal alerts\\n\\nClick Join to receive invite link"), 300); }
  function redirectToMarginSettings() { showToast("⚙️ Opening Margin Settings", 1600); setTimeout(() => alert("🔧 MARGIN SETTINGS PAGE (to be created)"), 300); }
  function handleExpiryToday() { openExpiryDrawer(); }

  function bindEvents() {
    var safeBind = function(id, handler) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };
    
    safeBind('navNotification', handleNavNotification);
    safeBind('navFunds', handleNavFunds);
    safeBind('navSettings', handleNavSettings);
    safeBind('navTheme', toggleTheme);
    safeBind('whatsappCommunityBtn', handleWhatsAppCommunity);
    safeBind('marginSettingsRedirect', redirectToMarginSettings);
    safeBind('expiryTodayBtn', handleExpiryToday);
    safeBind('equityCatBtn', () => setActiveCategory('equity'));
    safeBind('commodityCatBtn', () => setActiveCategory('commodity'));
    safeBind('closeExpiryDrawer', closeExpiryDrawer);
    
    var expiryDrawer = document.getElementById('expiryHalfDrawer');
    if (expiryDrawer) {
      expiryDrawer.addEventListener('click', (e) => {
        if (e.target === expiryDrawer) closeExpiryDrawer();
      });
    }
  }

  function init() {
    loadSavedTheme();
    renderMarketTwoRows();
    renderLearningCards();
    renderInstruments();
    bindEvents();
    document.getElementById('equityCatBtn').classList.add('active');
    setActiveFooterTab('home');
  }
  requestAnimationFrame(function() { init(); });
`;
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);
  return (
    <div className="app-container">
      <div
        ref={containerRef}
        style={{ flex: 1, overflowY: 'auto' }}
        dangerouslySetInnerHTML={{
          __html: `
  <!-- Top Navigation Bar - Single Row -->
  <div class="nav-bar-full">
    <div class="nav-group">
      <div class="nav-icon-btn" id="navNotification"><i class="fas fa-bell"></i></div>
    </div>
    <div class="nav-group">
      <div class="nav-app-name">MARGIN<span style="color: #006400;"> APEX</span></div>
    </div>
    <div class="nav-group">
      <div class="nav-icon-btn" id="navTheme"><i class="fas fa-moon" id="themeNavIcon"></i></div>
      <div class="nav-funds" id="navFunds"><i class="fas fa-coins"></i><span>Funds</span></div>
      <div class="nav-icon-btn" id="navSettings"><i class="fas fa-user-cog"></i></div>
    </div>
  </div>

  <!-- Scrollable Main Content -->
  <div class="main-content">
    <div class="screen">
      <div class="content-padded">
        <!-- WHATSAPP COMMUNITY BUTTON -->
        <div class="whatsapp-community" id="whatsappCommunityBtn">
          <div class="whatsapp-inner">
            <div class="whatsapp-icon"><i class="fab fa-whatsapp"></i></div>
            <div class="whatsapp-content">
              <div class="whatsapp-headline">FREE WHATSAPP COMMUNITY</div>
              <div class="whatsapp-sub"><i class="fas fa-lightbulb"></i> You'll get FREE tips here — join now!</div>
            </div>
            <div class="whatsapp-arrow"><i class="fas fa-chevron-right"></i></div>
          </div>
        </div>

        <!-- MARGIN SETTINGS ROW -->
        <div class="margin-settings-row" id="marginSettingsRedirect">
          <div class="margin-settings-left">
            <div class="margin-settings-icon"><i class="fas fa-chart-line"></i></div>
            <div class="margin-settings-text"><h4>Margin Settings</h4><p>Check requirements &amp; limits</p></div>
          </div>
          <div class="margin-settings-arrow"><i class="fas fa-arrow-right"></i></div>
        </div>

        <!-- OPTION CHAIN -->
        <div class="option-chain-section">
          <div class="section-header">
            <div class="section-title"><i class="fas fa-link"></i>  OPTION CHAIN</div>
            <span style="font-size:0.6rem; color:var(--text-muted);">Swipe →</span>
          </div>
          <div class="category-buttons">
            <div class="cat-btn" id="equityCatBtn">EQUITY</div>
            <div class="cat-btn" id="commodityCatBtn">COMMODITY</div>
          </div>
          <div class="scrollable-instruments">
            <div class="instruments-row" id="instrumentsRow"></div>
          </div>
        </div>

        <!-- EXPIRY TODAY -->
        <div class="expiry-block" id="expiryTodayBtn">
          <div class="expiry-left">
            <div class="expiry-icon"><i class="fas fa-calendar-day"></i></div>
            <div class="expiry-text">
              <h4>EXPIRY TODAY</h4>
              <p>Weekly &amp; Monthly contracts</p>
            </div>
          </div>
          <div class="expiry-arrow"><i class="fas fa-arrow-right"></i></div>
        </div>

        <!-- MARKET OVERVIEW (using reliable FA icons) -->
        <div class="market-overview">
          <div class="overview-header">
            <h4 style="font-size:0.85rem; color:var(--text-primary);"><i class="fas fa-chart-line"></i> Live Market Overview</h4>
            <i class="fas fa-sync-alt" style="font-size:0.7rem; color:var(--text-muted);"> Live</i>
          </div>
          <div class="markets-two-rows" id="marketsTwoRows"></div>
        </div>

        <!-- AI & LEARNING (using reliable FA icons) -->
        <div class="learning-section">
          <div class="section-title"><i class="fas fa-robot"></i>  AI &amp; LEARNING</div>
          <div class="learning-grid" id="learningGrid"></div>
        </div>
      </div>
    </div>
  </div>

<!-- Half Page Expiry Drawer (Bottom Sheet) -->
<div id="expiryHalfDrawer" class="expiry-half-drawer-overlay">
  <div class="expiry-half-sheet">
    <div class="expiry-sheet-header">
      <h3><i class="fas fa-calendar-alt"></i> Upcoming Expiries</h3>
      <div class="expiry-sheet-close" id="closeExpiryDrawer"><i class="fas fa-times"></i></div>
    </div>
    <div id="expiryListContainer"></div>
  </div>
</div>
` }}
      />
      <Footer activeTab="home" />
    </div>
  );
}
