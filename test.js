function buildInlineScript(allowedSegments: string[], segmentSettings: any[]): string {
  return `
    (function() {
      var allowedSegments = ${JSON.stringify(allowedSegments)};
      var segmentSettings = ${JSON.stringify(segmentSettings)};
      var tradingSegments = [
        {
          name: 'INDEX-FUT',
          icon: 'fa-chart-line',
          instruments: [
            { name: 'NIFTY 50 INDEX', symbol: 'NIFTY_INDEX', kiteSymbol: 'NSE:NIFTY 50', price: 22456.80, change: '+0.45%', segment: 'NSE - Futures', contractDate: '', open: 22350, high: 22580, low: 22320, close: 22456.80 },
            { name: 'SENSEX INDEX', symbol: 'SENSEX_INDEX', kiteSymbol: 'BSE:SENSEX', price: 74230.15, change: '+0.32%', segment: 'BSE - Futures', contractDate: '', open: 73950, high: 74500, low: 73800, close: 74230.15 },
            { name: 'BANKNIFTY INDEX', symbol: 'BANKNIFTY_INDEX', kiteSymbol: 'NSE:NIFTY BANK', price: 48210.50, change: '-0.21%', segment: 'NSE - Futures', contractDate: '', open: 48350, high: 48500, low: 48100, close: 48210.50 },
            { name: 'FINNIFTY INDEX', symbol: 'FINNIFTY_INDEX', kiteSymbol: 'NSE:NIFTY FIN SERVICE', price: 21234.90, change: '+0.67%', segment: 'NSE - Futures', contractDate: '', open: 21080, high: 21350, low: 21050, close: 21234.90 },
            { name: 'MIDCAP NIFTY INDEX', symbol: 'MIDCP_INDEX', kiteSymbol: 'NSE:NIFTY MID SELECT', price: 11820.45, change: '+0.88%', segment: 'NSE - Futures', contractDate: '', open: 11700, high: 11880, low: 11680, close: 11820.45 }
          ]
        },
        {
          name: 'INDEX-OPT',
          icon: 'fa-chart-gantt',
          subCategories: [
            {
              name: 'NIFTY Options',
              instruments: [
                { name: 'NIFTY 22300 PE', symbol: 'NIFTY22300PE', kiteSymbol: '', price: 65.10, change: '-2.1%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 66, high: 68, low: 64, close: 65.10 },
                { name: 'NIFTY 22400 PE', symbol: 'NIFTY22400PE', kiteSymbol: '', price: 78.20, change: '-1.2%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 79.50, high: 80, low: 77.50, close: 78.20 },
                { name: 'NIFTY 22500 CE', symbol: 'NIFTY22500CE', kiteSymbol: '', price: 125.40, change: '+2.3%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 122, high: 128.50, low: 121, close: 125.40 },
                { name: 'NIFTY 22600 CE', symbol: 'NIFTY22600CE', kiteSymbol: '', price: 85.30, change: '+1.5%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 84, high: 88, low: 82, close: 85.30 },
                { name: 'NIFTY 22700 CE', symbol: 'NIFTY22700CE', kiteSymbol: '', price: 55.20, change: '+3.1%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 53, high: 57, low: 51, close: 55.20 }
              ]
            },
            {
              name: 'SENSEX Options',
              instruments: [
                { name: 'SENSEX 74100 PE', symbol: 'SENSEX741PE', kiteSymbol: '', price: 150.20, change: '-1.5%', segment: 'BSE - Options', contractDate: '26 Jun 2026', open: 152, high: 155, low: 148, close: 150.20 },
                { name: 'SENSEX 74500 CE', symbol: 'SENSEX745CE', kiteSymbol: '', price: 210.30, change: '+0.9%', segment: 'BSE - Options', contractDate: '26 Jun 2026', open: 208, high: 212.50, low: 207.50, close: 210.30 },
                { name: 'SENSEX 74900 CE', symbol: 'SENSEX749CE', kiteSymbol: '', price: 125.10, change: '+2.5%', segment: 'BSE - Options', contractDate: '26 Jun 2026', open: 122, high: 128, low: 120, close: 125.10 }
              ]
            },
            {
              name: 'BANKEX Options',
              instruments: [
                { name: 'BANKEX 51800 PE', symbol: 'BANKEX518PE', kiteSymbol: '', price: 240.50, change: '-1.4%', segment: 'BSE - Options', contractDate: '26 Jun 2026', open: 245, high: 248, low: 238, close: 240.50 },
                { name: 'BANKEX 52000 CE', symbol: 'BANKEX520CE', kiteSymbol: '', price: 310.75, change: '+1.1%', segment: 'BSE - Options', contractDate: '26 Jun 2026', open: 307, high: 314, low: 306.50, close: 310.75 }
              ]
            },
            {
              name: 'BANKNIFTY Options',
              instruments: [
                { name: 'BANKNIFTY 47800 PE', symbol: 'BN47800PE', kiteSymbol: '', price: 110.15, change: '+0.3%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 109, high: 112, low: 108, close: 110.15 },
                { name: 'BANKNIFTY 48000 PE', symbol: 'BN48000PE', kiteSymbol: '', price: 140.25, change: '+0.7%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 139, high: 142, low: 138.50, close: 140.25 },
                { name: 'BANKNIFTY 48200 CE', symbol: 'BN48200CE', kiteSymbol: '', price: 280.40, change: '-1.1%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 282, high: 285, low: 279, close: 280.40 },
                { name: 'BANKNIFTY 48500 CE', symbol: 'BN48500CE', kiteSymbol: '', price: 215.60, change: '-0.4%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 216.50, high: 218, low: 214, close: 215.60 },
                { name: 'BANKNIFTY 48800 CE', symbol: 'BN48800CE', kiteSymbol: '', price: 155.80, change: '-0.8%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 157, high: 160, low: 154, close: 155.80 },
                { name: 'BANKNIFTY 49000 CE', symbol: 'BN49000CE', kiteSymbol: '', price: 120.40, change: '-1.5%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 122, high: 125, low: 118, close: 120.40 }
              ]
            },
            {
              name: 'FINNIFTY Options',
              instruments: [
                { name: 'FINNIFTY 21300 PE', symbol: 'FIN21300PE', kiteSymbol: '', price: 45.20, change: '-2.5%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 48, high: 50, low: 44, close: 45.20 },
                { name: 'FINNIFTY 21500 CE', symbol: 'FIN21500CE', kiteSymbol: '', price: 92.50, change: '+1.5%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 91, high: 94, low: 90.50, close: 92.50 },
                { name: 'FINNIFTY 21700 CE', symbol: 'FIN21700CE', kiteSymbol: '', price: 32.10, change: '+4.5%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 30, high: 34, low: 28, close: 32.10 }
              ]
            },
            {
              name: 'MID CAP NIFTY Options',
              instruments: [
                { name: 'MIDCPNIFTY 11800 CE', symbol: 'MIDCP118CE', kiteSymbol: '', price: 65.30, change: '+2.1%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 63.80, high: 66.50, low: 63.50, close: 65.30 },
                { name: 'MIDCPNIFTY 12000 CE', symbol: 'MIDCP120CE', kiteSymbol: '', price: 25.50, change: '+6.5%', segment: 'NSE - Options', contractDate: '26 Jun 2026', open: 22, high: 28, low: 20, close: 25.50 }
              ]
            }
          ]
        },
        {
          name: 'STOCK-FUT',
          icon: 'fa-building',
          instruments: [
            { name: 'RELIANCE FUT', symbol: 'RELIANCE_FUT', kiteSymbol: 'NSE:RELIANCE', price: 2856.40, change: '+0.75%', segment: 'NSE - Futures', contractDate: '26 Jun 2026', open: 2835, high: 2870, low: 2830, close: 2856.40 },
            { name: 'TCS FUT', symbol: 'TCS_FUT', kiteSymbol: 'NSE:TCS', price: 3987.20, change: '-0.33%', segment: 'NSE - Futures', contractDate: '26 Jun 2026', open: 4000, high: 4015, low: 3975, close: 3987.20 },
            { name: 'HDFCBANK FUT', symbol: 'HDFCBANK_FUT', kiteSymbol: 'NSE:HDFCBANK', price: 1680.90, change: '+0.22%', segment: 'NSE - Futures', contractDate: '26 Jun 2026', open: 1675, high: 1688, low: 1672, close: 1680.90 }
          ]
        },
        {
          name: 'MCX-FUT',
          icon: 'fa-coins',
          instruments: [
            { name: 'GOLD FUT', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26JUNFUT', price: 72450, change: '+0.28%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 72150, high: 72450, low: 72100, close: 72450 },
            { name: 'SILVER FUT', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULFUT', price: 82230, change: '-0.15%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 82350, high: 82450, low: 82100, close: 82230 },
            { name: 'CRUDEOIL FUT', symbol: 'CRUDEOIL_FUT', kiteSymbol: 'MCX:CRUDEOIL26JUNFUT', price: 6120.50, change: '+1.2%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 6045, high: 6140, low: 6040, close: 6120.50 }
          ]
        },
        {
          name: 'MCX-OPT',
          icon: 'fa-chart-line',
          subCategories: [
            {
              name: 'GOLD',
              instruments: [
                { name: 'GOLD 72000 CE', symbol: 'GOLD26JUN72000CE', kiteSymbol: 'MCX:GOLD26JUN72000CE', price: 820, change: '+0.9%', segment: 'MCX - Options', contractDate: '2026-06-30', open: 812, high: 828, low: 810, close: 820 }
              ]
            },
            {
              name: 'CRUDEOIL',
              instruments: [
                { name: 'CRUDEOIL 6000 CE', symbol: 'CRUDEOIL26JUN6000CE', kiteSymbol: 'MCX:CRUDEOIL26JUN6000CE', price: 145, change: '+1.5%', segment: 'MCX - Options', contractDate: '2026-06-30', open: 140, high: 152, low: 138, close: 145 }
              ]
            }
          ]
        },
        {
          name: 'CRYPTO',
          icon: 'fa-bitcoin',
          instruments: [
            { name: 'BTC/USDT', symbol: 'BTCUSDT', kiteSymbol: '', binanceSymbol: 'BTCUSDT', price: 68450.20, change: '+2.1%', segment: 'Crypto', contractDate: 'Perpetual', open: 67000, high: 69000, low: 66800, close: 68450.20 },
            { name: 'ETH/USDT', symbol: 'ETHUSDT', kiteSymbol: '', binanceSymbol: 'ETHUSDT', price: 3420.80, change: '+1.4%', segment: 'Crypto', contractDate: 'Perpetual', open: 3370, high: 3450, low: 3360, close: 3420.80 },
            { name: 'SOL/USDT', symbol: 'SOLUSDT', kiteSymbol: '', binanceSymbol: 'SOLUSDT', price: 182.30, change: '-0.7%', segment: 'Crypto', contractDate: 'Perpetual', open: 183.50, high: 184, low: 181, close: 182.30 }
          ]
        },
        {
          name: 'FOREX',
          icon: 'fa-globe',
          instruments: [
            { name: 'USD/INR', symbol: 'USDINR_FUT', kiteSymbol: 'CDS:USDINR26JUNFUT', price: 95.96, change: '0%', segment: 'CDS - Futures', contractDate: 'Jun 2026', open: 95.72, high: 96.03, low: 95.59, close: 95.61 },
            { name: 'EUR/INR', symbol: 'EURINR_FUT', kiteSymbol: 'CDS:EURINR26JUNFUT', price: 0, change: '0%', segment: 'CDS - Futures', contractDate: 'Jun 2026', open: 0, high: 0, low: 0, close: 0 }
          ]
        },
        {
          name: 'COMEX',
          icon: 'fa-gem',
          instruments: [
            { name: 'Gold', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26JUNFUT', comexSymbol: 'GC=F', price: 72450, change: '+0.28%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 72150, high: 72450, low: 72100, close: 72450 },
            { name: 'Silver', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULFUT', comexSymbol: 'SI=F', price: 82230, change: '-0.15%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 82350, high: 82450, low: 82100, close: 82230 },
            { name: 'Crude Oil', symbol: 'CRUDEOIL_FUT', kiteSymbol: 'MCX:CRUDEOIL26JUNFUT', comexSymbol: 'CL=F', price: 6120, change: '0%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 0, high: 0, low: 0, close: 0 },
            { name: 'Copper', symbol: 'COPPER_FUT', kiteSymbol: 'MCX:COPPER26JUNFUT', comexSymbol: 'HG=F', price: 780, change: '0%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 0, high: 0, low: 0, close: 0 }
          ]
        },
        {
          name: 'STOCK-OPT',
          icon: 'fa-layer-group',
          subCategories: [
            {
              name: 'RELIANCE',
              instruments: [
                { name: 'RELIANCE 2900 CE', symbol: 'RELIANCE26JUN2900CE', kiteSymbol: 'NFO:RELIANCE26JUN2900CE', price: 0, change: '0%', segment: 'NSE - Stock Options', contractDate: '2026-06-30', open: 0, high: 0, low: 0, close: 0 },
                { name: 'RELIANCE 2800 PE', symbol: 'RELIANCE26JUN2800PE', kiteSymbol: 'NFO:RELIANCE26JUN2800PE', price: 0, change: '0%', segment: 'NSE - Stock Options', contractDate: '2026-06-30', open: 0, high: 0, low: 0, close: 0 }
              ]
            },
            {
              name: 'TCS',
              instruments: [
                { name: 'TCS 4000 CE', symbol: 'TCS26JUN4000CE', kiteSymbol: 'NFO:TCS26JUN4000CE', price: 0, change: '0%', segment: 'NSE - Stock Options', contractDate: '2026-06-30', open: 0, high: 0, low: 0, close: 0 }
              ]
            },
            {
              name: 'HDFCBANK',
              instruments: [
                { name: 'HDFCBANK 1700 CE', symbol: 'HDFCBANK26JUN1700CE', kiteSymbol: 'NFO:HDFCBANK26JUN1700CE', price: 0, change: '0%', segment: 'NSE - Stock Options', contractDate: '2026-06-30', open: 0, high: 0, low: 0, close: 0 },
                { name: 'HDFCBANK 1600 PE', symbol: 'HDFCBANK26JUN1600PE', kiteSymbol: 'NFO:HDFCBANK26JUN1600PE', price: 0, change: '0%', segment: 'NSE - Stock Options', contractDate: '2026-06-30', open: 0, high: 0, low: 0, close: 0 }
              ]
            }
          ]
        },
        {
          name: 'NSE-EQ',
          icon: 'fa-landmark',
          instruments: [
            { name: 'RELIANCE', symbol: 'RELIANCE_EQ', kiteSymbol: 'NSE:RELIANCE', price: 0, change: '0%', segment: 'NSE - Equity', contractDate: '', open: 0, high: 0, low: 0, close: 0 },
            { name: 'TCS', symbol: 'TCS_EQ', kiteSymbol: 'NSE:TCS', price: 0, change: '0%', segment: 'NSE - Equity', contractDate: '', open: 0, high: 0, low: 0, close: 0 },
            { name: 'HDFCBANK', symbol: 'HDFCBANK_EQ', kiteSymbol: 'NSE:HDFCBANK', price: 0, change: '0%', segment: 'NSE - Equity', contractDate: '', open: 0, high: 0, low: 0, close: 0 },
            { name: 'INFY', symbol: 'INFY_EQ', kiteSymbol: 'NSE:INFY', price: 0, change: '0%', segment: 'NSE - Equity', contractDate: '', open: 0, high: 0, low: 0, close: 0 }
          ]
        }
      ];

      function mapCategoryToDbSegment(name) {
        var n = name.toUpperCase();
        if (n === 'INDEX-FUT') return 'INDEX-FUT';
        if (n === 'INDEX-OPT') return 'INDEX-OPT';
        if (n === 'STOCK-FUT') return 'STOCK-FUT';
        if (n === 'STOCK-OPT') return 'STOCK-OPT';
        if (n === 'MCX-FUT') return 'MCX-FUT';
        if (n === 'MCX-OPT') return 'MCX-OPT';
        if (n === 'NSE-EQ') return 'NSE-EQ';
        if (n === 'CRYPTO') return 'CRYPTO';
        if (n === 'FOREX') return 'FOREX';
        if (n === 'COMEX') return 'COMEX';
        return name;
      }
      if (allowedSegments && allowedSegments.length > 0) {
        tradingSegments = tradingSegments.filter(function(seg) {
          return allowedSegments.indexOf(mapCategoryToDbSegment(seg.name)) !== -1;
        });
      }
      
      window.__initialTradingSegments = tradingSegments;

      function getAllScripts() {
        var scripts = [];
        function traverse(node) {
          if (node.instruments) node.instruments.forEach(function(inst) { scripts.push(Object.assign({}, inst, { category: node.name })); });
          if (node.subCategories) node.subCategories.forEach(function(sub) {
            if (sub.instruments) sub.instruments.forEach(function(inst) { scripts.push(Object.assign({}, inst, { category: node.name + ' > ' + sub.name })); });
          });
        }
        tradingSegments.forEach(function(seg) { traverse(seg); });
        return scripts;
      }

      var allScriptsDB = getAllScripts();
      var watchlistItems = (window.__watchlistItems && window.__watchlistItems.length > 0) ? window.__watchlistItems.slice() : [];
      var selectionMode = false;
      var longPressTimer = null;

      var watchlistContainer = document.getElementById('watchlistMobileContainer');
      var watchlistCounter = document.getElementById('mobileWatchlistCounter');
      var multiSelectBar = document.getElementById('multiSelectBar');
      var selectedCountSpan = document.getElementById('selectedCount');
      var searchInput = document.getElementById('globalSearchInput');
      var clearSearchBtn = document.getElementById('clearSearchBtn');
      var searchResultsArea = document.getElementById('searchResultsArea');
      var searchResultsList = document.getElementById('searchResultsList');
      var searchResultCount = document.getElementById('searchResultCount');
      var folderDrawer = document.getElementById('scriptsFolderDrawer');
      var overlay = document.getElementById('drawerOverlay');

      function formatPrice(price, isCrypto) {
        var numPrice = typeof price === 'number' ? price : parseFloat(price);
        return '₹' + numPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function(m) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]; });
      }

      function addToWatchlist(item) {
        if (typeof window.__addToWatchlistCallback === 'function') {
          window.__addToWatchlistCallback(item);
          if (window.showToast) window.showToast('Added to watchlist', false);
        }
      }

      function removeFromWatchlist(symbol) {
        if (typeof window.__removeFromWatchlistCallback === 'function') {
          window.__removeFromWatchlistCallback(symbol);
          if (window.showToast) window.showToast('Removed from watchlist', false);
        }
      }

      function openDetailSheet(symbol) {
        if (typeof window.__reactOpenDetailSheet === 'function') {
          window.__reactOpenDetailSheet(symbol);
          var sheet = document.getElementById('detailSheet');
          var overlay = document.getElementById('detailSheetOverlay');
          if (sheet) sheet.classList.add('open');
          if (overlay) overlay.classList.add('active');
        }
      }

      function openTradeSheet(symbol) {
        if (typeof window.__reactOpenTradeSheet === 'function') {
          window.__reactOpenTradeSheet(symbol);
        }
      }

      function renderFolderTree() {
        var folderTreeMobile = document.getElementById('folderTreeMobile');
        if (!folderTreeMobile) return;
        var html = '';
        tradingSegments.forEach(function(seg) {
          html += '<div class="folder-item">';
          html += '<div class="folder-header">' + escapeHtml(seg.name) + '</div>';
          if (seg.instruments) {
            seg.instruments.forEach(function(inst) {
              html += '<div class="script-item"><span>' + escapeHtml(inst.name) + '</span><button class="add-script-btn" onclick=\\'addToWatchlist(' + JSON.stringify(inst).replace(/"/g, '&quot;') + ')\\'>+ Add</button></div>';
            });
          }
          if (seg.subCategories) {
            seg.subCategories.forEach(function(sub) {
              html += '<div class="subfolder-item"><div class="subfolder-header">' + escapeHtml(sub.name) + '</div>';
              sub.instruments.forEach(function(inst) {
                html += '<div class="script-item"><span>' + escapeHtml(inst.name) + '</span><button class="add-script-btn" onclick=\\'addToWatchlist(' + JSON.stringify(inst).replace(/"/g, '&quot;') + ')\\'>+ Add</button></div>';
              });
              html += '</div>';
            });
          }
          html += '</div>';
        });
        folderTreeMobile.innerHTML = html;
      }

      var searchDebounceTimer = null;
      var lastProcessedQuery = window.__lastProcessedQuery || '';

      function renderSearchResults(results) {
        var searchResultsArea = document.getElementById('searchResultsArea');
        var searchResultsList = document.getElementById('searchResultsList');
        var searchResultCount = document.getElementById('searchResultCount');
        if (!searchResultsArea || !searchResultsList) return;
        var html = '';
        results.slice(0, 40).forEach(function(item) {
          var kiteId = item.kiteSymbol || item.symbol || '';
          
          var mainName = item.name;
          
          var segMap = {
            'NSE - Options': 'NFO',
            'NSE - Futures': 'NFO',
            'MCX - Futures': 'MCX',
            'BSE - Options': 'BFO',
            'Crypto': 'CRYPTO',
            'CDS - Futures': 'CDS'
          };
          var badgeStr = segMap[item.segment] || 'NSE';
          var dateStr = (item.contractDate || '').replace(/ 20\d\d$/, '');
          var bottomHtml = dateStr ? escapeHtml(dateStr) + '<span style="background: #f1f5f9; color: #64748b; font-size: 0.65rem; padding: 3px 6px; border-radius: 4px; font-weight: 700; margin-left: 8px;">' + escapeHtml(badgeStr) + '</span>' : escapeHtml(badgeStr);

            var defaultPrice = item.price ? item.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---';
            html += '<div class="search-result-item" style="padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">' +
            '<div class="sri-left"><div class="sri-name" style="font-weight: 700; font-size: 0.95rem; color: #1e293b; margin-bottom: 4px;">' + escapeHtml(mainName) + '</div><div class="sri-symbol" style="color: #94a3b8; font-size: 0.75rem; font-weight: 500; display: flex; align-items: center;">' + bottomHtml + '</div></div>' +
            '<div class="sri-right" style="display: flex; align-items: center; gap: 12px;">' +
            '<div class="sri-price" data-kite-id="' + escapeHtml(kiteId) + '" style="font-weight: 700; font-size: 0.95rem; color: #1e293b; min-width: 60px; text-align: right;">' + escapeHtml(defaultPrice) + '</div>' +
            '<button class="add-script-btn sri-add-btn" style="background: #c53030; color: white; border: none; border-radius: 20px; padding: 6px 16px; font-weight: 600; font-size: 0.85rem;" onclick=\\'addToWatchlist(' + JSON.stringify(item).replace(/"/g, '&quot;') + ')\\'>Add</button>' +
            '</div></div>';
        });
        if (searchResultCount) searchResultCount.textContent = results.length + ' RESULTS';
        searchResultsList.innerHTML = html || '<div class="no-results">No results found in library</div>';
        searchResultsArea.style.display = 'flex';

        // Fetch live prices for all results that have a kiteSymbol
        var kiteIds = results.slice(0, 40)
          .map(function(r) { return r.kiteSymbol || ''; })
          .filter(function(id) { return id.includes(':'); });
        if (kiteIds.length === 0) return;

        fetch('/api/kite/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruments: kiteIds })
        })
          .then(function(r) {
            var ct = r.headers.get('content-type');
            if (r.ok && ct && ct.indexOf('application/json') !== -1) {
              return r.json();
            }
            return { data: {} };
          })
          .then(function(json) {
            var quoteData = (json && json.data) || {};
            Object.entries(quoteData).forEach(function(entry) {
              var kiteId = entry[0];
              var quote = entry[1];
              var lp = quote && quote.last_price;
              if (!lp) return;
              var el = searchResultsList.querySelector('[data-kite-id="' + kiteId + '"]');
              if (el) el.textContent = lp.toLocaleString('en-IN', { maximumFractionDigits: 2 });
            });
          })
          .catch(function() {});
      }

      document.addEventListener('input', function(e) {
        if (e.target && e.target.id === 'globalSearchInput') {
          var inputElement = e.target;
          var query = inputElement.value.trim();
          if (query === lastProcessedQuery) return;
          lastProcessedQuery = query;
          window.__lastProcessedQuery = query;
          if (query.length === 0) {
            var area = document.getElementById('searchResultsArea');
            if (area) area.style.display = 'none';
            var btn = document.getElementById('clearSearchBtn');
            if (btn) btn.style.display = 'none';
            if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
            return;
          }
          var btn = document.getElementById('clearSearchBtn');
          if (btn) btn.style.display = 'block';

          // Hardcoded results turant dikhao
          var activeTab = window.__activeTab || 'All';
          function getTabForSearchItem(seg, cat) {
            if (cat) {
              var c = cat.toUpperCase();
              if (c.indexOf('INDEX - FUTURE') >= 0) return 'INDEX-FUT';
              if (c.indexOf('INDEX - OPTIONS') >= 0) return 'INDEX-OPT';
              if (c.indexOf('STOCKS - FUTURE') >= 0) return 'STOCK-FUT';
              if (c.indexOf('MCX - FUTURE') >= 0) return 'MCX-FUT';
              if (c.indexOf('MCX - OPTIONS') >= 0) return 'MCX-OPT';
              if (c.indexOf('CRYPTO') >= 0) return 'CRYPTO';
              if (c.indexOf('FOREX') >= 0) return 'FOREX';
              if (c.indexOf('COMEX') >= 0) return 'COMEX';
            }
            if (!seg) return 'INDEX-FUT';
            var m = {
              'NSE - Futures': 'INDEX-FUT', 'BSE - Futures': 'INDEX-FUT',
              'NSE - Options': 'INDEX-OPT', 'BSE - Options': 'INDEX-OPT',
              'NSE - Stock Futures': 'STOCK-FUT', 'BSE - Stock Futures': 'STOCK-FUT',
              'NSE - Stock Options': 'STOCK-OPT', 'BSE - Stock Options': 'STOCK-OPT',
              'MCX - Futures': 'MCX-FUT', 'MCX - Options': 'MCX-OPT',
              'NSE - Equity': 'NSE-EQ', 'BSE - Equity': 'NSE-EQ',
              'Crypto': 'CRYPTO', 'CRYPTO': 'CRYPTO',
              'Forex': 'FOREX', 'FOREX': 'FOREX',
              'CDS - Futures': 'FOREX', 'CDS - Options': 'FOREX',
              'COMEX - Futures': 'COMEX', 'COMEX - Options': 'COMEX', 'COMEX': 'COMEX', 'COI': 'COMEX'
            };
            return m[seg] || 'INDEX-FUT';
          }

          var localResults = allScriptsDB.filter(function(s) {
            var match = s.name.toLowerCase().indexOf(query.toLowerCase()) >= 0 || s.symbol.toLowerCase().indexOf(query.toLowerCase()) >= 0;
            if (!match) return false;
            if (activeTab === 'All') return true;
            return getTabForSearchItem(s.segment, s.category) === activeTab;
          });
          renderSearchResults(localResults);

          // Live DB results 300ms debounce ke saath fetch karo
          if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
          searchDebounceTimer = setTimeout(function() {
            fetch('/api/market/instruments/search?q=' + encodeURIComponent(query), {
              headers: {
                'Authorization': 'Bearer ' + (window.__accessToken || '')
              }
            })
              .then(function(res) {
                var ct = res.headers.get('content-type');
                if (res.ok && ct && ct.indexOf('application/json') !== -1) {
                  return res.json();
                }
                return [];
              })
              .then(function(liveResults) {
                if (!liveResults || !Array.isArray(liveResults)) return;
                // Live results pehle, phir hardcoded jo live mein nahi hain
                var liveSymbols = new Set(liveResults.map(function(r) { return r.symbol; }));
                var hardcodedExtra = localResults.filter(function(s) { return !liveSymbols.has(s.symbol); });
                var merged = liveResults.concat(hardcodedExtra);
                // Sirf tab update karo jab query abhi bhi same ho
                var currentInput = document.getElementById('globalSearchInput');
                if (currentInput && currentInput.value.trim() === query) {
                  var activeTabLive = window.__activeTab || 'All';
                  if (activeTabLive !== 'All') {
                    merged = merged.filter(function(r) { return getTabForSearchItem(r.segment) === activeTabLive; });
                  }
                  renderSearchResults(merged);
                }
              })
              .catch(function() { /* error pe local results hi rehne do */ });
          }, 300);
        }
      });



      var openFolderBtn = document.getElementById('openFolderMobileBtn');
      if (openFolderBtn) {
        openFolderBtn.onclick = function() {
          folderDrawer.classList.add('open');
          overlay.classList.add('active');
          renderFolderTree();
        };
      }

      var closeFolderBtn = document.getElementById('closeFolderDrawerBtn');
      if (closeFolderBtn) {
        closeFolderBtn.onclick = function() {
          folderDrawer.classList.remove('open');
          overlay.classList.remove('active');
        };
      }

      if (overlay) {
        overlay.onclick = function() {
          folderDrawer.classList.remove('open');
          overlay.classList.remove('active');
        };
      }

      window.__reactDeleteSelected = function() {
        var checkedBoxes = document.querySelectorAll('.wc-checkbox:checked');
        if (checkedBoxes.length === 0) {
          if (window.showToast) window.showToast('Select items to delete', true);
          return;
        }
        
        var symbolsToDelete = [];
        checkedBoxes.forEach(function(cb) {
          var card = cb.closest('.watchlist-card');
          if (card) {
            var symbol = card.getAttribute('data-symbol');
            if (symbol) symbolsToDelete.push(symbol);
          }
        });

        if (symbolsToDelete.length > 0) {
          symbolsToDelete.forEach(function(sym) {
            if (typeof window.__removeFromWatchlistCallback === 'function') {
              window.__removeFromWatchlistCallback(sym);
            }
          });
          if (window.showToast) window.showToast('Deleted ' + symbolsToDelete.length + ' item' + (symbolsToDelete.length !== 1 ? 's' : '') + ' from watchlist', false);
        }
        
        exitSelectionMode();
      };

      if (!window.__watchlistEventsAttached) {
        window.__watchlistEventsAttached = true;
        // Capture all clicks when selectionMode is active to toggle checkboxes easily
        document.addEventListener('click', function(e) {
          if (!window.__selectionModeActive) return;
          
          var card = e.target.closest('.watchlist-card');
          if (!card) return;
          
          // Skip swipe delete buttons or checkbox itself to avoid double-toggling
          if (e.target.closest('.wc-swipe-actions') || e.target.classList.contains('wc-checkbox') || e.target.closest('.mcx-comex-switch')) {
            return;
          }
          
          e.preventDefault();
          e.stopPropagation();
          
          var cb = card.querySelector('.wc-checkbox');
          if (cb) {
            cb.checked = !cb.checked;
            if (typeof window.__updateSelectionUI === 'function') window.__updateSelectionUI();
          }
        }, true);

        // Handle delegating checkbox change listener to keep count updated
        document.addEventListener('change', function(e) {
          if (e.target && e.target.classList.contains('wc-checkbox')) {
            if (typeof window.__updateSelectionUI === 'function') window.__updateSelectionUI();
          }
        });
      }

      var basketModeBtn = document.getElementById('basketModeBtn');
      // basketModeBtn click is handled by React - no JS handler needed

      function attachSwipeHandlers() {
        var cards = document.querySelectorAll('.watchlist-card');
        cards.forEach(function(card) {
          if (card.getAttribute('data-swipe-attached')) return;
          card.setAttribute('data-swipe-attached', 'true');
          
          var startX = 0, currentX = 0, isDragging = false;
          card.addEventListener('touchstart', function(e) {
            startX = e.touches[0].clientX;
            currentX = startX;
            isDragging = true;
            longPressTimer = setTimeout(function() {
              if (!selectionMode) {
                enterSelectionMode();
                var cb = card.querySelector('.wc-checkbox');
                if (cb) cb.checked = true;
                updateSelectionUI();
              }
            }, 500);
          }, { passive: true });

          card.addEventListener('touchmove', function(e) {
            if (!isDragging) return;
            clearTimeout(longPressTimer);
            currentX = e.touches[0].clientX;
            var diff = currentX - startX;
            var content = card.querySelector('.wc-content');
            if (!content) return;
            if (diff < -50) {
              content.style.transform = 'translateX(-80px)';
            } else if (diff > 0) {
              content.style.transform = 'translateX(0)';
            }
          }, { passive: true });

          card.addEventListener('touchend', function() {
            clearTimeout(longPressTimer);
            isDragging = false;
          });
        });
      }

      function enterSelectionMode() {
        selectionMode = true;
        window.__selectionModeActive = true;
        if (window.__reactSetSelectionActive) window.__reactSetSelectionActive(true);
        document.querySelectorAll('.wc-checkbox-wrapper').forEach(function(el) {
          el.style.display = 'flex';
        });
        updateSelectionUI();
      }

      function exitSelectionMode() {
        selectionMode = false;
        window.__selectionModeActive = false;
        if (window.__reactSetSelectionActive) window.__reactSetSelectionActive(false);
        document.querySelectorAll('.wc-checkbox-wrapper').forEach(function(el) {
          el.style.display = 'none';
        });
        document.querySelectorAll('.wc-checkbox').forEach(function(cb) {
          cb.checked = false;
        });
      }

      function updateSelectionUI() {
        var checked = document.querySelectorAll('.wc-checkbox:checked').length;
        if (selectedCountSpan) selectedCountSpan.textContent = checked + ' selected';
      }
      window.__updateSelectionUI = updateSelectionUI;
      window.__selectionModeActive = selectionMode;

      window.__renderWatchlist = function() { /* Now handled by React */ };
      window.attachSwipeHandlers = attachSwipeHandlers;
      window.enterSelectionMode = enterSelectionMode;
      window.exitSelectionMode = exitSelectionMode;
      window.openDetailSheet = openDetailSheet;
      window.openTradeSheet = openTradeSheet;
      window.addToWatchlist = addToWatchlist;
      window.removeFromWatchlist = removeFromWatchlist;
      
      attachSwipeHandlers();
    })();
  `;
}

