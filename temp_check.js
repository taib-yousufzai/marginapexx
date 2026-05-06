
    (function() {
      var tradingSegments = [
        {
          name: 'INDEX - FUTURE',
          icon: 'fa-chart-line',
          instruments: [
            { name: 'NIFTY FUT', symbol: 'NIFTY_FUT', kiteSymbol: 'NSE:NIFTY 50', price: 22456.80, change: '+0.45%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 22350, high: 22580, low: 22320, close: 22456.80 },
            { name: 'SENSEX FUT', symbol: 'SENSEX_FUT', kiteSymbol: 'BSE:SENSEX', price: 74230.15, change: '+0.32%', segment: 'BSE - Futures', contractDate: '28 Mar 2025', open: 73950, high: 74500, low: 73800, close: 74230.15 },
            { name: 'BANKNIFTY FUT', symbol: 'BANKNIFTY_FUT', kiteSymbol: 'NSE:NIFTY BANK', price: 48210.50, change: '-0.21%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 48350, high: 48500, low: 48100, close: 48210.50 },
            { name: 'FINNIFTY FUT', symbol: 'FINNIFTY_FUT', kiteSymbol: 'NSE:NIFTY FIN SERVICE', price: 21234.90, change: '+0.67%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 21080, high: 21350, low: 21050, close: 21234.90 },
            { name: 'MIDCAP NIFTY FUT', symbol: 'MIDCP_FUT', kiteSymbol: 'NSE:NIFTY MIDCAP 50', price: 11820.45, change: '+0.88%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 11700, high: 11880, low: 11680, close: 11820.45 }
          ]
        },
        {
          name: 'INDEX - OPTIONS',
          icon: 'fa-chart-gantt',
          subCategories: [
            {
              name: 'NIFTY Options',
              instruments: [
                { name: 'NIFTY 22500 CE', symbol: 'NIFTY22500CE', kiteSymbol: '', price: 125.40, change: '+2.3%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 122, high: 128.50, low: 121, close: 125.40 },
                { name: 'NIFTY 22400 PE', symbol: 'NIFTY22400PE', kiteSymbol: '', price: 78.20, change: '-1.2%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 79.50, high: 80, low: 77.50, close: 78.20 }
              ]
            },
            {
              name: 'SENSEX Options',
              instruments: [
                { name: 'SENSEX 74500 CE', symbol: 'SENSEX745CE', kiteSymbol: '', price: 210.30, change: '+0.9%', segment: 'BSE - Options', contractDate: '28 Mar 2025', open: 208, high: 212.50, low: 207.50, close: 210.30 }
              ]
            },
            {
              name: 'BANKEX Options',
              instruments: [
                { name: 'BANKEX 52000 CE', symbol: 'BANKEX520CE', kiteSymbol: '', price: 310.75, change: '+1.1%', segment: 'BSE - Options', contractDate: '28 Mar 2025', open: 307, high: 314, low: 306.50, close: 310.75 }
              ]
            },
            {
              name: 'BANKNIFTY Options',
              instruments: [
                { name: 'BANKNIFTY 48500 CE', symbol: 'BN48500CE', kiteSymbol: '', price: 215.60, change: '-0.4%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 216.50, high: 218, low: 214, close: 215.60 },
                { name: 'BANKNIFTY 48000 PE', symbol: 'BN48000PE', kiteSymbol: '', price: 140.25, change: '+0.7%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 139, high: 142, low: 138.50, close: 140.25 }
              ]
            },
            {
              name: 'FINNIFTY Options',
              instruments: [
                { name: 'FINNIFTY 21500 CE', symbol: 'FIN21500CE', kiteSymbol: '', price: 92.50, change: '+1.5%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 91, high: 94, low: 90.50, close: 92.50 }
              ]
            },
            {
              name: 'MID CAP NIFTY Options',
              instruments: [
                { name: 'MIDCPNIFTY 11800 CE', symbol: 'MIDCP118CE', kiteSymbol: '', price: 65.30, change: '+2.1%', segment: 'NSE - Options', contractDate: '28 Mar 2025', open: 63.80, high: 66.50, low: 63.50, close: 65.30 }
              ]
            }
          ]
        },
        {
          name: 'STOCKS - FUTURE',
          icon: 'fa-building',
          instruments: [
            { name: 'RELIANCE FUT', symbol: 'RELIANCE_FUT', kiteSymbol: 'NSE:RELIANCE', price: 2856.40, change: '+0.75%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 2835, high: 2870, low: 2830, close: 2856.40 },
            { name: 'TCS FUT', symbol: 'TCS_FUT', kiteSymbol: 'NSE:TCS', price: 3987.20, change: '-0.33%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 4000, high: 4015, low: 3975, close: 3987.20 },
            { name: 'HDFCBANK FUT', symbol: 'HDFCBANK_FUT', kiteSymbol: 'NSE:HDFCBANK', price: 1680.90, change: '+0.22%', segment: 'NSE - Futures', contractDate: '28 Mar 2025', open: 1675, high: 1688, low: 1672, close: 1680.90 }
          ]
        },
        {
          name: 'MCX - FUTURE',
          icon: 'fa-coins',
          instruments: [
            { name: 'GOLD FUT', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26JUNFUT', price: 72450, change: '+0.28%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 72150, high: 72450, low: 72100, close: 72450 },
            { name: 'SILVER FUT', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULYFUT', price: 82230, change: '-0.15%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 82350, high: 82450, low: 82100, close: 82230 },
            { name: 'CRUDEOIL FUT', symbol: 'CRUDEOIL_FUT', kiteSymbol: 'MCX:CRUDEOIL26MAYFUT', price: 6120.50, change: '+1.2%', segment: 'MCX - Futures', contractDate: 'May 2026', open: 6045, high: 6140, low: 6040, close: 6120.50 }
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
            { name: 'USD/INR', symbol: 'USDINR_FUT', kiteSymbol: 'CDS:USDINR26MAYFUT', price: 83.45, change: '+0.05%', segment: 'CDS - Futures', contractDate: 'May 2026', open: 83.40, high: 83.50, low: 83.35, close: 83.45 },
            { name: 'EUR/INR', symbol: 'EURINR_FUT', kiteSymbol: 'CDS:EURINR26MAYFUT', price: 90.12, change: '-0.02%', segment: 'CDS - Futures', contractDate: 'May 2026', open:90.15, high: 90.25, low: 90.05, close: 90.12 }
          ]
        },
        {
          name: 'COMEX',
          icon: 'fa-gem',
          instruments: [
            { name: 'Gold', symbol: 'GOLD_FUT', kiteSymbol: 'MCX:GOLD26JUNFUT', comexSymbol: 'GC=F', price: 72450, change: '+0.28%', segment: 'MCX - Futures', contractDate: 'Jun 2026', open: 72150, high: 72450, low: 72100, close: 72450 },
            { name: 'Silver', symbol: 'SILVER_FUT', kiteSymbol: 'MCX:SILVER26JULYFUT', comexSymbol: 'SI=F', price: 82230, change: '-0.15%', segment: 'MCX - Futures', contractDate: 'Jul 2026', open: 82350, high: 82450, low: 82100, close: 82230 }
          ]
        }
      ];

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
        if (isCrypto) return '$' + numPrice.toFixed(2);
        return 'â‚¹' + numPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

        function countInstruments(seg) {
          var count = 0;
          if (seg.instruments) count += seg.instruments.length;
          if (seg.subCategories) seg.subCategories.forEach(function(sub) { count += sub.instruments ? sub.instruments.length : 0; });
          return count;
        }

        var html = '<ul class="tree-node-ul">';
        tradingSegments.forEach(function(seg, idx) {
          var count = countInstruments(seg);
          var segId = 'seg-' + idx;
          html += '<li class="tree-item-li collapsed" id="' + segId + '">';
          html += '<div class="tree-label-row" onclick="toggleSegment(\'' + segId + '\')">';
          html += '<i class="fas fa-chevron-right chevron-icon" id="chev-' + segId + '"></i>';
          html += '<i class="fas ' + seg.icon + ' folder-icon"></i>';
          html += '<span style="flex:1;font-weight:700;font-size:0.88rem">' + escapeHtml(seg.name) + '</span>';
          html += '<span class="segment-count">' + count + '</span>';
          html += '</div>';
          html += '<div class="children-container" id="children-' + segId + '">';

          if (seg.instruments) {
            seg.instruments.forEach(function(inst) {
              var instJson = JSON.stringify(inst).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
              html += '<div class="script-item"><span>' + escapeHtml(inst.name) + '</span><button class="add-script-btn" onclick="addToWatchlist(' + instJson.replace(/"/g, '&quot;') + ')">+ Add</button></div>';
            });
          }
          if (seg.subCategories) {
            seg.subCategories.forEach(function(sub, subIdx) {
              var subId = segId + '-sub-' + subIdx;
              var subCount = sub.instruments ? sub.instruments.length : 0;
              html += '<li class="tree-item-li collapsed" id="' + subId + '" style="list-style:none">';
              html += '<div class="tree-label-row" style="padding:8px 10px" onclick="toggleSegment(\'' + subId + '\')">';
              html += '<i class="fas fa-chevron-right chevron-icon" id="chev-' + subId + '" style="font-size:0.55rem"></i>';
              html += '<span style="flex:1;font-size:0.82rem;font-weight:600;color:var(--text-secondary,#5B677E)">' + escapeHtml(sub.name) + '</span>';
              html += '<span class="segment-count">' + subCount + '</span>';
              html += '</div>';
              html += '<div class="children-container" id="children-' + subId + '">';
              sub.instruments.forEach(function(inst) {
                var instJson = JSON.stringify(inst).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                html += '<div class="script-item"><span>' + escapeHtml(inst.name) + '</span><button class="add-script-btn" onclick="addToWatchlist(' + instJson.replace(/"/g, '&quot;') + ')">+ Add</button></div>';
              });
              html += '</div></li>';
            });
          }

          html += '</div></li>';
        });
        html += '</ul>';
        folderTreeMobile.innerHTML = html;
      }

      window.toggleSegment = function(id) {
        var li = document.getElementById(id);
        var children = document.getElementById('children-' + id);
        var chev = document.getElementById('chev-' + id);
        if (!li || !children) return;
        var isCollapsed = li.classList.contains('collapsed');
        if (isCollapsed) {
          li.classList.remove('collapsed');
          children.style.display = 'block';
          if (chev) chev.style.transform = 'rotate(90deg)';
        } else {
          li.classList.add('collapsed');
          children.style.display = 'none';
          if (chev) chev.style.transform = 'rotate(0deg)';
        }
      };

      if (searchInput) {
        searchInput.addEventListener('input', function() {
          var query = this.value.trim().toLowerCase();
          if (query.length === 0) {
            searchResultsArea.style.display = 'none';
            clearSearchBtn.style.display = 'none';
            return;
          }
          clearSearchBtn.style.display = 'block';
          var results = allScriptsDB.filter(function(s) { return s.name.toLowerCase().indexOf(query) >= 0 || s.symbol.toLowerCase().indexOf(query) >= 0; });
          searchResultCount.textContent = results.length + ' results';
          var html = '';
          results.slice(0, 50).forEach(function(item) {
            var isCrypto = item.segment && item.segment.indexOf('Crypto') >= 0;
            var itemJson = JSON.stringify(item).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            html += '<div class="search-result-item"><div class="sri-left"><div class="sri-name">' + escapeHtml(item.name) + '</div><div class="sri-segment">' + escapeHtml(item.segment) + '</div></div><div class="sri-right"><div class="sri-price">' + formatPrice(item.price, isCrypto) + '</div><button class="add-script-btn" onclick="addToWatchlist(' + itemJson.replace(/"/g, '&quot;') + ')">+</button></div></div>';
          });
          searchResultsList.innerHTML = html;
          searchResultsArea.style.display = 'block';
        });
      }

      if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', function() {
          searchInput.value = '';
          searchResultsArea.style.display = 'none';
          this.style.display = 'none';
        });
      }

      var openFolderBtn = document.getElementById('openFolderMobileBtn');
      if (openFolderBtn) {
        openFolderBtn.addEventListener('click', function() {
          folderDrawer.classList.add('open');
          overlay.classList.add('active');
          renderFolderTree();
        });
      }

      var closeFolderBtn = document.getElementById('closeFolderDrawerBtn');
      if (closeFolderBtn) {
        closeFolderBtn.addEventListener('click', function() {
          folderDrawer.classList.remove('open');
          overlay.classList.remove('active');
        });
      }

      if (overlay) {
        overlay.addEventListener('click', function() {
          folderDrawer.classList.remove('open');
          this.classList.remove('active');
        });
      }

      var exitSelectionBtn = document.getElementById('exitSelectionBtn');
      if (exitSelectionBtn) {
        exitSelectionBtn.addEventListener('click', function() {
          exitSelectionMode();
        });
      }

      var basketModeBtn = document.getElementById('basketModeBtn');
      if (basketModeBtn) {
        basketModeBtn.addEventListener('click', function() {
          var sheet = document.getElementById('basketSheet');
          var overlay = document.getElementById('basketSheetOverlay');
          if (sheet) sheet.classList.add('open');
          if (overlay) overlay.classList.add('active');
        });
      }

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
        if (multiSelectBar) multiSelectBar.style.display = 'block';
        document.querySelectorAll('.wc-checkbox-wrapper').forEach(function(el) {
          el.style.display = 'flex';
        });
      }

      function exitSelectionMode() {
        selectionMode = false;
        if (multiSelectBar) multiSelectBar.style.display = 'none';
        document.querySelectorAll('.wc-checkbox-wrapper').forEach(function(el) {
          el.style.display = 'none';
        });
        document.querySelectorAll('.wc-checkbox').forEach(function(cb) {
          cb.checked = false;
        });
      }

      function updateSelectionUI() {
        var checked = document.querySelectorAll('.wc-checkbox:checked').length;
        if (selectedCountSpan) selectedCountSpan.textContent = checked + ' in basket';
      }

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
