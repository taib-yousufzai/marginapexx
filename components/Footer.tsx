
'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import './Footer.css';

interface FooterProps {
  activeTab: 'home' | 'watchlist' | 'order' | 'position' | 'history';
}

const Footer: React.FC<FooterProps> = ({ activeTab }) => {
  const [isDrawerOpen, setDrawerOpen] = useState(false);

  const toggleDrawer = () => setDrawerOpen(!isDrawerOpen);

  return (
    <div className="footer-section">
      {/* Drawer Handle (Home Style) */}
      {activeTab !== 'watchlist' && (
        <>
          <div className="drawer-handle" onClick={toggleDrawer}>
            <div className="reverse-semi-circle">
              <div className="handle-bar"></div>
              <i className={`fas fa-chevron-${isDrawerOpen ? 'down' : 'up'}`} id="drawerHandleIcon"></i>
            </div>
          </div>
          
          {/* Expandable Drawer Content (Home Style) */}
          <div className={`pull-drawer ${isDrawerOpen ? 'open' : ''}`} id="pullDrawer">
            <div className="drawer-content">
              <div className="drawer-inner">
                <div className="drawer-placeholder">
                  <i className="fas fa-chart-pie"></i>
                  <span style={{fontWeight: 700}}>Account Summary & Utilities</span>
                  <p style={{fontSize: '0.7rem', color: '#94A3B8'}}>Shortcuts and settings will appear here.</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Main Footer Navigation */}
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
  );
};

export default Footer;
