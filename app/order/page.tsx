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
  // Margin Apex - Compact Professional Design
  var openOrders = [];
  var closedOrders = [];
  var nextOrderId = 1001;
  
  var activeTab = 'open';
  var searchQuery = '';
  
  var ordersContainer = document.getElementById('orders-container');
  var openCountSpan = document.getElementById('open-count');
  var closedCountSpan = document.getElementById('closed-count');
  var searchInput = document.getElementById('searchInput');
  var clearSearchBtn = document.getElementById('clearSearchBtn');
  
  function formatUSD(value) {
    return '\$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  
  function updateCounters() {
    openCountSpan.innerText = openOrders.length;
    closedCountSpan.innerText = closedOrders.length;
  }
  
  function showToast(message) {
    var toast = document.getElementById('toast-message');
    document.getElementById('toast-text').innerText = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 1800);
  }
  
  function filterOrders(orders) {
    if (!searchQuery.trim()) return orders;
    var query = searchQuery.toLowerCase().trim();
    return orders.filter(order => order.symbol.toLowerCase().includes(query));
  }
  
  function cancelOrder(orderId) {
    var index = openOrders.findIndex(o => o.id === orderId);
    if (index === -1) {
      showToast("Order not found");
      return;
    }
    var order = openOrders[index];
    
    var rejectionReasons = ['margin not enough', 'out of range'];
    var randomReason = rejectionReasons[Math.floor(Math.random() * rejectionReasons.length)];
    
    var cancelledOrder = { 
      ...order, 
      status: 'REJECTED', 
      closedAt: Date.now(),
      rejectionReason: randomReason
    };
    closedOrders.unshift(cancelledOrder);
    openOrders.splice(index, 1);
    updateCounters();
    renderOrders();
    showToast(\`\${order.symbol} cancelled\`);
  }
  
  function formatTime(timestamp) {
    var date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  
  function formatDate(timestamp) {
    var date = new Date(timestamp);
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
  
  function getRejectionReasonDisplay(reason) {
    if (reason === 'margin not enough') {
      return { text: 'Insufficient Margin', icon: 'fa-coins' };
    } else if (reason === 'out of range') {
      return { text: 'Price Out of Range', icon: 'fa-chart-line' };
    }
    return { text: reason || 'Unknown', icon: 'fa-exclamation-triangle' };
  }
  
  function renderOrders() {
    var allOrders = activeTab === 'open' ? openOrders : closedOrders;
    var filteredOrders = filterOrders(allOrders);
    ordersContainer.innerHTML = '';
    
    if (filteredOrders.length === 0) {
      var emptyDiv = document.createElement('div');
      emptyDiv.className = 'empty-state';
      if (searchQuery.trim() && allOrders.length > 0) {
        emptyDiv.innerHTML = \`<i class="fas fa-search" style="font-size: 28px; margin-bottom: 8px; opacity: 0.4; display: block;"></i>
                              No results for "\${searchQuery}"\`;
      } else {
        emptyDiv.innerHTML = \`<i class="fas \${activeTab === 'open' ? 'fa-clock' : 'fa-check-circle'}" style="font-size: 28px; margin-bottom: 8px; opacity: 0.4; display: block;"></i>
                              No \${activeTab === 'open' ? 'open' : 'closed'} orders\`;
      }
      ordersContainer.appendChild(emptyDiv);
      return;
    }
    
    var sorted = [...filteredOrders].sort((a,b) => b.timestamp - a.timestamp);
    
    for (var order of sorted) {
      var card = document.createElement('div');
      card.className = 'order-card';
      
      var isBuy = order.type === 'BUY';
      var positionClass = isBuy ? 'buy' : 'sell';
      var positionText = isBuy ? 'LONG' : 'SHORT';
      var positionIcon = isBuy ? '<i class="fas fa-arrow-up"></i>' : '<i class="fas fa-arrow-down"></i>';
      var orderTypeDisplay = order.orderType || 'SLM';
      
      var displayStatus = '', statusClass = '', statusIcon = '', rejectionHtml = '';
      
      if (activeTab === 'closed') {
        if (order.status === 'FILLED') {
          displayStatus = 'COMPLETED';
          statusClass = 'completed';
          statusIcon = '<i class="fas fa-check-circle"></i>';
        } else {
          displayStatus = 'REJECTED';
          statusClass = 'rejected';
          statusIcon = '<i class="fas fa-times-circle"></i>';
          var reason = order.rejectionReason || (order.status === 'CANCELLED' ? 'margin not enough' : 'out of range');
          var reasonDisplay = getRejectionReasonDisplay(reason);
          rejectionHtml = \`<div class="rejection-reason"><i class="fas \${reasonDisplay.icon}"></i><span>\${reasonDisplay.text}</span></div>\`;
        }
      } else {
        displayStatus = 'OPEN';
        statusClass = 'open';
        statusIcon = '';
      }
      
      var timeStr = formatTime(order.timestamp);
      var dateStr = formatDate(order.timestamp);
      
      var cancelButtonHtml = '';
      if (activeTab === 'open' && order.status === 'OPEN') {
        cancelButtonHtml = \`<button class="cancel-btn" data-id="\${order.id}"><i class="fas fa-times"></i> Cancel</button>\`;
      }
      
      card.innerHTML = \`
        <div class="order-header-row">
          <span class="pair">\${order.symbol}</span>
          <span class="position-badge \${positionClass}">\${positionIcon} \${positionText}</span>
        </div>
        <div class="compact-row">
          <span class="compact-label">PRICE</span>
          <span class="price-value">\${formatUSD(order.price)}</span>
        </div>
        <div class="info-inline">
          <div class="info-block">
            <span class="info-label-sm">QTY</span>
            <span class="info-value-sm">\${order.quantity.toFixed(4)}</span>
          </div>
          <div class="info-block">
            <span class="info-label-sm">TYPE</span>
            <span class="order-type-badge-sm"><i class="fas fa-tag"></i> \${orderTypeDisplay}</span>
          </div>
          <div class="info-block">
            <span class="info-label-sm">TIME</span>
            <span class="info-value-sm">\${timeStr}</span>
          </div>
        </div>
        <div class="time-compact">
          <span class="compact-label">DATE</span>
          <span class="time-value-sm">\${dateStr}</span>
        </div>
        \${rejectionHtml}
        <div class="status-row">
          <div class="status-badge \${statusClass}">\${statusIcon} \${displayStatus}</div>
          \${cancelButtonHtml}
        </div>
      \`;
      ordersContainer.appendChild(card);
    }
    
    if (activeTab === 'open') {
      document.querySelectorAll('.cancel-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          cancelOrder(parseInt(btn.getAttribute('data-id')));
        });
      });
    }
  }
  
  function setActiveTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('.tab').forEach(tab => {
      if (tab.getAttribute('data-tab') === tabId) tab.classList.add('active');
      else tab.classList.remove('active');
    });
    renderOrders();
  }
  
  function handleSearch() {
    searchQuery = searchInput.value;
    clearSearchBtn.classList.toggle('visible', searchQuery.trim() !== '');
    renderOrders();
  }
  
  function clearSearch() {
    searchInput.value = '';
    searchQuery = '';
    clearSearchBtn.classList.remove('visible');
    renderOrders();
  }
  
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => setActiveTab(tab.getAttribute('data-tab')));
  });
  
  searchInput.addEventListener('input', handleSearch);
  clearSearchBtn.addEventListener('click', clearSearch);
  
  // Seed demo orders
  function seedDemoOrders() {
    openOrders.push({ id: nextOrderId++, symbol: "BTC/USD", quantity: 0.025, price: 61800.00, type: "BUY", status: "OPEN", orderType: "SLM", timestamp: Date.now() - 3600000 });
    openOrders.push({ id: nextOrderId++, symbol: "ETH/USD", quantity: 0.5, price: 3150.50, type: "SELL", status: "OPEN", orderType: "GTT", timestamp: Date.now() - 1800000 });
    openOrders.push({ id: nextOrderId++, symbol: "SOL/USD", quantity: 2.25, price: 142.80, type: "BUY", status: "OPEN", orderType: "SLM", timestamp: Date.now() - 7200000 });
    openOrders.push({ id: nextOrderId++, symbol: "DOGE/USD", quantity: 1500, price: 0.1245, type: "BUY", status: "OPEN", orderType: "GTT", timestamp: Date.now() - 5400000 });
    openOrders.push({ id: nextOrderId++, symbol: "AVAX/USD", quantity: 8.5, price: 28.75, type: "SELL", status: "OPEN", orderType: "SLM", timestamp: Date.now() - 2700000 });
    openOrders.push({ id: nextOrderId++, symbol: "LINK/USD", quantity: 12.0, price: 13.25, type: "BUY", status: "OPEN", orderType: "GTT", timestamp: Date.now() - 900000 });
    openOrders.push({ id: nextOrderId++, symbol: "ARB/USD", quantity: 45.0, price: 0.85, type: "SELL", status: "OPEN", orderType: "SLM", timestamp: Date.now() - 450000 });
    openOrders.push({ id: nextOrderId++, symbol: "OP/USD", quantity: 30.0, price: 1.92, type: "BUY", status: "OPEN", orderType: "GTT", timestamp: Date.now() - 1200000 });
    
    closedOrders.push({ id: nextOrderId++, symbol: "SOL/USD", quantity: 2.5, price: 142.30, type: "BUY", status: "FILLED", orderType: "SLM", timestamp: Date.now() - 86400000 });
    closedOrders.push({ id: nextOrderId++, symbol: "BTC/USD", quantity: 0.01, price: 60500.00, type: "SELL", status: "REJECTED", orderType: "GTT", rejectionReason: "margin not enough", timestamp: Date.now() - 172800000 });
    closedOrders.push({ id: nextOrderId++, symbol: "ETH/USD", quantity: 0.25, price: 3100.00, type: "BUY", status: "FILLED", orderType: "SLM", timestamp: Date.now() - 129600000 });
    closedOrders.push({ id: nextOrderId++, symbol: "AVAX/USD", quantity: 5.0, price: 29.50, type: "SELL", status: "FILLED", orderType: "GTT", timestamp: Date.now() - 95040000 });
    closedOrders.push({ id: nextOrderId++, symbol: "MATIC/USD", quantity: 100.0, price: 0.52, type: "BUY", status: "REJECTED", orderType: "SLM", rejectionReason: "out of range", timestamp: Date.now() - 216000000 });
    closedOrders.push({ id: nextOrderId++, symbol: "DOT/USD", quantity: 12.0, price: 6.85, type: "SELL", status: "FILLED", orderType: "GTT", timestamp: Date.now() - 302400000 });
    closedOrders.push({ id: nextOrderId++, symbol: "UNI/USD", quantity: 8.0, price: 7.20, type: "BUY", status: "FILLED", orderType: "SLM", timestamp: Date.now() - 388800000 });
    closedOrders.push({ id: nextOrderId++, symbol: "ATOM/USD", quantity: 15.0, price: 4.95, type: "SELL", status: "REJECTED", orderType: "GTT", rejectionReason: "margin not enough", timestamp: Date.now() - 475200000 });
    closedOrders.push({ id: nextOrderId++, symbol: "NEAR/USD", quantity: 22.0, price: 3.45, type: "BUY", status: "FILLED", orderType: "SLM", timestamp: Date.now() - 561600000 });
    closedOrders.push({ id: nextOrderId++, symbol: "APT/USD", quantity: 18.5, price: 5.60, type: "SELL", status: "REJECTED", orderType: "GTT", rejectionReason: "out of range", timestamp: Date.now() - 648000000 });
    
    updateCounters();
  }
  
  seedDemoOrders();
  renderOrders();
  setActiveTab('open');
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
<div class="order-header">
  <div class="brand-status">
    <div class="logo">
      <i class="fas fa-chart-line"></i> MARGIN<span style="color:#B22234;"> APEX</span>
    </div>
  </div>
  <div class="header-sub">
    <i class="fas fa-exchange-alt"></i> Open &amp; Closed Orders
  </div>
</div>

<div class="search-container">
  <div class="search-box">
    <i class="fas fa-search"></i>
    <input type="text" id="searchInput" placeholder="Search symbol...">
    <button id="clearSearchBtn" class="clear-search"><i class="fas fa-times-circle"></i></button>
  </div>
</div>

<div class="order-tabs-wrapper">
  <div class="order-tabs">
    <div class="tab active" data-tab="open">OPEN <span id="open-count" style="margin-left: 4px; background:#F0F4F9; padding:1px 6px; border-radius:30px; font-size:9px;">0</span></div>
    <div class="tab" data-tab="closed">CLOSED <span id="closed-count" style="margin-left: 4px; background:#F0F4F9; padding:1px 6px; border-radius:30px; font-size:9px;">0</span></div>
  </div>
</div>

<div class="orders-container" id="orders-container"></div>

<div id="toast-message" class="toast-msg"><i class="fas fa-circle-info"></i> <span id="toast-text"></span></div>
` }}
      />
      <Footer activeTab="order" />
    </div>
  );
}
