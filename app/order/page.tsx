'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Footer from '@/components/Footer';
import { useAuth } from '@/hooks/useAuth';
import { useMyOrders } from '@/hooks/useMyOrders';
import { kiteStatus } from '@/lib/kiteClient';
import KiteConnectButton from '@/components/KiteConnectButton';
import './page.css';

export default function OrderPage() {
  const router = useRouter();
  useAuth();
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [kiteConnected, setKiteConnected] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch internal platform orders
  const { orders, loading: ordersLoading, error, cancelOrder } = useMyOrders(5000);

  useEffect(() => {
    const saved = localStorage.getItem('marginApexTheme');
    if (saved === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');

    // Check Kite connection status for price feed
    kiteStatus().then(s => setKiteConnected(s.connected));
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  const handleCancel = async (id: string) => {
    const res = await cancelOrder(id);
    if (res.success) {
      showToast('Order cancelled successfully.');
    } else {
      showToast(res.error || 'Failed to cancel order.');
    }
  };

  // Status mapping
  const openOrders = orders.filter(o => o.status === 'PENDING');
  const closedOrders = orders.filter(o => o.status !== 'PENDING');

  const fmtPrice = (v: number) =>
    '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
  const fmtQty = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 4 });
  
  const fmtTime = (ts: string | null) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return isNaN(d.getTime())
      ? ts
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  const fmtDate = (ts: string | null) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return isNaN(d.getTime())
      ? ts
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const source = tab === 'open' ? openOrders : closedOrders;
  const filtered = source
    .filter(o =>
      o.symbol.toLowerCase().includes(search.toLowerCase().trim()),
    )
    .sort((a, b) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <div className="ord-root">
      <div className="ord-shell">

        {/* Header */}
        <div className="ord-header">
          <div className="ord-header-left">
            <div className="ord-brand">
              <span>MARGIN<span className="apex-text">APEX</span></span>
            </div>
            <div className="ord-brand-sub">Platform Orders • Internal Execution</div>
          </div>
          {kiteConnected ? (
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, color: '#059669',
              background: 'rgba(5,150,105,0.1)', padding: '3px 10px',
              borderRadius: 20, display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
              PRICE FEED LIVE
            </span>
          ) : (
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, color: '#ef4444',
              background: 'rgba(239,68,68,0.1)', padding: '3px 10px',
              borderRadius: 20, display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
              PRICE FEED OFF
            </span>
          )}
        </div>

        {/* Search */}
        <div className="ord-search-wrap">
          <div className="ord-search-box">
            <i className="fas fa-search ord-search-icon" />
            <input
              type="text"
              className="ord-search-input"
              placeholder="Search symbol..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button className="ord-clear-btn" onClick={() => setSearch('')}>
                <i className="fas fa-times-circle" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="ord-tabs-wrap">
          <div className="ord-tabs">
            <div className={`ord-tab${tab === 'open' ? ' active' : ''}`} onClick={() => setTab('open')}>
              OPEN <span className="ord-tab-badge">{openOrders.length}</span>
            </div>
            <div className={`ord-tab${tab === 'closed' ? ' active' : ''}`} onClick={() => setTab('closed')}>
              CLOSED <span className="ord-tab-badge">{closedOrders.length}</span>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="ord-list">

          {/* Loading */}
          {ordersLoading && (
            <div className="ord-empty">
              <i className="fas fa-circle-notch fa-spin" />
              <p>Loading platform orders…</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="ord-empty">
              <i className="fas fa-exclamation-circle" style={{ color: '#ef4444' }} />
              <p>{error}</p>
            </div>
          )}

          {/* Empty List */}
          {!ordersLoading && filtered.length === 0 && (
            <div className="ord-empty">
              <i className={search ? 'fas fa-search' : tab === 'open' ? 'fas fa-clock' : 'fas fa-check-circle'} />
              <p>{search ? `No results for "${search}"` : `No ${tab} orders found`}</p>
              {!kiteConnected && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 8 }}>
                    Connect Zerodha for live price tracking
                  </p>
                  <KiteConnectButton />
                </div>
              )}
            </div>
          )}

          {/* List of My Orders */}
          {!ordersLoading && filtered.map(order => {
            const isBuy       = order.side === 'BUY';
            const isExecuted  = order.status === 'EXECUTED';
            const isRejected  = order.status === 'REJECTED';
            const isCancelled = order.status === 'CANCELLED';
            const isPending   = order.status === 'PENDING';

            return (
              <div key={order.id} className="ord-card">
                <div className="ord-row ord-row-top">
                  <span className="ord-symbol">{order.symbol}</span>
                  <span className={`ord-badge ${isBuy ? 'long' : 'short'}`}>
                    <i className={`fas fa-arrow-${isBuy ? 'up' : 'down'}`} />
                    {order.side}
                  </span>
                </div>
                <div className="ord-row ord-row-price">
                  <span className="ord-label">FILL PRICE</span>
                  <span className={`ord-price-val ${isBuy ? 'buy-price' : 'sell-price'}`}>
                    {fmtPrice(order.fill_price)}
                  </span>
                </div>
                <div className="ord-row ord-row-info">
                  <div className="ord-info-inline">
                    <span className="ord-label">QTY:</span>
                    <span className="ord-val">{fmtQty(order.qty)} ({order.lots} Lot)</span>
                  </div>
                  <div className="ord-info-inline center">
                    <span className="ord-label">TYPE:</span>
                    <span className="ord-type-pill">
                      <i className="fas fa-tag" /> {order.order_type}
                    </span>
                  </div>
                  <div className="ord-info-inline right">
                    <span className="ord-label">TIME:</span>
                    <span className="ord-val">{fmtTime(order.created_at)}</span>
                  </div>
                </div>
                <div className="ord-row ord-row-date">
                  <span className="ord-label">DATE</span>
                  <span className="ord-date-val">{fmtDate(order.created_at)}</span>
                </div>
                {/* Product + variety tags */}
                <div className="ord-row" style={{ gap: 6, marginTop: 4 }}>
                  <span className="ord-type-pill" style={{ fontSize: '0.6rem' }}>{order.product_type}</span>
                  <span className="ord-type-pill" style={{ fontSize: '0.6rem' }}>{order.segment}</span>
                  {order.info && (
                    <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                      {order.info}
                    </span>
                  )}
                </div>
                <div className="ord-row ord-row-status">
                  <div className={`ord-status-text ${isPending ? 'status-open' : isExecuted ? 'status-filled' : 'status-rejected'}`}>
                    {isPending   && <><i className="fas fa-circle" /> PENDING</>}
                    {isExecuted  && <><i className="fas fa-check-circle" /> EXECUTED</>}
                    {isCancelled && <><i className="fas fa-ban" /> CANCELLED</>}
                    {isRejected  && <><i className="fas fa-times-circle" /> REJECTED</>}
                  </div>
                  {isPending && (
                    <button
                      className="ord-cancel-btn"
                      onClick={() => handleCancel(order.id)}
                    >
                      <i className="fas fa-times" /> Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Footer activeTab="order" />
      </div>

      <div className={`ord-toast${toast ? ' show' : ''}`}>
        <i className="fas fa-circle-info" />
        <span>{toast}</span>
      </div>
    </div>
  );
}
