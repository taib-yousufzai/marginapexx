'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import TickFlash from '@/components/TickFlash';
import { useMarketQuotes } from '@/hooks/useMarketQuotes';
import { useComexQuotes } from '@/hooks/useComexQuotes';
import './Footer.css';

const mapSegmentToDbSegment = (s: string): string => {
  if (!s) return '';
  const trimmed = s.trim();
  if (trimmed === 'NSE - Futures' || trimmed === 'BSE - Futures') return 'INDEX-FUT';
  if (trimmed === 'NSE - Options' || trimmed === 'BSE - Options') return 'INDEX-OPT';
  if (trimmed === 'NSE - Stock Futures' || trimmed === 'BSE - Stock Futures') return 'STOCK-FUT';
  if (trimmed === 'NSE - Stock Options' || trimmed === 'BSE - Stock Options') return 'STOCK-OPT';
  if (trimmed === 'MCX - Futures') return 'MCX-FUT';
  if (trimmed === 'MCX - Options') return 'MCX-OPT';
  if (trimmed === 'NSE - Equity' || trimmed === 'BSE - Equity') return 'NSE-EQ';
  if (trimmed === 'Crypto' || trimmed === 'CRYPTO') return 'CRYPTO';
  if (trimmed === 'Forex' || trimmed === 'FOREX' || trimmed === 'CDS - Futures' || trimmed === 'CDS - Options') return 'FOREX';
  if (trimmed === 'COMEX - Futures' || trimmed === 'COMEX - Options' || trimmed === 'COMEX' || trimmed === 'COI') return 'COMEX';
  return trimmed;
};

interface FooterProps {
  activeTab: 'home' | 'watchlist' | 'order' | 'position' | 'history' | 'profile';
  hideDrawer?: boolean;
}

