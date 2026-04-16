'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Footer from '@/components/Footer';
import { getSession } from '@/lib/auth';
import './page.css';

type Order = {
  id: number;
  symbol: string;
  type: 'BUY' | 'SELL';
  status: 'OPEN' | 'FILLED' | 'REJECTED';
  orderType: string;
  price: number;
  quantity: number;
  timestamp: number;
  rejectionReason?: string;
};

const SEED_OPEN: Order[] = [
  { id:1001, symbol:'BTC/USD',  type:'BUY',  status:'OPEN', orderType:'SLM', price:61800.00, quantity:0.025, timestamp:Date.now()-3600000  },
  { id:1002, symbol:'ETH/USD',  type:'SELL', status:'OPEN', orderType:'GTT', price:3150.50,  quantity:0.5,   timestamp:Date.now()-1800000  },
  { id:1003, symbol:'SOL/USD',  type:'BUY',  status:'OPEN', orderType:'SLM', price:142.80,   quantity:2.25,  timestamp:Date.now()-7200000  },
  { id:1004, symbol:'DOGE/USD', type:'BUY',  status:'OPEN', orderType:'GTT', price:0.1245,   quantity:1500,  timestamp:Date.now()-5400000  },
  { id:1005, symbol:'AVAX/USD', type:'SELL', status:'OPEN', orderType:'SLM', price:28.75,    quantity:8.5,   timestamp:Date.now()-2700000  },
  { id:1006, symbol:'LINK/USD', type:'BUY',  status:'OPEN', orderType:'GTT', price:13.25,    quantity:12.0,  timestamp:Date.now()-900000   },
  { id:1007, symbol:'ARB/USD',  type:'SELL', status:'OPEN', orderType:'SLM', price:0.85,     quantity:45.0,  timestamp:Date.now()-450000   },
  { id:1008, symbol:'OP/USD',   type:'BUY',  status:'OPEN', orderType:'GTT', price:1.92,     quantity:30.0,  timestamp:Date.now()-1200000  },
];

const SEED_CLOSED: Order[] = [
  { id:1009, symbol:'SOL/USD',   type:'BUY',  status:'FILLED',   orderType:'SLM', price:142.30,   quantity:2.5,  timestamp:Date.now()-86400000  },
  { id:1010, symbol:'BTC/USD',   type:'SELL', status:'REJECTED', orderType:'GTT', price:60500.00, quantity:0.01, timestamp:Date.now()-172800000, rejectionReason:'Insufficient Margin' },
  { id:1011, symbol:'ETH/USD',   type:'BUY',  status:'FILLED',   orderType:'SLM', price:3100.00,  quantity:0.25, timestamp:Date.now()-129600000 },
  { id:1012, symbol:'AVAX/USD',  type:'SELL', status:'FILLED',   orderType:'GTT', price:29.50,    quantity:5.0,  timestamp:Date.now()-95040000  },
  { id:1013, symbol:'MATIC/USD', type:'BUY',  status:'REJECTED', orderType:'SLM', price:0.52,     quantity:100,  timestamp:Date.now()-216000000, rejectionReason:'Price Out of Range' },
  { id:1014, symbol:'DOT/USD',   type:'SELL', status:'FILLED',   orderType:'GTT', price:6.85,     quantity:12.0, timestamp:Date.now()-302400000 },
];

