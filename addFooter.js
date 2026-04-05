const fs = require('fs');
const path = require('path');

const cssToAdd = `
/* GLOBAL FOOTER NAV STYLES */
.footer-section {
  position: relative;
  background: var(--footer-bg, #FFFFFF);
  width: 100%;
  margin-top: auto;
}

body.dark .footer-section {
  background: var(--footer-bg, #1E1E1E);
}

.footer-nav {
  padding: 12px 20px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--footer-bg, #FFFFFF);
  position: relative;
  z-index: 5;
  border-top: 1px solid var(--border-card, #E2E6EA);
}

body.dark .footer-nav {
  background: var(--footer-bg, #1E1E1E);
  border-top: 1px solid var(--border-card, #3A3A3A);
}

.footer-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  transition: 0.2s;
  padding: 4px 8px;
  border-radius: 30px;
  flex: 1;
}

.footer-tab:active { 
  transform: scale(0.95); 
  background: var(--icon-bg, #F3F4F6); 
}
body.dark .footer-tab:active {
  background: var(--icon-bg, #2A2A2A);
}

.footer-icon { 
  font-size: 1.2rem; 
  color: var(--text-muted, #9CA3AF); 
}
body.dark .footer-icon {
  color: var(--text-muted, #888888);
}

.footer-label { 
  font-size: 0.55rem; 
  font-weight: 600; 
  color: var(--text-muted, #9CA3AF); 
}
body.dark .footer-label {
  color: var(--text-muted, #888888);
}

.footer-tab.active .footer-icon { color: var(--footer-active, #C62828); }
.footer-tab.active .footer-label { color: var(--footer-active, #C62828); }

body.dark .footer-tab.active .footer-icon { color: var(--footer-active, #EF5350); }
body.dark .footer-tab.active .footer-label { color: var(--footer-active, #EF5350); }
`;

const footerHtml = `
  <!-- GLOBAL FOOTER SECTION -->
  <div class="footer-section">
    <div class="footer-nav">
      <div class="footer-tab" onclick="window.location.href='/'" data-tab="home"><i class="fas fa-home footer-icon"></i><span class="footer-label">Home</span></div>
      <div class="footer-tab" onclick="window.location.href='/watchlist'" data-tab="watchlist"><i class="fas fa-list footer-icon"></i><span class="footer-label">Watchlist</span></div>
      <div class="footer-tab" onclick="window.location.href='/order'" data-tab="order"><i class="fas fa-file-invoice-dollar footer-icon"></i><span class="footer-label">Order</span></div>
      <div class="footer-tab" onclick="window.location.href='/basket'" data-tab="basket"><i class="fas fa-shopping-basket footer-icon"></i><span class="footer-label">Basket</span></div>
      <div class="footer-tab" onclick="window.location.href='/history'" data-tab="history"><i class="fas fa-history footer-icon"></i><span class="footer-label">History</span></div>
    </div>
  </div>
`;

function appendToGlobalsCss() {
  const globalsPath = path.join(__dirname, 'app', 'globals.css');
  let cssText = fs.readFileSync(globalsPath, 'utf8');
  if (!cssText.includes('/* GLOBAL FOOTER NAV STYLES */')) {
    fs.appendFileSync(globalsPath, cssToAdd);
    console.log('Appended footer styles to globals.css');
  }
}

function processPage(routePath, isHome = false) {
  const pagePath = path.join(__dirname, 'app', routePath, 'page.tsx');
  if (!fs.existsSync(pagePath)) return;

  let content = fs.readFileSync(pagePath, 'utf8');
  
  if (isHome) {
    // For home, we need to update the existing footer to match our new universal one
    // Remove existing footer-nav inside page.tsx
    const navRegex = /<div class="footer-nav">[\s\S]*?<\/div>(\s*)<\/div>(\s*)<\/div>(\s*)<!-- Half Page Expiry/;
    if (navRegex.test(content)) {
       // Replace the existing footer-nav with our string
       content = content.replace(/<div class="footer-nav">[\s\S]*?<\/div>\s*<\/div>/, footerHtml + '\\n  </div>');
       fs.writeFileSync(pagePath, content);
       console.log('Updated footer in ' + pagePath);
       return;
    }
    
    // Alternative replace if previous regex missed it
    const navRegex2 = /<div class="footer-nav">[\s\S]*?<\/div>\n\s*<\/div>/;
    if (navRegex2.test(content)) {
       content = content.replace(navRegex2, footerHtml.trim());
       fs.writeFileSync(pagePath, content);
       console.log('Updated footer in ' + pagePath);
       return;
    }

  } else {
    // For other pages, we inject it right before the last closing </div> of the dangerouslySetInnerHTML
    if (content.includes('GLOBAL FOOTER SECTION')) {
      console.log('Footer already present in ' + pagePath);
      return;
    }
    
    // We look for the end of the root container e.g. </div>\n</div>\n\n<!-- Half Page Expiry
    // Or just right before the </div>\n\n<script> marker.
    // Let's just find the closing </div> right before <script> or <div id="tradeSheetOverlay"> or <div id="drawerOverlay">
    
    const insertionPoints = [
      '<!-- COMPACT PROFESSIONAL BOTTOM SHEET -->',
      '<div id="tradeSheetOverlay"',
      '<div id="buySegmentBottomSheetOverlay"',
      '<div id="basketBottomSheetOverlay"',
      '<div id="historyItemOverlay"',
      '<div id="orderDrawerOverlay"',
      '<div id="positionDetailsOverlay"',
      '<script>'
    ];
    
    for (const point of insertionPoints) {
      if (content.includes(point)) {
         // Insert before this point, but we need to put it inside the main root div, actually wait, appending it just before the point if it's a bottom sheet is fine, but it needs to be inside the wrapper if the wrapper has overflow!
         // Wait, the mobile apps have <div class="mobile-app">
         // Let's replace </div>\n\n<!-- COMPACT with </div>\n${footerHtml}\n<!-- COMPACT
         // Actually, let's just insert it right before the point. The html strings are just strings.
         
         const replacement = footerHtml + '\n\n' + point;
         content = content.replace(point, replacement);
         
         // Also inject setActiveTab script so it highlights the right tab!
         const tabName = routePath.replace('/', '');
         const scriptInject = `
    setTimeout(() => {
       document.querySelectorAll('.footer-tab').forEach(tab => {
           tab.classList.remove('active');
           if (tab.getAttribute('data-tab') === '${tabName}') tab.classList.add('active');
       });
    }, 100);
         `;
         content = content.replace('// DOM Elements', scriptInject + '\n    // DOM Elements');
         
         fs.writeFileSync(pagePath, content);
         console.log('Injecting footer into ' + pagePath);
         
         return;
      }
    }
  }
}

appendToGlobalsCss();
processPage('', true); // home
processPage('watchlist');
processPage('basket');
processPage('buysegment');
processPage('history');
processPage('order');
processPage('position');
