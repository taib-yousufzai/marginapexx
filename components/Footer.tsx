'use client';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import TickFlash from '@/components/TickFlash';
import { useKiteQuotes } from '@/hooks/useKiteQuotes';
import { useBinanceQuotes } from '@/hooks/useBinanceQuotes';
import { useComexQuotes } from '@/hooks/useComexQuotes';
import './Footer.css';

interface FooterProps {
  activeTab: 'home' | 'watchlist' | 'order' | 'position' | 'history' | 'profile';
  hideDrawer?: boolean;
}

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

      // Fetch positions
      const posRes = await fetch('/api/positions', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (posRes.ok) {
        const { positions } = await posRes.json();
        setRawPositions(positions || []);
      }

      // Fetch profile and segment settings
      const profRes = await fetch('/api/user/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (profRes.ok) {
        const profile = await profRes.json();
        const mode = profile?.trading_mode || 'normal';
        const resSettings = await fetch(`/api/user/segments?mode=${mode}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (resSettings.ok) {
          const settingsData = await resSettings.json();
          setSegmentSettings(settingsData || []);
        }
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

  // Use the respective quote hooks (polling every 1000ms)
  const { quotes: kiteQuotes } = useKiteQuotes(kiteKeys, 1000);
  const { quotes: binanceQuotes } = useBinanceQuotes(binanceKeys, 1000);
  const { quotes: comexQuotes } = useComexQuotes(comexKeys, 1000);

  // Live P&L, Used Margin and Equity (Position Value) calculations
  const { floatingPnl, usedMargin, positionValue } = useMemo(() => {
    let totalUnrealised = 0;
    let totalUsedMargin = 0;
    let totalPositionValue = 0;

    rawPositions.forEach(p => {
      if (p.status === 'open' || p.status === 'active') {
        const seg = (p.settlement || '').toUpperCase();
        let ltp = p.ltp || p.entry_price;
        
        if (seg.includes('CRYPTO')) {
          const binanceKey = p.symbol.replace('/', '');
          ltp = binanceQuotes[binanceKey]?.lastPrice ?? ltp;
        } else if (seg.includes('COMEX') || p.symbol.endsWith('=F')) {
          ltp = comexQuotes[p.symbol]?.lastPrice ?? ltp;
        } else {
          ltp = kiteQuotes[p.symbol]?.lastPrice ?? ltp;
        }

        const dbSeg = mapSegmentToDbSegment(p.settlement || '');
        const matchingSetting = segmentSettings.find(s => s.segment === dbSeg && s.side === 'BUY');
        const entryBuffer = matchingSetting ? matchingSetting.entry_buffer : 0.003;

        let unrealised = 0;
        if (p.qty_open !== 0) {
          if (p.side === 'BUY') {
            const currentAsk = (ltp * 1.001) + (ltp * entryBuffer);
            unrealised = (currentAsk - p.entry_price) * p.qty_open;
          } else {
            const currentBid = ltp * 0.999;
            unrealised = (p.entry_price - currentBid) * p.qty_open;
          }
        }
        totalUnrealised += unrealised;
        totalUsedMargin += Number(p.margin_required || p.margin_used || 0);
        totalPositionValue += p.qty_open * ltp;
      }
    });

    return {
      floatingPnl: totalUnrealised,
      usedMargin: totalUsedMargin,
      positionValue: totalPositionValue
    };
  }, [rawPositions, kiteQuotes, binanceQuotes, comexQuotes, segmentSettings]);

  const equity = positionValue;
  const freeMargin = (balance + floatingPnl) - usedMargin;
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
  useEffect(() => {
    if (!isOpen) return;
    const onOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        handleAreaRef.current?.contains(target)
      ) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
    };
  }, [isOpen]);

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
                  <span className="summary-value">₹{fmt(balance)}</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Free Margin</span>
                  <span className="summary-value">₹{fmt(freeMargin)}</span>
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
                  <span className="summary-label">Margin Limit</span>
                  <span className="summary-value">
                    ₹<TickFlash value={balance}>{fmt(balance)}</TickFlash>
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
