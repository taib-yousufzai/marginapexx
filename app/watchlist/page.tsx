'use client';
import { useEffect } from 'react';
import Footer from '@/components/Footer';
import './page.css';

export default function WatchlistPage() {
    useEffect(() => {
        const script = document.createElement('script');
        script.innerHTML = `
(function() {
    const tradingSegments = [
        { name: "INDEX - FUTURE", icon: "fa-chart-line", instruments: [
            { name: "NIFTY FUT", symbol: "NIFTY_FUT", price: 22456.80, change: "+0.45%", segment: "NSE - Futures", contractDate: "28 Mar 2025", open: 22350.00, high: 22580.00, low: 22320.00, close: 22456.80 },
            { name: "SENSEX FUT", symbol: "SENSEX_FUT", price: 74230.15, change: "+0.32%", segment: "BSE - Futures", contractDate: "28 Mar 2025", open: 73950.00, high: 74500.00, low: 73800.00, close: 74230.15 },
            { name: "BANKNIFTY FUT", symbol: "BANKNIFTY_FUT", price: 48210.50, change: "-0.21%", segment: "NSE - Futures", contractDate: "28 Mar 2025", open: 48350.00, high: 48500.00, low: 48100.00, close: 48210.50 },
            { name: "FINNIFTY FUT", symbol: "FINNIFTY_FUT", price: 21234.90, change: "+0.67%", segment: "NSE - Futures", contractDate: "28 Mar 2025", open: 21080.00, high: 21350.00, low: 21050.00, close: 21234.90 },
            { name: "MIDCAP NIFTY FUT", symbol: "MIDCP_FUT", price: 11820.45, change: "+0.88%", segment: "NSE - Futures", contractDate: "28 Mar 2025", open: 11700.00, high: 11880.00, low: 11680.00, close: 11820.45 }
        ]},
        { name: "INDEX - OPTIONS", icon: "fa-chart-gantt", subCategories: [
            { name: "NIFTY Options", instruments: [{ name: "NIFTY 22500 CE", symbol: "NIFTY22500CE", price: 125.40, change: "+2.3%", segment: "NSE - Options", contractDate: "28 Mar 2025", open: 122.00, high: 128.50, low: 121.00, close: 125.40 }, { name: "NIFTY 22400 PE", symbol: "NIFTY22400PE", price: 78.20, change: "-1.2%", segment: "NSE - Options", contractDate: "28 Mar 2025", open: 79.50, high: 80.00, low: 77.50, close: 78.20 }] },
            { name: "SENSEX Options", instruments: [{ name: "SENSEX 74500 CE", symbol: "SENSEX745CE", price: 210.30, change: "+0.9%", segment: "BSE - Options", contractDate: "28 Mar 2025", open: 208.00, high: 212.50, low: 207.50, close: 210.30 }] },
            { name: "BANKEX Options", instruments: [{ name: "BANKEX 52000 CE", symbol: "BANKEX520CE", price: 310.75, change: "+1.1%", segment: "BSE - Options", contractDate: "28 Mar 2025", open: 307.00, high: 314.00, low: 306.50, close: 310.75 }] },
            { name: "BANKNIFTY Options", instruments: [{ name: "BANKNIFTY 48500 CE", symbol: "BN48500CE", price: 215.60, change: "-0.4%", segment: "NSE - Options", contractDate: "28 Mar 2025", open: 216.50, high: 218.00, low: 214.00, close: 215.60 }, { name: "BANKNIFTY 48000 PE", symbol: "BN48000PE", price: 140.25, change: "+0.7%", segment: "NSE - Options", contractDate: "28 Mar 2025", open: 139.00, high: 142.00, low: 138.50, close: 140.25 }] },
            { name: "FINNIFTY Options", instruments: [{ name: "FINNIFTY 21500 CE", symbol: "FIN21500CE", price: 92.50, change: "+1.5%", segment: "NSE - Options", contractDate: "28 Mar 2025", open: 91.00, high: 94.00, low: 90.50, close: 92.50 }] },
            { name: "MID CAP NIFTY Options", instruments: [{ name: "MIDCPNIFTY 11800 CE", symbol: "MIDCP118CE", price: 65.30, change: "+2.1%", segment: "NSE - Options", contractDate: "28 Mar 2025", open: 63.80, high: 66.50, low: 63.50, close: 65.30 }] }
        ]},
        { name: "STOCKS - FUTURE", icon: "fa-building", instruments: [{ name: "RELIANCE FUT", symbol: "RELIANCE_FUT", price: 2856.40, change: "+0.75%", segment: "NSE - Futures", contractDate: "28 Mar 2025", open: 2835.00, high: 2870.00, low: 2830.00, close: 2856.40 }, { name: "TCS FUT", symbol: "TCS_FUT", price: 3987.20, change: "-0.33%", segment: "NSE - Futures", contractDate: "28 Mar 2025", open: 4000.00, high: 4015.00, low: 3975.00, close: 3987.20 }, { name: "HDFCBANK FUT", symbol: "HDFCBANK_FUT", price: 1680.90, change: "+0.22%", segment: "NSE - Futures", contractDate: "28 Mar 2025", open: 1675.00, high: 1688.00, low: 1672.00, close: 1680.90 }] },
        { name: "STOCKS - OPTIONS", icon: "fa-chart-simple", instruments: [{ name: "RELIANCE 2900 CE", symbol: "RELI2900CE", price: 34.70, change: "+5.2%", segment: "NSE - Options", contractDate: "28 Mar 2025", open: 33.00, high: 36.00, low: 32.80, close: 34.70 }, { name: "TCS 4000 CE", symbol: "TCS4000CE", price: 48.90, change: "-1.1%", segment: "NSE - Options", contractDate: "28 Mar 2025", open: 49.50, high: 50.00, low: 48.50, close: 48.90 }] },
        { name: "MCX - FUTURE", icon: "fa-coins", instruments: [{ name: "GOLD FUT", symbol: "GOLD_FUT", price: 62340.00, change: "+0.28%", segment: "MCX - Futures", contractDate: "30 Apr 2025", open: 62150.00, high: 62450.00, low: 62100.00, close: 62340.00 }, { name: "SILVER FUT", symbol: "SILVER_FUT", price: 75230.00, change: "-0.15%", segment: "MCX - Futures", contractDate: "30 Apr 2025", open: 75350.00, high: 75450.00, low: 75100.00, close: 75230.00 }, { name: "CRUDEOIL FUT", symbol: "CRUDEOIL_FUT", price: 6120.50, change: "+1.2%", segment: "MCX - Futures", contractDate: "30 Apr 2025", open: 6045.00, high: 6140.00, low: 6040.00, close: 6120.50 }] },
        { name: "MCX - OPTIONS", icon: "fa-chart-line", instruments: [{ name: "GOLD 62500 CE", symbol: "GOLD62500CE", price: 820.00, change: "+0.9%", segment: "MCX - Options", contractDate: "30 Apr 2025", open: 812.00, high: 828.00, low: 810.00, close: 820.00 }] },
        { name: "NSE - EQ", icon: "fa-chart-simple", instruments: [{ name: "RELIANCE EQ", symbol: "RELIANCE", price: 2845.30, change: "+0.68%", segment: "NSE - Equity", contractDate: "Cash Segment", open: 2825.00, high: 2858.00, low: 2820.00, close: 2845.30 }, { name: "HDFC BANK EQ", symbol: "HDFCBANK", price: 1672.85, change: "-0.12%", segment: "NSE - Equity", contractDate: "Cash Segment", open: 1675.00, high: 1680.00, low: 1670.00, close: 1672.85 }, { name: "INFY EQ", symbol: "INFY", price: 1598.40, change: "+1.03%", segment: "NSE - Equity", contractDate: "Cash Segment", open: 1580.00, high: 1605.00, low: 1578.00, close: 1598.40 }, { name: "TCS EQ", symbol: "TCS", price: 3982.50, change: "-0.22%", segment: "NSE - Equity", contractDate: "Cash Segment", open: 3990.00, high: 3995.00, low: 3975.00, close: 3982.50 }] },
        { name: "CRYPTO", icon: "fa-bitcoin", instruments: [{ name: "BTC/USDT", symbol: "BTCUSDT", price: 68450.20, change: "+2.1%", segment: "Crypto - Futures", contractDate: "Perpetual", open: 67000.00, high: 69000.00, low: 66800.00, close: 68450.20 }, { name: "ETH/USDT", symbol: "ETHUSDT", price: 3420.80, change: "+1.4%", segment: "Crypto - Futures", contractDate: "Perpetual", open: 3370.00, high: 3450.00, low: 3360.00, close: 3420.80 }, { name: "SOL/USDT", symbol: "SOLUSDT", price: 182.30, change: "-0.7%", segment: "Crypto - Futures", contractDate: "Perpetual", open: 183.50, high: 184.00, low: 181.00, close: 182.30 }] },
        { name: "FOREX", icon: "fa-globe", instruments: [{ name: "EUR/USD", symbol: "EURUSD", price: 1.0852, change: "+0.05%", segment: "Forex", contractDate: "Spot", open: 1.0845, high: 1.0860, low: 1.0840, close: 1.0852 }, { name: "GBP/USD", symbol: "GBPUSD", price: 1.2734, change: "-0.02%", segment: "Forex", contractDate: "Spot", open: 1.2738, high: 1.2745, low: 1.2725, close: 1.2734 }, { name: "USD/JPY", symbol: "USDJPY", price: 150.82, change: "+0.12%", segment: "Forex", contractDate: "Spot", open: 150.60, high: 151.00, low: 150.50, close: 150.82 }] },
        { name: "COMEX", icon: "fa-gem", instruments: [{ name: "Gold COMEX", symbol: "GC_F", price: 2356.80, change: "+0.34%", segment: "COMEX - Futures", contractDate: "28 Apr 2025", open: 2348.00, high: 2362.00, low: 2345.00, close: 2356.80 }, { name: "Silver COMEX", symbol: "SI_F", price: 28.45, change: "-0.22%", segment: "COMEX - Futures", contractDate: "28 Apr 2025", open: 28.52, high: 28.60, low: 28.40, close: 28.45 }, { name: "Copper", symbol: "HG_F", price: 4.52, change: "+0.65%", segment: "COMEX - Futures", contractDate: "28 Apr 2025", open: 4.49, high: 4.55, low: 4.48, close: 4.52 }] }
    ];

    function getAllScripts() {
        const scripts = [];
        function traverse(node) {
            if (node.instruments) node.instruments.forEach(inst => scripts.push({ ...inst, category: node.name }));
            if (node.subCategories) node.subCategories.forEach(sub => { if (sub.instruments) sub.instruments.forEach(inst => scripts.push({ ...inst, category: node.name + ' > ' + sub.name })); });
        }
        tradingSegments.forEach(seg => traverse(seg));
        return scripts;
    }

    const allScriptsDB = getAllScripts();
    let watchlistItems = [];
    let basketLegs = [];
    let selectionMode = false;
    let currentTradeScript = null;
    let longPressTimer = null;
    let toastTimeout = null;

    const watchlistContainer = document.getElementById('watchlistMobileContainer');
    const watchlistCounter = document.getElementById('mobileWatchlistCounter');
    const multiSelectBar = document.getElementById('multiSelectBar');
    const selectedCountSpan = document.getElementById('selectedCount');
    const searchInput = document.getElementById('globalSearchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const searchResultsArea = document.getElementById('searchResultsArea');
    const searchResultsList = document.getElementById('searchResultsList');
    const searchResultCount = document.getElementById('searchResultCount');
    const tradeSheet = document.getElementById('tradeSheet');
    const tradeSheetOverlay = document.getElementById('tradeSheetOverlay');
    const detailSheet = document.getElementById('detailSheet');
    const detailSheetOverlay = document.getElementById('detailSheetOverlay');
    const folderDrawer = document.getElementById('scriptsFolderDrawer');
    const overlay = document.getElementById('drawerOverlay');
    const toastEl = document.getElementById('toastMessageMobile');

    function showToast(msg, isError) {
        if (toastTimeout) clearTimeout(toastTimeout);
        toastEl.textContent = msg;
        toastEl.style.background = isError ? "#C62E2E" : "#2C8E5A";
        toastEl.style.opacity = "1";
        toastEl.style.visibility = "visible";
        toastTimeout = setTimeout(() => { toastEl.style.opacity = "0"; toastEl.style.visibility = "hidden"; }, 2000);
    }

    function formatPrice(price, isCrypto) {
        const numPrice = typeof price === 'number' ? price : parseFloat(price);
        if (isCrypto) return '$' + numPrice.toFixed(2);
        return '\\u20b9' + numPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function generateBidAsk(price) {
        const spread = price * 0.001;
        return { bid: price - spread, ask: price + spread };
    }

    function openTradeSheet(script) {
        currentTradeScript = script;
        const isCrypto = script.name.includes("BTC") || script.name.includes("ETH") || script.name.includes("SOL");
        const priceVal = typeof script.price === 'number' ? script.price : parseFloat(script.price);
        document.getElementById('sheetScriptName').innerText = script.name;
        document.getElementById('sheetSegment').innerText = script.segment || "Trading Segment";
        document.getElementById('sheetCmpValue').innerText = formatPrice(priceVal, isCrypto);
        document.getElementById('sheetContractDate').innerText = script.contractDate || "28 Mar 2025";
        const isPositive = script.change.includes('+');
        const chEl = document.getElementById('sheetChange');
        chEl.innerText = script.change;
        chEl.className = 'sheet-change ' + (isPositive ? 'positive' : 'negative');
        const { bid, ask } = generateBidAsk(priceVal);
        document.getElementById('sheetBid').innerText = formatPrice(bid, isCrypto);
        document.getElementById('sheetAsk').innerText = formatPrice(ask, isCrypto);
        
        // Setup initial default values
        const qtyInput = document.getElementById('tradeQtyInput');
        const priceInput = document.getElementById('tradePriceInput');
        
        // Deduce fake lot size
        const lotSize = script.segment?.includes('Options') || script.segment?.includes('Futures') ? (script.name.includes('NIFTY') ? 25 : 15) : 1;
        script.lotSize = lotSize;
        if(qtyInput) qtyInput.value = lotSize;
        if(priceInput) priceInput.value = priceVal.toFixed(2);
        
        const lotHint = document.getElementById('sheetLotHint');
        if(lotHint) lotHint.innerText = '(Lot: ' + lotSize + ')';
        
        updateMarginAndSummary();

        tradeSheet.classList.add('open');
        tradeSheetOverlay.classList.add('active');
    }

    function openDetailSheet(script) {
        currentTradeScript = script;
        const isCrypto = script.name.includes("BTC") || script.name.includes("ETH") || script.name.includes("SOL");
        const priceVal = typeof script.price === 'number' ? script.price : parseFloat(script.price);
        
        const detailName = document.getElementById('detailScriptName'); if(detailName) detailName.innerText = script.name;
        const detailSeg = document.getElementById('detailSegment'); if(detailSeg) detailSeg.innerText = script.segment || "Trading Segment";
        const detailCmp = document.getElementById('detailCmpValue'); if(detailCmp) detailCmp.innerText = formatPrice(priceVal, isCrypto);
        const detailDate = document.getElementById('detailContractDate'); if(detailDate) detailDate.innerText = script.contractDate || "28 Mar 2025";
        
        const isPositive = script.change.includes('+');
        const chEl = document.getElementById('detailChange');
        if(chEl) {
            chEl.innerText = script.change;
            chEl.className = 'sheet-change ' + (isPositive ? 'positive' : 'negative');
        }
        
        const { bid, ask } = generateBidAsk(priceVal);
        const detailBid = document.getElementById('detailBid'); if(detailBid) detailBid.innerText = formatPrice(bid, isCrypto);
        const detailAsk = document.getElementById('detailAsk'); if(detailAsk) detailAsk.innerText = formatPrice(ask, isCrypto);
        
        const detailOpen = document.getElementById('detailOpen'); if(detailOpen) detailOpen.innerText = formatPrice(script.open || priceVal * 0.995, isCrypto);
        const detailHigh = document.getElementById('detailHigh'); if(detailHigh) detailHigh.innerText = formatPrice(script.high || priceVal * 1.005, isCrypto);
        const detailLow = document.getElementById('detailLow'); if(detailLow) detailLow.innerText = formatPrice(script.low || priceVal * 0.992, isCrypto);
        const detailClose = document.getElementById('detailClose'); if(detailClose) detailClose.innerText = formatPrice(script.close || priceVal, isCrypto);
        
        if(detailSheet) detailSheet.classList.add('open');
        if(detailSheetOverlay) detailSheetOverlay.classList.add('active');
    }

    function closeDetailSheet() {
        if(detailSheet) detailSheet.classList.remove('open');
        if(detailSheetOverlay) detailSheetOverlay.classList.remove('active');
    }

    function closeTradeSheet() {
        tradeSheet.classList.remove('open');
        tradeSheet.classList.remove('expanded');
        tradeSheet.style.height = '';
        tradeSheetOverlay.classList.remove('active');
        currentTradeScript = null;
    }

    function executeTrade(type) {
        if (!currentTradeScript) return;
        const priceVal = typeof currentTradeScript.price === 'number' ? currentTradeScript.price : parseFloat(currentTradeScript.price);
        const isCrypto = currentTradeScript.name.includes("BTC") || currentTradeScript.name.includes("ETH") || currentTradeScript.name.includes("SOL");
        showToast(type.toUpperCase() + ' order placed for ' + currentTradeScript.name + ' @ ' + formatPrice(priceVal, isCrypto));
        closeTradeSheet();
    }

    document.getElementById('sheetBuyBtn').addEventListener('click', () => executeTrade('buy'));
    document.getElementById('sheetSellBtn').addEventListener('click', () => executeTrade('sell'));
    tradeSheetOverlay.addEventListener('click', closeTradeSheet);

    const detailBuyBtn = document.getElementById('detailBuyBtn');
    if(detailBuyBtn) detailBuyBtn.addEventListener('click', () => { closeDetailSheet(); openTradeSheet(currentTradeScript); });
    
    const detailSellBtn = document.getElementById('detailSellBtn');
    if(detailSellBtn) detailSellBtn.addEventListener('click', () => { closeDetailSheet(); openTradeSheet(currentTradeScript); });
    
    if(detailSheetOverlay) detailSheetOverlay.addEventListener('click', closeDetailSheet);

    let sheetStartY = 0;
    let isSheetSwiping = false;
    const sheetHandle = document.querySelector('.sheet-handle');
    if (sheetHandle) {
        sheetHandle.addEventListener('touchstart', (e) => {
            sheetStartY = e.touches[0].clientY;
            isSheetSwiping = true;
            tradeSheet.style.transition = 'none';
        }, {passive: true});
        sheetHandle.addEventListener('touchmove', (e) => {
            if (!isSheetSwiping) return;
            const deltaY = e.touches[0].clientY - sheetStartY;
            if (deltaY < 0 && !tradeSheet.classList.contains('expanded')) {
                tradeSheet.style.height = 'calc(65dvh + ' + Math.abs(deltaY) + 'px)';
            } else if (deltaY > 0 && !tradeSheet.classList.contains('expanded')) {
                tradeSheet.style.transform = 'translateY(' + deltaY + 'px)';
            }
        }, {passive: false});
        sheetHandle.addEventListener('touchend', (e) => {
            if (!isSheetSwiping) return;
            isSheetSwiping = false;
            tradeSheet.style.transition = 'transform 0.35s cubic-bezier(0.2, 0.9, 0.4, 1.1), height 0.3s ease-out';
            tradeSheet.style.transform = '';
            tradeSheet.style.height = '';
            const deltaY = e.changedTouches[0].clientY - sheetStartY;
            if (deltaY < -30) {
                tradeSheet.classList.add('expanded');
            } else if (deltaY > 40) {
                if (tradeSheet.classList.contains('expanded')) tradeSheet.classList.remove('expanded');
                else closeTradeSheet();
            }
        });
        sheetHandle.addEventListener('click', () => tradeSheet.classList.toggle('expanded'));
    }

    document.addEventListener('click', (e) => {
        // Order Type Toggle
        const orderBtn = e.target.closest('#orderTypeContainer .trade-chip');
        if (orderBtn) {
            const container = document.getElementById('orderTypeContainer');
            container.querySelectorAll('.trade-chip').forEach(c => c.classList.remove('active'));
            orderBtn.classList.add('active');
            
            const tradePriceInput = document.getElementById('tradePriceInput');
            const tradeTriggerInput = document.getElementById('tradeTriggerInput');
            if(!tradePriceInput || !tradeTriggerInput) return;
            const type = orderBtn.getAttribute('data-type');
            
            if (type === 'market') {
                tradePriceInput.disabled = true; tradePriceInput.classList.add('disabled');
                tradeTriggerInput.disabled = true; tradeTriggerInput.classList.add('disabled');
            } else if (type === 'limit') {
                tradePriceInput.disabled = false; tradePriceInput.classList.remove('disabled');
                tradeTriggerInput.disabled = true; tradeTriggerInput.classList.add('disabled');
            } else if (type === 'sl') {
                tradePriceInput.disabled = false; tradePriceInput.classList.remove('disabled');
                tradeTriggerInput.disabled = false; tradeTriggerInput.classList.remove('disabled');
            } else if (type === 'slm') {
                tradePriceInput.disabled = true; tradePriceInput.classList.add('disabled');
                tradeTriggerInput.disabled = false; tradeTriggerInput.classList.remove('disabled');
            }
            updateMarginAndSummary();
        }

        // Product Type Toggle
        const productBtn = e.target.closest('#productTypeContainer .product-chip');
        if (productBtn) {
            const container = document.getElementById('productTypeContainer');
            container.querySelectorAll('.product-chip').forEach(c => c.classList.remove('active'));
            productBtn.classList.add('active');
            updateMarginAndSummary();
        }

        // Qty Increment/Decrement
        if (e.target.closest('.qty-btn-plus')) {
            const input = document.getElementById('tradeQtyInput');
            if (input) { input.value = parseInt(input.value || 0) + (currentTradeScript?.lotSize || 1); updateMarginAndSummary(); }
        }
        if (e.target.closest('.qty-btn-minus')) {
            const input = document.getElementById('tradeQtyInput');
            if (input) { 
                const newVal = parseInt(input.value || 0) - (currentTradeScript?.lotSize || 1);
                input.value = Math.max((currentTradeScript?.lotSize || 1), newVal); 
                updateMarginAndSummary(); 
            }
        }
    });

    document.addEventListener('input', (e) => {
        if (e.target.id === 'tradePriceInput' || e.target.id === 'tradeQtyInput') {
            updateMarginAndSummary();
        }
    });

    function updateMarginAndSummary() {
        if (!currentTradeScript) return;
        const qtyInput = document.getElementById('tradeQtyInput');
        const priceInput = document.getElementById('tradePriceInput');
        if (!qtyInput || !priceInput) return;
        
        let qty = parseInt(qtyInput.value) || 0;
        let price = parseFloat(priceInput.value) || 0;
        if (priceInput.disabled) {
            price = currentTradeScript.price || 0;
        }

        const isIntraday = document.querySelector('#productTypeContainer .product-chip.active')?.dataset.type === 'mis';
        // Arbitrary margin calculation: MIS is 5x leverage, NRML is 1x (or option margin)
        let marginReq = price * qty;
        if (isIntraday && !currentTradeScript.segment?.includes('Options')) {
            marginReq = marginReq * 0.2; // 5x leverage
        }

        const marginEl = document.getElementById('calculatedMargin');
        if (marginEl) marginEl.innerText = '₹ ' + marginReq.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m])); }

    function enterSelectionMode() {
        if (watchlistItems.length === 0) return;
        selectionMode = true;
        basketLegs = [];
        multiSelectBar.style.display = 'block';
        document.body.classList.add('selection-mode-active');
        updateBasketCount();
        renderWatchlist();
        showToast("Basket mode active - Select Buy or Sell");
    }

    function exitSelectionMode() {
        selectionMode = false;
        basketLegs = [];
        multiSelectBar.style.display = 'none';
        document.body.classList.remove('selection-mode-active');
        renderWatchlist();
    }

    function updateBasketCount() {
        if(selectedCountSpan) selectedCountSpan.innerText = basketLegs.length + ' in basket';
        const basBtn = document.getElementById('createBasketBtn');
        if(basBtn) {
            if (basketLegs.length === 0) basBtn.classList.add('disabled');
            else basBtn.classList.remove('disabled');
        }
    }

    document.getElementById('exitSelectionBtn').addEventListener('click', exitSelectionMode);

    /* BASKET VIEWER LOGIC */
    const basketSheet = document.getElementById('basketSheet');
    const basketSheetOverlay = document.getElementById('basketSheetOverlay');

    if(document.getElementById('createBasketBtn')) {
        document.getElementById('createBasketBtn').addEventListener('click', openBasketSheet);
    }
    if(basketSheetOverlay) {
        basketSheetOverlay.addEventListener('click', closeBasketSheet);
    }

    function openBasketSheet() {
        if(basketLegs.length === 0) return;
        renderBasketLegs();
        if(basketSheet) basketSheet.classList.add('open');
        if(basketSheetOverlay) basketSheetOverlay.classList.add('active');
    }

    function closeBasketSheet() {
        if(basketSheet) basketSheet.classList.remove('open');
        if(basketSheetOverlay) basketSheetOverlay.classList.remove('active');
    }

    if(document.getElementById('basketExecuteBtn')) {
        document.getElementById('basketExecuteBtn').addEventListener('click', () => {
            showToast('Basket Executed Successfully: ' + basketLegs.length + ' Orders', false);
            closeBasketSheet();
            exitSelectionMode();
        });
    }

    function renderBasketLegs() {
        const container = document.getElementById('basketLegsContainer');
        if(!container) return;
        let html = '';
        basketLegs.forEach((leg, i) => {
            const isBuy = leg.type === 'BUY';
            html += \`
            <div style="background:#FFF; border:1px solid #EEF2F8; border-radius:12px; padding:12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                <div style="flex:1">
                    <div style="font-size:0.8rem; font-weight:700; color:#1A1E2B; margin-bottom:6px;">\${leg.name}</div>
                    <div style="display:flex; gap:10px; align-items:center;">
                        <div style="display:flex; background:#EEF2F8; border-radius:6px; overflow:hidden;">
                            <div class="bs-toggle \${isBuy ? 'active buy' : ''}" data-i="\${i}" data-val="BUY" style="padding:4px 10px; font-size:0.6rem; font-weight:700; cursor:pointer; \${isBuy ? 'background:#2C8E5A;color:white;' : 'color:#5B677E;'}">B</div>
                            <div class="bs-toggle \${!isBuy ? 'active sell' : ''}" data-i="\${i}" data-val="SELL" style="padding:4px 10px; font-size:0.6rem; font-weight:700; cursor:pointer; \${!isBuy ? 'background:#C62E2E;color:white;' : 'color:#5B677E;'}">S</div>
                        </div>
                        <div style="display:flex; border:1px solid #EEF2F8; border-radius:6px; overflow:hidden;">
                            <div class="bq-minus" data-i="\${i}" style="padding:4px 8px; background:#F8FAFF; cursor:pointer; color:#5B677E; font-size:0.6rem;"><i class="fas fa-minus"></i></div>
                            <div style="padding:4px 8px; font-size:0.7rem; font-weight:700; color:#1A1E2B; min-width:30px; text-align:center;">\${leg.qty}</div>
                            <div class="bq-plus" data-i="\${i}" style="padding:4px 8px; background:#F8FAFF; cursor:pointer; color:#5B677E; font-size:0.6rem;"><i class="fas fa-plus"></i></div>
                        </div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.8rem; font-weight:700; color:#1A1E2B; margin-bottom:8px;">₹\${(leg.price * leg.qty).toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2})}</div>
                    <div class="b-remove" data-i="\${i}" style="color:#C62E2E; cursor:pointer; padding:4px;"><i class="fas fa-trash-alt"></i></div>
                </div>
            </div>
            \`;
        });
        container.innerHTML = html;
        updateBasketMargin();

        container.querySelectorAll('.bs-toggle').forEach(el => {
            el.addEventListener('click', (e) => {
                const i = parseInt(e.currentTarget.getAttribute('data-i'));
                basketLegs[i].type = e.currentTarget.getAttribute('data-val');
                renderBasketLegs();
            });
        });
        container.querySelectorAll('.bq-minus').forEach(el => {
            el.addEventListener('click', (e) => {
                const i = parseInt(e.currentTarget.getAttribute('data-i'));
                basketLegs[i].qty = Math.max(basketLegs[i].lotSize, basketLegs[i].qty - basketLegs[i].lotSize);
                renderBasketLegs();
            });
        });
        container.querySelectorAll('.bq-plus').forEach(el => {
            el.addEventListener('click', (e) => {
                const i = parseInt(e.currentTarget.getAttribute('data-i'));
                basketLegs[i].qty += basketLegs[i].lotSize;
                renderBasketLegs();
            });
        });
        container.querySelectorAll('.b-remove').forEach(el => {
            el.addEventListener('click', (e) => {
                const i = parseInt(e.currentTarget.getAttribute('data-i'));
                basketLegs.splice(i, 1);
                updateBasketCount();
                if(basketLegs.length === 0) closeBasketSheet();
                else renderBasketLegs();
            });
        });
    }

    function updateBasketMargin() {
        let req = 0;
        let totalVal = 0;
        let hasBuyOption = false;
        let hasSellOption = false;
        
        basketLegs.forEach(leg => {
            const val = leg.price * leg.qty;
            totalVal += val;
            if(leg.option) {
                if(leg.type === 'BUY') { req += val; hasBuyOption = true; }
                else { req += (val * 10); hasSellOption = true; } // Simulated option selling margin
            } else {
                req += val * 0.2; // Simulated MIS margin
            }
        });

        // hedging logic
        if(hasBuyOption && hasSellOption && req > 50000) {
            req = req * 0.4;
        }

        const ti = document.getElementById('basketTotalItems'); if(ti) ti.innerText = basketLegs.length;
        const tv = document.getElementById('basketTotalValue'); if(tv) tv.innerText = '₹' + totalVal.toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2});
        const rm = document.getElementById('basketReqMargin'); if(rm) rm.innerText = '₹' + req.toLocaleString('en-IN', {minimumFractionDigits:2, maximumFractionDigits:2});
    }

    function renderWatchlist() {
        if (!watchlistContainer) return;
        if (watchlistItems.length === 0) {
            watchlistContainer.innerHTML = '<div class="empty-watchlist"><i class="fas fa-plus-circle" style="font-size:2rem;margin-bottom:12px;display:block;opacity:0.3;"></i><p style="font-weight:600;margin-top:12px;">Your watchlist is empty</p><p style="font-size:12px;margin-top:8px;">Search above or tap Scripts Library to add instruments</p></div>';
            watchlistCounter.innerText = '0 items';
            if (selectionMode) exitSelectionMode();
            return;
        }
        let html = '<div class="watchlist-card-list">';
        watchlistItems.forEach((item, idx) => {
            const isPositive = item.change.includes('+') || parseFloat(item.change) > 0;
            const changeClass = isPositive ? 'positive' : 'negative';
            const priceVal = typeof item.price === 'number' ? item.price.toFixed(2) : item.price;
            
            if (selectionMode) {
                // Basket Mode View: Oval Buy/Sell buttons on the right
                html += '<div class="swipe-container" data-idx="' + idx + '"><div class="instrument-card" data-card-idx="' + idx + '"><div class="instrument-info" style="flex:1;"><div class="instrument-symbol">' + escapeHtml(item.name) + '</div><div class="instrument-name">' + escapeHtml(item.symbol) + '</div></div><div class="instrument-price-area" style="text-align:right; margin-right:12px;"><div class="price-value" style="font-size:0.85rem;">' + priceVal + '</div><div class="change-badge ' + changeClass + '">' + item.change + '</div></div><div class="basket-inline-actions" style="display:flex; gap:6px; flex-shrink:0;"><button class="inline-bs-btn" style="background:#E9F6EF; color:#006400; border:1px solid #2C8E5A; border-radius:30px; padding:4px 14px; font-weight:700; font-size:0.7rem; cursor:pointer;" data-idx="' + idx + '" data-type="BUY">BUY</button><button class="inline-bs-btn" style="background:#FEF0F0; color:#C62E2E; border:1px solid #C62E2E; border-radius:30px; padding:4px 14px; font-weight:700; font-size:0.7rem; cursor:pointer;" data-idx="' + idx + '" data-type="SELL">SELL</button></div></div></div>';
            } else {
                // Normal View
                html += '<div class="swipe-container" data-idx="' + idx + '"><div class="delete-background"><i class="fas fa-trash-alt"></i> Delete</div><div class="instrument-card" data-card-idx="' + idx + '" data-name="' + escapeHtml(item.name) + '" data-symbol="' + escapeHtml(item.symbol) + '" data-price="' + item.price + '" data-change="' + item.change + '" data-segment="' + escapeHtml(item.segment || 'Trading') + '" data-contract="' + escapeHtml(item.contractDate || '28 Mar 2025') + '" data-open="' + (item.open || item.price * 0.995) + '" data-high="' + (item.high || item.price * 1.005) + '" data-low="' + (item.low || item.price * 0.992) + '" data-close="' + (item.close || item.price) + '"><div class="instrument-info"><div class="instrument-symbol">' + escapeHtml(item.name) + '</div><div class="instrument-name">' + escapeHtml(item.symbol) + '</div></div><div class="instrument-price-area"><div class="price-value">' + priceVal + '</div><div class="change-badge ' + changeClass + '">' + item.change + '</div></div></div></div>';
            }
        });
        html += '</div>';
        watchlistContainer.innerHTML = html;
        watchlistCounter.innerText = watchlistItems.length + ' items';

        document.querySelectorAll('.swipe-container').forEach(container => {
            const idx = parseInt(container.getAttribute('data-idx'));
            let startX = 0, currentX = 0, isSwiping = false;
            const card = container.querySelector('.instrument-card');
            function handleStart(e) { if (selectionMode) return; const clientX = e.touches ? e.touches[0].clientX : e.clientX; startX = clientX; currentX = 0; isSwiping = true; container.classList.add('swiping'); card.style.transition = 'none'; }
            function handleMove(e) { if (!isSwiping || selectionMode) return; const deltaX = (e.touches ? e.touches[0].clientX : e.clientX) - startX; currentX = deltaX; let offset = Math.min(Math.max(deltaX, -80), 80); card.style.transform = 'translateX(' + offset + 'px)'; if (e.cancelable) e.preventDefault(); }
            function handleEnd() { if (!isSwiping || selectionMode) return; isSwiping = false; container.classList.remove('swiping'); card.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1)'; if (Math.abs(currentX) > 45) { const removed = watchlistItems[idx]; watchlistItems.splice(idx, 1); renderWatchlist(); showToast('Removed ' + removed.name); } else { card.style.transform = 'translateX(0px)'; } }
            card.addEventListener('touchstart', handleStart, { passive: true });
            card.addEventListener('touchmove', handleMove, { passive: false });
            card.addEventListener('touchend', handleEnd);
        });

        document.querySelectorAll('.instrument-card').forEach(card => {
            const idx = parseInt(card.getAttribute('data-card-idx'));
            if (!selectionMode) {
                card.addEventListener('click', (e) => {
                    openDetailSheet({ name: card.dataset.name, symbol: card.dataset.symbol, price: parseFloat(card.dataset.price), change: card.dataset.change, segment: card.dataset.segment, contractDate: card.dataset.contract, open: parseFloat(card.dataset.open), high: parseFloat(card.dataset.high), low: parseFloat(card.dataset.low), close: parseFloat(card.dataset.close) });
                });
                card.addEventListener('touchstart', () => { longPressTimer = setTimeout(() => { if (watchlistItems.length > 0) { enterSelectionMode(); } }, 500); }, { passive: true });
                card.addEventListener('touchend', () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } });
                card.addEventListener('touchmove', () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } });
            }
        });

        if (selectionMode) {
            document.querySelectorAll('.inline-bs-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const i = parseInt(btn.getAttribute('data-idx'));
                    const type = btn.getAttribute('data-type');
                    const item = watchlistItems[i];
                    
                    const isNifty = item.symbol.includes('NIFTY') && !item.symbol.includes('BANK') && !item.symbol.includes('FIN');
                    const isBank = item.symbol.includes('BANKNIFTY');
                    const isFin = item.symbol.includes('FINNIFTY');
                    const lot = item.segment.includes('Equity') ? 1 : (item.segment.includes('MCX') ? 10 : (isNifty ? 25 : (isBank ? 15 : (isFin ? 40 : 1))));

                    basketLegs.push({
                        idx: i,
                        name: item.name,
                        symbol: item.symbol,
                        price: parseFloat(item.price),
                        qty: lot,
                        lotSize: lot,
                        type: type,
                        option: item.segment.includes('Options')
                    });
                    
                    updateBasketCount();
                    showToast(item.name + " added to Basket as " + type);
                });
            });
        }
    }

    function addToWatchlist(inst) {
        if (!inst || !inst.symbol) return false;
        if (watchlistItems.some(i => i.symbol === inst.symbol)) { showToast(inst.name + ' already in watchlist', true); return false; }
        watchlistItems.push({ ...inst });
        if (selectionMode) exitSelectionMode();
        renderWatchlist();
        showToast(inst.name + ' added to watchlist');
        return true;
    }

    function performSearch(query) {
        const term = query.trim().toLowerCase();
        if (term.length === 0) { searchResultsArea.style.display = 'none'; clearSearchBtn.classList.remove('visible'); return; }
        clearSearchBtn.classList.add('visible');
        const filtered = allScriptsDB.filter(s => s.name.toLowerCase().includes(term) || s.symbol.toLowerCase().includes(term));
        searchResultCount.innerText = filtered.length + ' results';
        if (filtered.length === 0) { searchResultsArea.style.display = 'block'; searchResultsList.innerHTML = '<div class="no-results"><i class="fas fa-search"></i> No matching scripts found</div>'; return; }
        let html = '<div class="search-result-list">';
        filtered.forEach(script => {
            const priceVal = typeof script.price === 'number' ? script.price.toFixed(2) : script.price;
            html += '<div class="search-result-item"><div class="search-result-info"><div class="search-result-name">' + escapeHtml(script.name) + '</div><div class="search-result-symbol">' + escapeHtml(script.symbol) + ' - ' + escapeHtml(script.category || '') + '</div></div><div class="search-result-price">' + priceVal + '</div><button class="add-smart-btn" data-symbol="' + escapeHtml(script.symbol) + '" data-name="' + escapeHtml(script.name) + '" data-price="' + script.price + '" data-change="' + script.change + '" data-segment="' + escapeHtml(script.segment || '') + '" data-contract="' + escapeHtml(script.contractDate || '28 Mar 2025') + '" data-open="' + (script.open || script.price * 0.995) + '" data-high="' + (script.high || script.price * 1.005) + '" data-low="' + (script.low || script.price * 0.992) + '" data-close="' + (script.close || script.price) + '">Add</button></div>';
        });
        html += '</div>';
        searchResultsList.innerHTML = html;
        searchResultsArea.style.display = 'block';
        document.querySelectorAll('.add-smart-btn').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); addToWatchlist({ name: btn.dataset.name, symbol: btn.dataset.symbol, price: parseFloat(btn.dataset.price), change: btn.dataset.change, segment: btn.dataset.segment, contractDate: btn.dataset.contract, open: parseFloat(btn.dataset.open), high: parseFloat(btn.dataset.high), low: parseFloat(btn.dataset.low), close: parseFloat(btn.dataset.close) }); });
        });
    }

    searchInput.addEventListener('input', (e) => performSearch(e.target.value));
    clearSearchBtn.addEventListener('click', () => { searchInput.value = ''; performSearch(''); searchInput.focus(); });

    function buildFolderTree() {
        const container = document.getElementById('folderTreeMobile');
        if (!container) return;
        container.innerHTML = '';
        const rootUl = document.createElement('ul'); rootUl.className = 'tree-node-ul';
        function renderNode(item) {
            const hasChildren = (item.instruments && item.instruments.length) || (item.subCategories && item.subCategories.length);
            const li = document.createElement('li'); li.className = 'tree-item-li';
            if (hasChildren) li.classList.add('collapsed');
            const labelDiv = document.createElement('div'); labelDiv.className = 'tree-label-row';
            if (hasChildren) {
                const chev = document.createElement('i'); chev.className = 'fas fa-chevron-right chevron-icon'; labelDiv.appendChild(chev);
                const fIcon = document.createElement('i'); fIcon.className = 'fas ' + (item.icon || 'fa-folder') + ' folder-icon'; labelDiv.appendChild(fIcon);
            } else {
                const spacer = document.createElement('span'); spacer.style.width = '22px'; spacer.style.display = 'inline-block'; labelDiv.appendChild(spacer);
                const fileIcon = document.createElement('i'); fileIcon.className = 'fas fa-chart-line file-icon'; labelDiv.appendChild(fileIcon);
            }
            const nameSpan = document.createElement('span'); nameSpan.innerText = item.name; labelDiv.appendChild(nameSpan);
            const isLeaf = (!hasChildren && item.symbol);
            if (isLeaf) {
                const addBtn = document.createElement('button'); addBtn.innerHTML = '<i class="fas fa-plus"></i> Add'; addBtn.className = 'add-script-btn';
                addBtn.addEventListener('click', (e) => { e.stopPropagation(); addToWatchlist({ name: item.name, symbol: item.symbol, price: item.price, change: item.change, segment: item.segment, contractDate: item.contractDate, open: item.open, high: item.high, low: item.low, close: item.close }); });
                labelDiv.appendChild(addBtn);
            } else if (item.instruments && !item.subCategories) {
                const cnt = document.createElement('span'); cnt.className = 'segment-count'; cnt.innerText = item.instruments.length; labelDiv.appendChild(cnt);
            } else if (item.subCategories) {
                const total = item.subCategories.reduce((acc, c) => acc + (c.instruments ? c.instruments.length : 0), 0);
                const badge = document.createElement('span'); badge.className = 'segment-count'; badge.innerText = total; labelDiv.appendChild(badge);
            }
            li.appendChild(labelDiv);
            if (hasChildren) {
                const childrenUl = document.createElement('ul'); childrenUl.className = 'children-container';
                if (item.instruments) item.instruments.forEach(inst => childrenUl.appendChild(renderNode(inst)));
                else if (item.subCategories) item.subCategories.forEach(sub => childrenUl.appendChild(renderNode(sub)));
                li.appendChild(childrenUl);
                labelDiv.addEventListener('click', (e) => { if (e.target.tagName === 'BUTTON') return; li.classList.toggle('collapsed'); const ch = labelDiv.querySelector('.chevron-icon'); if (ch) ch.style.transform = li.classList.contains('collapsed') ? 'rotate(0deg)' : 'rotate(90deg)'; });
            }
            return li;
        }
        tradingSegments.forEach(seg => rootUl.appendChild(renderNode(seg)));
        container.appendChild(rootUl);
    }

    document.addEventListener('click', (e) => {
        if (e.target.closest('#basketModeBtn')) {
            if (!selectionMode) enterSelectionMode();
            else exitSelectionMode();
        }
    });
    document.getElementById('openFolderMobileBtn').addEventListener('click', () => { folderDrawer.classList.add('open'); overlay.classList.add('active'); });
    document.getElementById('closeFolderDrawerBtn').addEventListener('click', () => { folderDrawer.classList.remove('open'); overlay.classList.remove('active'); });
    overlay.addEventListener('click', () => { folderDrawer.classList.remove('open'); overlay.classList.remove('active'); });

    renderWatchlist();
    buildFolderTree();
})();
        `;
        document.body.appendChild(script);
        return () => { if (document.body.contains(script)) document.body.removeChild(script); };
    }, []);

    return (
        <div className="mobile-app">
            <div className="app-header" style={{ width: '100%' }}>
                <div className="header-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <div className="logo-area">
                        <div className="logo-text">Watchlist</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <div className="folder-btn" id="openFolderMobileBtn">
                            <i className="fas fa-folder"></i>
                            <span>Library</span>
                            <i className="fas fa-chevron-right"></i>
                        </div>
                    </div>
                </div>
                <div className="search-wrapper">
                    <i className="fas fa-search search-icon"></i>
                    <input type="text" className="search-input" id="globalSearchInput" placeholder="Search stocks, futures, crypto from library..." autoComplete="off" />
                    <i className="fas fa-times-circle clear-search" id="clearSearchBtn"></i>
                </div>
            </div>

            <div className="main-content">
                <div id="searchResultsArea" className="search-results-section" style={{ display: 'none' }}>
                    <div className="section-subtitle">
                        <i className="fas fa-search"></i> SEARCH RESULTS <span style={{ fontSize: '0.6rem', marginLeft: 'auto' }} id="searchResultCount"></span>
                    </div>
                    <div id="searchResultsList"></div>
                </div>

                <div className="watchlist-section">
                    <div className="watchlist-header">
                        <div className="watchlist-title-section">
                            <div className="watchlist-title"><i className="fas fa-chart-line"></i> MY WATCHLIST</div>
                            <div className="watchlist-count" id="mobileWatchlistCounter">0 items</div>
                        </div>
                        <div className="action-hint">Swipe | Hold to select | Tap to trade</div>
                    </div>
                    <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <span className="add-hint"><i className="fas fa-plus-circle"></i> Add scripts to watchlist from Scripts Library</span>
                        <div className="folder-btn basket-btn" id="basketModeBtn" style={{ cursor: 'pointer', background: '#E9F6EF', color: '#006400', border: '1px solid #C3E6D4', padding: '6px 14px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '30px', fontWeight: '700', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            <i className="fas fa-shopping-basket" style={{ color: '#006400' }}></i>
                            <span>Basket</span>
                        </div>
                    </div>



                    <div className="watchlist-cards-container">
                        <div id="watchlistMobileContainer"></div>
                    </div>
                </div>
            </div>

            {/* Trade Sheet */}
            <div id="tradeSheetOverlay" className="trade-sheet-overlay"></div>
            <div id="tradeSheet" className="trade-sheet modern-trade-sheet">
                <div className="sheet-handle"><div className="handle-bar"></div></div>
                <div className="sheet-content-scroll">
                    <div className="sheet-header">
                        <div className="sheet-header-row" style={{ alignItems: 'flex-start' }}>
                            <div>
                                <div className="sheet-script-name" id="sheetScriptName">NIFTY FUT</div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '4px' }}>
                                    <span className="sheet-segment" id="sheetSegment">NSE - Futures</span>
                                    <span className="sheet-contract-value" id="sheetContractDate" style={{ background: '#F0F2F8', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: '600', color: '#5B677E' }}>28 Mar 2025</span>
                                </div>
                            </div>
                            <div className="sheet-cmp-area" style={{ textAlign: 'right' }}>
                                <div className="sheet-cmp-value" id="sheetCmpValue" style={{ fontSize: '1.4rem' }}>₹22,456.80</div>
                                <div className="sheet-change" id="sheetChange" style={{ fontSize: '0.75rem', marginTop: '2px' }}>+0.45%</div>
                            </div>
                        </div>
                    </div>

                    <div className="sheet-bidask-minimalist" style={{ display: 'flex', padding: '12px 20px', gap: '20px', background: '#F8FAFF', borderBottom: '1px solid #EEF2F8' }}>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: '#8C94A8', fontSize: '0.65rem', fontWeight: '600' }}>BID</span><span id="sheetBid" style={{ color: '#2C8E5A', fontWeight: '700', fontSize: '0.85rem' }}>₹22,434.20</span></div>
                        <div style={{ width: '1px', background: '#DCE3EC' }}></div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: '#8C94A8', fontSize: '0.65rem', fontWeight: '600' }}>ASK</span><span id="sheetAsk" style={{ color: '#C62E2E', fontWeight: '700', fontSize: '0.85rem' }}>₹22,479.40</span></div>
                    </div>

                    <div className="advanced-trade-sections" style={{ padding: '20px 16px' }}>

                        <div className="trade-toggle-group" style={{ marginBottom: '16px' }}>
                            <div className="trade-toggle-lbl">Product Type</div>
                            <div className="trade-chips product-chips" id="productTypeContainer" style={{ background: '#F8FAFF', border: '1px solid #EEF2F8' }}>
                                <button className="trade-chip product-chip active" data-type="nrml" style={{ padding: '8px 16px', fontSize: '0.7rem' }}>Carryforward (NRML)</button>
                                <button className="trade-chip product-chip" data-type="mis" style={{ padding: '8px 16px', fontSize: '0.7rem' }}>Intraday (MIS)</button>
                            </div>
                        </div>

                        <div className="trade-toggle-group" style={{ marginBottom: '16px' }}>
                            <div className="trade-toggle-lbl">Order Type</div>
                            <div className="trade-chips type-chips" id="orderTypeContainer">
                                <button className="trade-chip" data-type="market">Market</button>
                                <button className="trade-chip active" data-type="limit">Limit</button>
                                <button className="trade-chip" data-type="sl">SL</button>
                                <button className="trade-chip" data-type="slm">SL-M</button>
                            </div>
                        </div>

                        <div className="trade-inputs-row">
                            <div className="trade-input-box modern-input-box">
                                <label>Quantity <span className="lot-hint" id="sheetLotHint">(Lot: 15)</span></label>
                                <div className="qty-control modern-qty">
                                    <button className="qty-btn qty-btn-minus"><i className="fas fa-minus"></i></button>
                                    <input type="number" id="tradeQtyInput" defaultValue="15" className="qty-input" />
                                    <button className="qty-btn qty-btn-plus"><i className="fas fa-plus"></i></button>
                                </div>
                            </div>
                            <div className="trade-input-box modern-input-box">
                                <label>Price (₹)</label>
                                <input type="number" id="tradePriceInput" placeholder="Enter Price" defaultValue="22434.20" className="price-input" />
                            </div>
                        </div>

                        <div className="trade-inputs-row" style={{ marginTop: '16px' }}>
                            <div className="trade-input-box modern-input-box">
                                <label>Trigger Price (SL)</label>
                                <input type="number" id="tradeTriggerInput" placeholder="0.00" className="price-input disabled" disabled />
                            </div>
                            <div className="trade-input-box modern-input-box">
                                <label>Smart GTT / Target <span className="badge-pro">PRO</span></label>
                                <input type="text" placeholder="Set Target % or ₹" className="price-input" />
                            </div>
                        </div>

                        <div className="margin-summary" style={{ marginTop: '24px', background: '#FDFEFF', border: '1px solid #EEF2F8', padding: '16px', borderRadius: '16px' }}>
                            <div className="margin-row" style={{ marginBottom: '12px' }}>
                                <span className="m-label" style={{ fontSize: '0.75rem', fontWeight: '500', color: '#8C94A8' }}>Margin Required</span>
                                <span className="m-val calculated-margin" id="calculatedMargin" style={{ fontSize: '1rem', fontWeight: '800', color: '#1A1E2B' }}>₹ 0.00</span>
                            </div>
                            <div className="margin-row" style={{ borderTop: '1px dashed #EEF2F8', paddingTop: '12px', marginTop: '4px' }}>
                                <span className="m-label" style={{ fontSize: '0.75rem', color: '#8C94A8' }}>Available Balance</span>
                                <span className="m-val balance" style={{ background: '#E9F6EF', padding: '4px 10px', borderRadius: '8px', color: '#006400', fontSize: '0.75rem', fontWeight: '700' }}>₹ 4,50,000.00</span>
                            </div>
                        </div>
                    </div>

                    <div className="sheet-actions sticky" style={{ background: '#FFFFFF', padding: '16px', gap: '12px', boxShadow: '0 -10px 30px rgba(0,0,0,0.05)', borderRadius: '20px 20px 0 0' }}>
                        <button className="sheet-btn-buy" id="sheetBuyBtn" style={{ background: '#16A34A', color: 'white', borderRadius: '16px', border: 'none', padding: '18px 0', fontSize: '1.1rem', fontWeight: '800', boxShadow: '0 8px 16px rgba(22,163,74,0.25)' }}>
                            BUY
                        </button>
                        <button className="sheet-btn-sell" id="sheetSellBtn" style={{ background: '#DC2626', color: 'white', borderRadius: '16px', border: 'none', padding: '18px 0', fontSize: '1.1rem', fontWeight: '800', boxShadow: '0 8px 16px rgba(220,38,38,0.25)' }}>
                            SELL
                        </button>
                    </div>
                </div>
            </div>

            {/* Detail Sheet */}
            <div id="detailSheetOverlay" className="trade-sheet-overlay"></div>
            <div id="detailSheet" className="trade-sheet detail-sheet" style={{ height: 'auto', maxHeight: '90dvh', paddingBottom: '30px' }}>
                <div className="sheet-handle"><div className="handle-bar"></div></div>
                <div style={{ padding: '0 20px 20px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                        <div>
                            <div id="detailScriptName" style={{ fontSize: '1.2rem', fontWeight: '800', color: '#1A1E2B', marginBottom: '8px' }}>BANKNIFTY 48500 CE</div>
                            <span id="detailSegment" style={{ fontSize: '0.65rem', fontWeight: '700', color: '#DC2626', background: '#FEF2F2', padding: '4px 10px', borderRadius: '20px' }}>NSE - Options</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: '600', color: '#8C94A8', textTransform: 'uppercase', marginBottom: '2px' }}>CMP</div>
                            <div id="detailCmpValue" style={{ fontSize: '1.4rem', fontWeight: '800', color: '#1A1E2B', marginBottom: '6px' }}>₹215.60</div>
                            <span id="detailChange" className="sheet-change" style={{ fontSize: '0.7rem', fontWeight: '700', padding: '2px 8px' }}>-0.4%</span>
                        </div>
                    </div>

                    <div style={{ height: '1px', background: '#F0F2F8', margin: '0 -20px 16px', width: 'calc(100% + 40px)' }}></div>

                    <div style={{ background: '#F8FAFF', borderRadius: '16px', padding: '16px', display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8', marginBottom: '6px' }}>BID</div>
                            <div id="detailBid" style={{ fontSize: '1.05rem', fontWeight: '700', color: '#16A34A' }}>₹215.38</div>
                        </div>
                        <div style={{ width: '1px', background: '#E2E8F0', height: '30px' }}></div>
                        <div style={{ flex: 1, textAlign: 'center' }}>
                            <div style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8', marginBottom: '6px' }}>ASK</div>
                            <div id="detailAsk" style={{ fontSize: '1.05rem', fontWeight: '700', color: '#DC2626' }}>₹215.82</div>
                        </div>
                    </div>

                    <div style={{ marginBottom: '20px' }}>
                        <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#5B677E', marginBottom: '10px' }}>PRICE SUMMARY</div>
                        <div style={{ background: '#F8FAFF', borderRadius: '16px', padding: '16px', display: 'flex', justifyContent: 'space-between' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8', marginBottom: '6px' }}>OPEN</div>
                                <div id="detailOpen" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#16A34A' }}>₹216.50</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8', marginBottom: '6px' }}>HIGH</div>
                                <div id="detailHigh" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#16A34A' }}>₹218.00</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8', marginBottom: '6px' }}>LOW</div>
                                <div id="detailLow" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#DC2626' }}>₹214.00</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.65rem', fontWeight: '600', color: '#8C94A8', marginBottom: '6px' }}>CLOSE</div>
                                <div id="detailClose" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1A1E2B' }}>₹215.60</div>
                            </div>
                        </div>
                    </div>

                    <div style={{ background: '#F8FAFF', borderRadius: '16px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: '600', color: '#8C94A8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <i className="far fa-calendar-alt"></i> CONTRACT DATE
                        </div>
                        <div id="detailContractDate" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1A1E2B', background: '#FFFFFF', padding: '4px 12px', borderRadius: '20px' }}>28 Mar 2025</div>
                    </div>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button id="detailBuyBtn" style={{ flex: 1, background: '#22A366', color: 'white', border: 'none', padding: '14px 0', borderRadius: '30px', fontSize: '1rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-arrow-up"></i> BUY
                        </button>
                        <button id="detailSellBtn" style={{ flex: 1, background: '#C62E2E', color: 'white', border: 'none', padding: '14px 0', borderRadius: '30px', fontSize: '1rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                            <i className="fas fa-arrow-down"></i> SELL
                        </button>
                    </div>
                </div>
            </div>

            {/* Basket Sheet */}
            <div id="basketSheetOverlay" className="trade-sheet-overlay"></div>
            <div id="basketSheet" className="trade-sheet detail-sheet" style={{ height: 'auto', maxHeight: '90dvh', paddingBottom: '30px', background: '#F8FAFF' }}>
                <div className="sheet-handle"><div className="handle-bar"></div></div>
                <div style={{ padding: '0 20px 20px 20px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: '800', color: '#1A1E2B', marginBottom: '16px' }}><i className="fas fa-shopping-basket"></i> Basket Orders</div>

                    <div id="basketLegsContainer" style={{ maxHeight: '40dvh', overflowY: 'auto', marginBottom: '20px' }}>
                        {/* Legs injected here */}
                    </div>

                    <div className="margin-summary" style={{ background: '#FFFFFF', border: '1px solid #EEF2F8', padding: '16px', borderRadius: '16px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>

                        <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#8C94A8' }}>Total Items</span>
                            <span id="basketTotalItems" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1A1E2B' }}>0</span>
                        </div>

                        <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#8C94A8' }}>Total Value</span>
                            <span id="basketTotalValue" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#1A1E2B' }}>₹0.00</span>
                        </div>

                        <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: '600', color: '#8C94A8' }}>Required Margin</span>
                            <span id="basketReqMargin" style={{ fontSize: '0.85rem', fontWeight: '700', color: '#C62E2E' }}>₹0.00</span>
                        </div>

                        <div className="margin-row" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #EEF2F8', paddingTop: '10px', marginTop: '2px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#1A1E2B' }}>Available Balance</span>
                            <span id="basketAvailBalance" style={{ fontSize: '0.9rem', fontWeight: '800', color: '#2C8E5A', background: '#E9F6EF', padding: '4px 10px', borderRadius: '8px' }}>₹4,50,000.00</span>
                        </div>

                    </div>

                    <button id="basketExecuteBtn" style={{ width: '100%', background: '#2C8E5A', color: 'white', border: 'none', padding: '16px 0', borderRadius: '30px', fontSize: '1.1rem', fontWeight: '800', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', boxShadow: '0 8px 15px rgba(44,142,90,0.3)' }}>
                        <i className="fas fa-bolt"></i> EXECUTE BASKET
                    </button>
                </div>
            </div>

            {/* Scripts Library Drawer */}
            <div id="drawerOverlay" className="drawer-overlay"></div>
            <div id="scriptsFolderDrawer" className="folder-drawer">
                <div className="drawer-header">
                    <h3><i className="fas fa-folder"></i> Trading Segments</h3>
                    <button className="close-drawer" id="closeFolderDrawerBtn"><i className="fas fa-times"></i></button>
                </div>
                <div className="folder-tree-scroll" id="folderTreeMobile"></div>
                <div className="drawer-footer"><i className="fas fa-plus-circle"></i> Tap <span style={{ color: '#C62E2E' }}>+ Add</span> to watchlist | Browse all segments</div>
            </div>

            <div id="toastMessageMobile" className="mobile-toast" style={{ opacity: 0, visibility: 'hidden' }}></div>

            {/* View Basket Bottom Bar */}
            <div id="multiSelectBar" style={{ display: 'none', position: 'absolute', bottom: '70px', left: '16px', right: '16px', zIndex: 100 }}>
                <div className="multi-select-bar" style={{ background: '#FFF', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid #E8ECF0' }}>
                    <div className="multi-select-row top-row" style={{ padding: '8px 16px', borderBottom: '1px solid #E8ECF0' }}>
                        <span className="selected-count" id="selectedCount" style={{ marginLeft: 0, background: '#E9F6EF', color: '#006400', padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '800' }}>0 in basket</span>
                    </div>
                    <div className="multi-select-row bottom-row" style={{ padding: '10px 16px', background: '#F8FAFF' }}>
                        <div className="delete-actions" style={{ display: 'flex', gap: '12px', width: '100%' }}>
                            <button className="exit-selection-btn" id="exitSelectionBtn" style={{ flex: 1, background: '#F0F2F5', color: '#5B677E', border: 'none', borderRadius: '30px', padding: '10px', fontWeight: '600', cursor: 'pointer' }}><i className="fas fa-times"></i> Cancel</button>
                            <button className="basket-create-btn disabled" id="createBasketBtn" style={{ background: '#2C8E5A', color: '#fff', border: 'none', borderRadius: '30px', padding: '10px 18px', fontSize: '0.9rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px', flex: 2, justifyContent: 'center', cursor: 'pointer', boxShadow: '0 4px 10px rgba(44,142,90,0.2)' }}><i className="fas fa-shopping-basket"></i> View Basket</button>
                        </div>
                    </div>
                </div>
            </div>

            <Footer activeTab="watchlist" />
        </div>
    );
}
