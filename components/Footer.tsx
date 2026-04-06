'use client';
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import './Footer.css';

interface FooterProps {
  activeTab: 'home' | 'watchlist' | 'order' | 'position' | 'history';
  hideDrawer?: boolean;
}

const Footer: React.FC<FooterProps> = ({ activeTab, hideDrawer = false }) => {
  const router = useRouter();

  // Handle Sheet physics
  const [sheetState, setSheetState] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const startY = useRef(0);
  const currentTranslateY = useRef(0);
  const lastY = useRef(0);
  const lastTimestamp = useRef(0);
  const velocity = useRef(0);
  const [vh, setVh] = useState(800);
  const [footerHeight, setFooterHeight] = useState(65);

  // Safely grab innerHeight after mount to avoid hydration mismatch
  useEffect(() => {
    setVh(window.innerHeight);
    if (footerRef.current) {
      setFooterHeight(footerRef.current.getBoundingClientRect().height);
    }
    const handleResize = () => {
      setVh(window.innerHeight);
      if (footerRef.current) {
        setFooterHeight(footerRef.current.getBoundingClientRect().height);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [sheetState]); // ensure layout captures shifts

  // 0: Collapsed (drawer top edge meets footer top edge perfectly, minus 3px to keep red line entirely visible above it)
  // 1: Open (10vh tall)
  const snapPoints = [
    Math.max(vh - footerHeight - 3, 100),
    vh - footerHeight - (vh * 0.1)
  ];

  useEffect(() => {
    if (!panelRef.current) return;
    panelRef.current.style.transition = 'transform 0.5s cubic-bezier(0.2, 0.9, 0.3, 1)';
    panelRef.current.style.transform = `translateY(${snapPoints[sheetState]}px)`;
    currentTranslateY.current = snapPoints[sheetState];
  }, [sheetState, vh]);

  const handleTouchStart = (e: React.TouchEvent | React.MouseEvent) => {
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    startY.current = clientY;
    lastY.current = startY.current;
    lastTimestamp.current = Date.now();

    if (panelRef.current) panelRef.current.style.transition = 'none';
  };

  const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
    if (!startY.current) return; // For mouse events
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const delta = clientY - startY.current;

    const now = Date.now();
    const timeDiff = now - lastTimestamp.current;
    if (timeDiff > 0) {
      velocity.current = (clientY - lastY.current) / timeDiff;
    }
    lastY.current = clientY;
    lastTimestamp.current = now;

    const nextY = currentTranslateY.current + delta;
    const limitY = snapPoints[1];
    const finalY = nextY < limitY ? limitY - Math.pow(limitY - nextY, 0.8) : nextY;

    if (panelRef.current) {
      panelRef.current.style.transform = `translateY(${finalY}px)`;
    }
  };

  const handleTouchEnd = () => {
    startY.current = 0; // reset
    if (!panelRef.current) return;

    const finalY = lastY.current - startY.current + currentTranslateY.current;
    const direction = velocity.current;

    let targetState = sheetState;

    if (direction < -0.3) {
      targetState = Math.min(1, sheetState + 1);
    } else if (direction > 0.3) {
      targetState = Math.max(0, sheetState - 1);
    } else {
      const closest = snapPoints.reduce((prevIdx, currPoint, idx) => {
        return Math.abs(currPoint - finalY) < Math.abs(snapPoints[prevIdx] - finalY) ? idx : prevIdx;
      }, 0);
      targetState = closest;
    }

    setSheetState(targetState);
    panelRef.current.style.transition = 'transform 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.1)';
    panelRef.current.style.transform = `translateY(${snapPoints[targetState]}px)`;
    currentTranslateY.current = snapPoints[targetState];
  };

  const toggleHandle = () => {
    setSheetState(sheetState === 0 ? 1 : 0);
  };

  return (
    <>
      {/* Dim Overlay removed to allow background interaction */}

      {/* Account Drawer - expanded above footer */}
      {!hideDrawer && activeTab !== 'watchlist' && (
        <div className="account-drawer-ark" ref={panelRef}>
          {/* Thin Top Line */}
          <div className="ark-drawer-top-line"></div>

          {/* Drag Handle Notch (protrudes up) */}
          <div
            className="ark-drag-handle-area"
            onClick={toggleHandle}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleTouchStart}
            onMouseMove={(e) => startY.current && handleTouchMove(e)}
            onMouseUp={handleTouchEnd}
            onMouseLeave={() => startY.current && handleTouchEnd()}
          >
            <i className={`fas fa-chevron-up toggle-arrow ${sheetState > 0 ? 'rotated' : ''}`}></i>
          </div>

          <div className="drawer-inner-scroll">
            {/* Base structure for future content */}
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation Bar */}
      <div className="footer-section" ref={footerRef}>
        {/* Navigation Tabs - always visible, always clickable */}
        <div className="footer-nav">
          <Link href="/" className={`footer-tab ${activeTab === 'home' ? 'active' : ''}`}>
            <i className="fas fa-home footer-icon"></i>
            <span className="footer-label">Home</span>
          </Link>
          <Link href="/watchlist" className={`footer-tab ${activeTab === 'watchlist' ? 'active' : ''}`}>
            <i className="fas fa-list footer-icon"></i>
            <span className="footer-label">Watchlist</span>
          </Link>
          <Link href="/order" className={`footer-tab ${activeTab === 'order' ? 'active' : ''}`}>
            <i className="fas fa-file-invoice-dollar footer-icon"></i>
            <span className="footer-label">Order</span>
          </Link>
          <Link href="/position" className={`footer-tab ${activeTab === 'position' ? 'active' : ''}`}>
            <i className="fas fa-chart-line footer-icon"></i>
            <span className="footer-label">Position</span>
          </Link>
          <Link href="/history" className={`footer-tab ${activeTab === 'history' ? 'active' : ''}`}>
            <i className="fas fa-history footer-icon"></i>
            <span className="footer-label">History</span>
          </Link>
        </div>
      </div>
    </>
  );
};

export default Footer;
