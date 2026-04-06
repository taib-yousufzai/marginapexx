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
  const [step, setStep] = useState(0);
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
  }, [step]); // ensure layout captures shifts

  // 0: Collapsed - 0px height 
  // 1: Open - 10vh tall
  // 2: Open 2 - 15vh tall
  const snapPoints = [
    0,
    vh * 0.1,
    vh * 0.15
  ];

  const currentHeight = useRef(snapPoints[0]);

  const isInitialRender = useRef(true);

  useEffect(() => {
    if (!panelRef.current) return;

    panelRef.current.style.bottom = `${footerHeight}px`;

    if (isInitialRender.current) {
      panelRef.current.style.transition = 'none';
      setTimeout(() => {
        if (panelRef.current) {
          panelRef.current.style.transition = 'height 0.5s cubic-bezier(0.2, 0.9, 0.3, 1)';
        }
      }, 50);
      isInitialRender.current = false;
    } else {
      panelRef.current.style.transition = 'height 0.5s cubic-bezier(0.2, 0.9, 0.3, 1)';
    }

    panelRef.current.style.height = `${snapPoints[step]}px`;
    currentHeight.current = snapPoints[step];
  }, [step, vh, footerHeight]);

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

    // delta is positive when swiping DOWN, pushing Drawer CLOSER to 0 height
    // delta is negative when swiping UP, pushing Drawer to HIGHER height
    const nextH = currentHeight.current - delta;
    const limitH = snapPoints[2];

    // add small elasticity to max pull
    const finalH = nextH > limitH ? limitH + Math.pow(nextH - limitH, 0.8) : Math.max(0, nextH);

    if (panelRef.current) {
      panelRef.current.style.height = `${finalH}px`;
    }
  };

  const handleTouchEnd = () => {
    startY.current = 0; // reset
    if (!panelRef.current) return;

    const delta = lastY.current - startY.current;
    const finalH = currentHeight.current - delta;
    const direction = velocity.current;

    let targetState = step;

    if (direction < -0.3) {
      targetState = Math.min(2, step + 1);
    } else if (direction > 0.3) {
      targetState = Math.max(0, step - 1);
    } else {
      const closest = snapPoints.reduce((prevIdx, currPoint, idx) => {
        return Math.abs(currPoint - finalH) < Math.abs(snapPoints[prevIdx] - finalH) ? idx : prevIdx;
      }, 0);
      targetState = closest;
    }

    setStep(targetState);
    panelRef.current.style.transition = 'height 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.1)';
    panelRef.current.style.height = `${snapPoints[targetState]}px`;
    currentHeight.current = snapPoints[targetState];
  };

  const toggleHandle = () => {
    if (step === 0) {
      setStep(1);
    } else if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      setStep(0);
    }
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
            <i className={`fas fa-chevron-up toggle-arrow ${step === 2 ? 'rotated' : ''}`} style={step === 1 ? { opacity: 0.6 } : {}}></i>
          </div>

          <div className="drawer-inner-scroll">
            <div className="drawer-account-summary">
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="summary-label">Balance</span>
                  <span className="summary-value">₹10,000</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Free Margin</span>
                  <span className="summary-value">₹8,000</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Floating P/L</span>
                  <span className="summary-value positive">₹+500</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Equity</span>
                  <span className="summary-value highlight">₹10,500</span>
                </div>
                {step === 2 && (
                  <>
                    <div className="summary-item">
                      <span className="summary-label">Used Margin</span>
                      <span className="summary-value">₹2,000</span>
                    </div>
                    <div className="summary-item">
                      <span className="summary-label">Margin Limit</span>
                      <span className="summary-value">₹10,000</span>
                    </div>
                  </>
                )}
              </div>
            </div>
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