const Footer: React.FC<FooterProps> = ({ activeTab, hideDrawer = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const handleAreaRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const lastY = useRef(0);
  const velocity = useRef(0);
  const lastTimestamp = useRef(0);
  const [vh, setVh] = useState(800);

  useEffect(() => {
    setVh(window.innerHeight);
    const handleResize = () => setVh(window.innerHeight);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [balance, setBalance] = useState(0);
  const [rawPositions, setRawPositions] = useState<any[]>([]);
  const [segmentSettings, setSegmentSettings] = useState<any[]>([]);

  const fetchSummary = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const token = session.access_token;

      // Fetch balance
      const balRes = await fetch('/api/pay/balance', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (balRes.ok) {
        const { balance } = await balRes.json();
        setBalance(balance);
      }

      // Fetch segment settings
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('trading_mode')
          .eq('id', session.user.id)
          .single();
        const mode = profile?.trading_mode || 'normal';
        const segRes = await fetch(`/api/user/segments?mode=${mode}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (segRes.ok) {
          const sData = await segRes.json();
          setSegmentSettings(sData || []);
        }
      } catch (err) {
        console.error('Failed to fetch segment settings in Footer', err);
      }

      // Fetch positions
      const posRes = await fetch('/api/positions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (posRes.ok) {
        const { positions } = await posRes.json();
        setRawPositions(positions || []);
      }
    } catch (err) {
      if (err instanceof TypeError) return;
      console.warn('Footer fetchSummary failed', err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (cancelled) return;
      await fetchSummary();
      if (!cancelled) {
        timerId = setTimeout(poll, 3000);
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, []);

  // Group instrument keys by segment for active positions
  const { kiteKeys, binanceKeys, comexKeys } = useMemo(() => {
    const kite: string[] = [];
    const binance: string[] = [];
    const comex: string[] = [];

    rawPositions.filter(p => p.status === 'open' || p.status === 'active').forEach(p => {
      const seg = (p.settlement || '').toUpperCase();
      if (seg.includes('CRYPTO')) {
        binance.push(p.symbol.replace('/', ''));
      } else if (seg.includes('COMEX') || p.symbol.endsWith('=F')) {
        comex.push(p.symbol);
      } else {
        kite.push(p.symbol);
      }
    });

    return { kiteKeys: kite, binanceKeys: binance, comexKeys: comex };
  }, [rawPositions]);

  // Combine Kite and Binance symbols for the unified hook
  const marketSymbols = useMemo(() => [...kiteKeys, ...binanceKeys], [kiteKeys, binanceKeys]);
  const { quotes: marketQuotes } = useMarketQuotes(marketSymbols);
  const { quotes: comexQuotes } = useComexQuotes(comexKeys, 1000);

  // Live P&L, Used Margin (frozen) and Equity calculations — update on every tick
  const { floatingPnl, usedMargin, positionValue, liquidationLevel } = useMemo(() => {
    let totalUnrealised = 0;
    let totalLockedMargin = 0;
    let totalPositionValue = 0;

    // Pre-build settings map to avoid O(n²) finds per tick
    const settingsMap = new Map<string, any>();
    for (const s of segmentSettings) {
      settingsMap.set(`${s.segment}|${s.side}`, s);
    }

    const DEFAULT_EXIT_BUFFER = 0.0017;

    rawPositions.forEach(p => {
      if (p.status === 'open' || p.status === 'active') {
        const seg = (p.settlement || '').toUpperCase();
        let ltp = p.ltp || p.entry_price;
        
        if (seg.includes('CRYPTO')) {
          const binanceKey = p.symbol.replace('/', '');
          ltp = marketQuotes[binanceKey]?.lastPrice ?? ltp;
        } else if (seg.includes('COMEX') || p.symbol.endsWith('=F')) {
          ltp = comexQuotes[p.symbol]?.lastPrice ?? ltp;
        } else {
          ltp = marketQuotes[p.symbol]?.lastPrice ?? ltp;
        }

        const dbSeg = mapSegmentToDbSegment(p.settlement || '');
        const sideSetting = settingsMap.get(`${dbSeg}|${p.side}`);
        const exitBuffer = sideSetting ? Number(sideSetting.exit_buffer ?? DEFAULT_EXIT_BUFFER) : DEFAULT_EXIT_BUFFER;

        // Apply exit buffer to match the backend's liquidation PnL formula
        // (orderMatching.ts computes PnL using exit-adjusted LTP, not raw LTP)
        let unrealised = 0;
        if (p.qty_open !== 0) {
          if (p.side === 'BUY') {
            // BUY exits at bid: ltp × (1 - exitBuffer)
            unrealised = ((ltp * (1 - exitBuffer)) - p.entry_price) * p.qty_open;
          } else {
            // SELL exits at ask: ltp × (1 + exitBuffer)
            unrealised = (p.entry_price - (ltp * (1 + exitBuffer))) * p.qty_open;
          }
        }
        totalUnrealised += unrealised;

        // Used Margin: read frozen locked_margin from DB (set at trade entry, never recalculated)
        // Fallback to margin_required if locked_margin not yet backfilled
        const posMargin = Number(p.locked_margin || p.margin_required || 0);
        totalLockedMargin += posMargin;

        totalPositionValue += Math.abs(p.qty_open) * ltp;
      }
    });

    // Liquidation threshold = -(balance × auto_sqoff%)
    // auto_sqoff defaults to 90 if not available; balance is already post-brokerage
    const liqLevel = -(balance * 0.9);

    return {
      floatingPnl: totalUnrealised,
      usedMargin: totalLockedMargin,
      positionValue: totalPositionValue,
      liquidationLevel: liqLevel,
    };
  }, [rawPositions, marketQuotes, comexQuotes, balance, segmentSettings]);


  // Equity = Balance + Floating P/L (reflects the true account value)
  const equity = balance + floatingPnl;
  // Free Margin = Balance - Used Margin (locked margins, no floating PnL)
  const freeMargin = balance - usedMargin;
  const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const [openHeight, setOpenHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contentRef.current) return;
    // Use ResizeObserver to get accurate height
    const ro = new ResizeObserver(() => {
      if (contentRef.current) {
        setOpenHeight(contentRef.current.offsetHeight + 4);
      }
    });
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, []);

  // Apply height whenever isOpen or vh changes
  useEffect(() => {
    if (!panelRef.current) return;
    panelRef.current.style.transition = 'height 0.4s cubic-bezier(0.2, 0.9, 0.3, 1)';
    panelRef.current.style.height = isOpen ? `${openHeight}px` : '0px';
    panelRef.current.style.background = isOpen ? 'var(--drawer-bg, #FFFFFF)' : 'transparent';
    // Hide inner content when closed so overflow:visible doesn't leak it
    if (contentRef.current) {
      contentRef.current.style.visibility = isOpen ? 'visible' : 'hidden';
    }
  }, [isOpen, vh]);

  // Reset drawer when switching pages
  useEffect(() => {
    setIsOpen(false);
  }, [activeTab]);

  // Drag to open/close
  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startY.current = clientY;
    lastY.current = clientY;
    lastTimestamp.current = Date.now();
    if (panelRef.current) panelRef.current.style.transition = 'none';
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!startY.current) return;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const now = Date.now();
    velocity.current = (lastY.current - clientY) / (now - lastTimestamp.current + 1);
    lastY.current = clientY;
    lastTimestamp.current = now;
    const delta = clientY - startY.current;
    const base = isOpen ? openHeight : 0;
    const nextH = base - delta;
    const finalH = Math.max(0, Math.min(openHeight * 1.1, nextH));
    if (panelRef.current) panelRef.current.style.height = `${finalH}px`;
  };

  const handleTouchEnd = () => {
    startY.current = 0;
    if (!panelRef.current) return;
    // Use velocity to decide open or close
    if (velocity.current > 0.3) {
      setIsOpen(true);
    } else if (velocity.current < -0.3) {
      setIsOpen(false);
    } else {
      const currentH = parseFloat(panelRef.current.style.height) || 0;
      setIsOpen(currentH > openHeight / 2);
    }
  };

  const showDrawer = !hideDrawer;

  return (
    <>
      {showDrawer && (
        <div className="account-drawer-ark" ref={panelRef}>
          {/* Red line moves WITH the drawer - sits at drawer's top edge */}
          <div className="ark-drawer-top-line"></div>
          {/* Arrow handle protrudes above via overflow:visible */}
          <div
            className="ark-drag-handle-area"
            ref={handleAreaRef}
            onClick={() => setIsOpen(prev => !prev)}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseMove={(e) => startY.current ? handleTouchMove(e) : undefined}
            onMouseUp={handleTouchEnd}
            onMouseLeave={() => startY.current ? handleTouchEnd() : undefined}
          >
            <i className={`fas fa-chevron-up toggle-arrow${isOpen ? ' rotated' : ''}`}></i>
          </div>
          <div className="drawer-inner-scroll" ref={contentRef}>
            <div className="drawer-account-summary">
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="summary-label">Balance</span>
                  <span className="summary-value">₹<TickFlash value={balance}>{fmt(balance)}</TickFlash></span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Free Margin</span>
                  <span className={`summary-value ${freeMargin >= 0 ? '' : 'negative'}`}>
                    ₹<TickFlash value={freeMargin}>{fmt(freeMargin)}</TickFlash>
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Floating P/L</span>
                  <span className={`summary-value ${floatingPnl >= 0 ? 'positive' : 'negative'}`}>
                    ₹<TickFlash value={floatingPnl}>{floatingPnl >= 0 ? '+' : ''}{fmt(floatingPnl)}</TickFlash>
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Equity</span>
                  <span className="summary-value highlight">
                    ₹<TickFlash value={equity}>{fmt(equity)}</TickFlash>
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Used Margin</span>
                  <span className="summary-value">
                    ₹<TickFlash value={usedMargin}>{fmt(usedMargin)}</TickFlash>
                  </span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Liquidation</span>
                  <span className={`summary-value negative`}>
                    ₹<TickFlash value={liquidationLevel}>{fmt(liquidationLevel)}</TickFlash>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="footer-section">
        <div className="footer-nav" data-active={activeTab}>
          <Link href="/" prefetch={true} className={`footer-tab ${activeTab === 'home' ? 'active' : ''}`}>
            <i className="fas fa-home footer-icon"></i>
            <span className="footer-label">Home</span>
          </Link>
          <Link href="/watchlist" prefetch={true} className={`footer-tab ${activeTab === 'watchlist' ? 'active' : ''}`}>
            <i className="fas fa-list footer-icon"></i>
            <span className="footer-label">Watchlist</span>
          </Link>
          <Link href="/order" prefetch={true} className={`footer-tab ${activeTab === 'order' ? 'active' : ''}`}>
            <i className="fas fa-file-invoice-dollar footer-icon"></i>
            <span className="footer-label">Order</span>
          </Link>
          <Link href="/position" prefetch={true} className={`footer-tab ${activeTab === 'position' ? 'active' : ''}`}>
            <i className="fas fa-chart-line footer-icon"></i>
            <span className="footer-label">Position</span>
          </Link>
          <Link href="/history" prefetch={true} className={`footer-tab ${activeTab === 'history' ? 'active' : ''}`}>
            <i className="fas fa-history footer-icon"></i>
            <span className="footer-label">History</span>
          </Link>
        </div>
      </div>
    </>
  );
};

export default Footer;
