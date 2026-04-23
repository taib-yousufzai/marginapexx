'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Footer from '@/components/Footer';
import { getSession } from '@/lib/auth';
import { useKiteOrders, KiteOrder } from '@/hooks/useKiteOrders';
import KiteConnectButton from '@/components/KiteConnectButton';
import './page.css';

// Kite statuses that count as "open / pending"
const OPEN_STATUSES = new Set([
  'OPEN',
  'OPEN PENDING',
  'PUT ORDER REQ RECEIVED',
  'VALIDATION PENDING',
  'MODIFY VALIDATION PENDING',
  'MODIFY PENDING',
  'TRIGGER PENDING',
  'CANCEL PENDING',
  'AMO REQ RECEIVED',
  'MODIFIED',
]);

function isOpenOrder(o: KiteOrder) {
  return OPEN_STATUSES.has(o.status);
}

export default function OrderPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { orders, connected: kiteConnected, loading: kiteLoading } = useKiteOrders(5000);

  useEffect(() => {
    let cancelled = false;
    getSession().then((session) => {
      if (cancelled) return;
      if (!session) router.replace('/login');
      else setIsChecking(false);
    });
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    const saved = localStorage.getItem('marginApexTheme');
    if (saved === 'dark') document.body.classList.add('dark');
    else document.body.classList.remove('dark');
  }, []);

  if (isChecking) return null;

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };

  const openOrders  = orders.filter(isOpenOrder);
  const closedOrders = orders.filter(o => !isOpenOrder(o));

  const fmtPrice = (v: number) =>
    '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
  const fmtQty = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 4 });
  const fmtTime = (ts: string | null) => {
    if (!ts) return '—';
    // Kite timestamps: "2021-05-31 09:18:57"
    const d = new Date(ts.replace(' ', 'T'));
    return isNaN(d.getTime())
      ? ts
      : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };
  const fmtDate = (ts: string | null) => {
    if (!ts) return '—';
    const d = new Date(ts.replace(' ', 'T'));
    return isNaN(d.getTime())
      ? ts
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const source = tab === 'open' ? openOrders : closedOrders;
  const filtered = source
    .filter(o =>
      `${o.exchange}:${o.tradingsymbol}`.toLowerCase().includes(search.toLowerCase().trim()),
    )
    .sort((a, b) => {
      const ta = a.order_timestamp ?? '';
      const tb = b.order_timestamp ?? '';
      return tb.localeCompare(ta);
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
            <div className="ord-brand-sub">Order Management • Real-time Status</div>
          </div>
          {kiteConnected && (
            <span style={{
              fontSize: '0.65rem', fontWeight: 700, color: '#059669',
              background: 'rgba(5,150,105,0.1)', padding: '3px 10px',
              borderRadius: 20, display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#059669', display: 'inline-block' }} />
              LIVE
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
          {kiteLoading && (
            <div className="ord-empty">
              <i className="fas fa-circle-notch fa-spin" />
              <p>Loading orders…</p>
            </div>
          )}

          {/* Not connected */}
          {!kiteLoading && !kiteConnected && (
            <div className="ord-empty" style={{ gap: 16 }}>
              <i className="fas fa-plug" style={{ fontSize: '2rem' }} />
              <p style={{ fontWeight: 700 }}>No live data</p>
              <p style={{ fontSize: '0.75rem', maxWidth: 240, textAlign: 'center', opacity: 0.7 }}>
                Connect your Zerodha account to see today&apos;s orders.
              </p>
              <KiteConnectButton />
            </div>
          )}

          {/* Live orders */}
          {!kiteLoading && kiteConnected && (
            filtered.length === 0 ? (
              <div className="ord-empty">
                <i className={search ? 'fas fa-search' : tab === 'open' ? 'fas fa-clock' : 'fas fa-check-circle'} />
                <p>{search ? `No results for "${search}"` : `No ${tab} orders`}</p>
              </div>
            ) : filtered.map(order => {
              const isBuy      = order.transaction_type === 'BUY';
              const isOpen     = isOpenOrder(order);
              const isFilled   = order.status === 'COMPLETE';
              const isRejected = order.status === 'REJECTED';
              const isCancelled = order.status === 'CANCELLED';
              const symbol     = `${order.exchange}:${order.tradingsymbol}`;
              const displayPrice = order.average_price > 0 ? order.average_price : order.price;

              return (
                <div key={order.order_id} className="ord-card">
                  <div className="ord-row ord-row-top">
                    <span className="ord-symbol">{symbol}</span>
                    <span className={`ord-badge ${isBuy ? 'long' : 'short'}`}>
                      <i className={`fas fa-arrow-${isBuy ? 'up' : 'down'}`} />
                      {isBuy ? 'BUY' : 'SELL'}
                    </span>
                  </div>
                  <div className="ord-row ord-row-price">
                    <span className="ord-label">PRICE</span>
                    <span className={`ord-price-val ${isBuy ? 'buy-price' : 'sell-price'}`}>
                      {fmtPrice(displayPrice)}
                    </span>
                  </div>
                  <div className="ord-row ord-row-info">
                    <div className="ord-info-inline">
                      <span className="ord-label">QTY:</span>
                      <span className="ord-val">{fmtQty(order.quantity)}</span>
                    </div>
                    <div className="ord-info-inline center">
                      <span className="ord-label">TYPE:</span>
                      <span className="ord-type-pill">
                        <i className="fas fa-tag" /> {order.order_type}
                      </span>
                    </div>
                    <div className="ord-info-inline right">
                      <span className="ord-label">TIME:</span>
                      <span className="ord-val">{fmtTime(order.order_timestamp)}</span>
                    </div>
                  </div>
                  <div className="ord-row ord-row-date">
                    <span className="ord-label">DATE</span>
                    <span className="ord-date-val">{fmtDate(order.order_timestamp)}</span>
                  </div>
                  {/* Rejection reason */}
                  {isRejected && order.status_message && (
                    <div className="ord-rejection">
                      <i className="fas fa-exclamation-triangle" />
                      <span>{order.status_message}</span>
                    </div>
                  )}
                  {/* Product + variety tags */}
                  <div className="ord-row" style={{ gap: 6, marginTop: 2 }}>
                    <span className="ord-type-pill" style={{ fontSize: '0.6rem' }}>{order.product}</span>
                    <span className="ord-type-pill" style={{ fontSize: '0.6rem' }}>{order.variety}</span>
                    {order.filled_quantity > 0 && (
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>
                        Filled: {fmtQty(order.filled_quantity)}/{fmtQty(order.quantity)}
                      </span>
                    )}
                  </div>
                  <div className="ord-row ord-row-status">
                    <div className={`ord-status-text ${isOpen ? 'status-open' : isFilled ? 'status-filled' : 'status-rejected'}`}>
                      {isOpen      && <><i className="fas fa-circle" /> {order.status}</>}
                      {isFilled    && <><i className="fas fa-check-circle" /> COMPLETED</>}
                      {isCancelled && <><i className="fas fa-ban" /> CANCELLED</>}
                      {isRejected  && <><i className="fas fa-times-circle" /> REJECTED</>}
                    </div>
                    {isOpen && (
                      <button
                        className="ord-cancel-btn"
                        onClick={() => showToast(`To cancel order ${order.order_id}, use Zerodha Kite.`)}
                      >
                        <i className="fas fa-times" /> Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
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