export default function OrderPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [tab,          setTab]          = useState<'open'|'closed'>('open');
  const [search,       setSearch]       = useState('');
  const [openOrders,   setOpenOrders]   = useState<Order[]>(SEED_OPEN);
  const [closedOrders, setClosedOrders] = useState<Order[]>(SEED_CLOSED);
  const [toast,        setToast]        = useState<string|null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    if (!getSession()) {
      router.replace('/login');
    } else {
      setIsChecking(false);
    }
  }, [router]);

  useEffect(() => {
    setIsMounted(true);
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

  const cancelOrder = (id: number) => {
    const order = openOrders.find(o => o.id === id);
    if (!order) return;
    const reasons = ['Insufficient Margin','Price Out of Range'];
    const reason  = reasons[Math.floor(Math.random()*reasons.length)];
    setClosedOrders(prev => [{ ...order, status:'REJECTED', rejectionReason:reason },...prev]);
    setOpenOrders(prev => prev.filter(o => o.id !== id));
    showToast(`${order.symbol} cancelled`);
  };

  const fmtPrice = (v:number) => '$'+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:5});
  const fmtQty   = (v:number) => v.toLocaleString('en-US',{maximumFractionDigits:4});
  const fmtTime  = (ts:number) => {
    if (!isMounted) return '';
    return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:true});
  };
  const fmtDate  = (ts:number) => {
    if (!isMounted) return '';
    return new Date(ts).toLocaleDateString([],{month:'short',day:'numeric'});
  };

  const source   = tab==='open' ? openOrders : closedOrders;
  const filtered = source
    .filter(o => o.symbol.toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a,b) => b.timestamp - a.timestamp);

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
            <div className={`ord-tab${tab==='open'?' active':''}`} onClick={()=>setTab('open')}>
              OPEN <span className="ord-tab-badge">{openOrders.length}</span>
            </div>
            <div className={`ord-tab${tab==='closed'?' active':''}`} onClick={()=>setTab('closed')}>
              CLOSED <span className="ord-tab-badge">{closedOrders.length}</span>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="ord-list">
          {filtered.length===0 ? (
            <div className="ord-empty">
              <i className={search?'fas fa-search':tab==='open'?'fas fa-clock':'fas fa-check-circle'} />
              <p>{search?`No results for "${search}"`:`No ${tab} orders`}</p>
            </div>
          ) : filtered.map(order => {
            const isBuy      = order.type==='BUY';
            const isOpen     = tab==='open';
            const isFilled   = order.status==='FILLED';
            const isRejected = order.status==='REJECTED';
            return (
              <div key={order.id} className="ord-card">
                <div className="ord-row ord-row-top">
                  <span className="ord-symbol">{order.symbol}</span>
                  <span className={`ord-badge ${isBuy?'long':'short'}`}>
                    <i className={`fas fa-arrow-${isBuy?'up':'down'}`} />
                    {isBuy?'LONG':'SHORT'}
                  </span>
                </div>
                <div className="ord-row ord-row-price">
                  <span className="ord-label">PRICE</span>
                  <span className={`ord-price-val ${isBuy?'buy-price':'sell-price'}`}>{fmtPrice(order.price)}</span>
                </div>
                <div className="ord-row ord-row-info">
                  <div className="ord-info-inline">
                    <span className="ord-label">QTY:</span>
                    <span className="ord-val">{fmtQty(order.quantity)}</span>
                  </div>
                  <div className="ord-info-inline center">
                    <span className="ord-label">TYPE:</span>
                    <span className="ord-type-pill"><i className="fas fa-tag" /> {order.orderType}</span>
                  </div>
                  <div className="ord-info-inline right">
                    <span className="ord-label">TIME:</span>
                    <span className="ord-val">{fmtTime(order.timestamp)}</span>
                  </div>
                </div>
                <div className="ord-row ord-row-date">
                  <span className="ord-label">DATE</span>
                  <span className="ord-date-val">{fmtDate(order.timestamp)}</span>
                </div>
                {!isOpen && isRejected && order.rejectionReason && (
                  <div className="ord-rejection">
                    <i className="fas fa-exclamation-triangle" />
                    <span>{order.rejectionReason}</span>
                  </div>
                )}
                <div className="ord-row ord-row-status">
                  <div className={`ord-status-text ${isOpen?'status-open':isFilled?'status-filled':'status-rejected'}`}>
                    {isOpen && <><i className="fas fa-circle" /> OPEN</>}
                    {!isOpen && isFilled   && <><i className="fas fa-check-circle" /> COMPLETED</>}
                    {!isOpen && isRejected && <><i className="fas fa-times-circle" /> REJECTED</>}
                  </div>
                  {isOpen && (
                    <button className="ord-cancel-btn" onClick={()=>cancelOrder(order.id)}>
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

      <div className={`ord-toast${toast?' show':''}`}>
        <i className="fas fa-circle-info" />
        <span>{toast}</span>
      </div>
    </div>
  );
}
