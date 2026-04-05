
'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import './Footer.css';

interface FooterProps {
  activeTab: 'home' | 'watchlist' | 'order' | 'position' | 'history';
  hideDrawer?: boolean;
}

const Footer: React.FC<FooterProps> = ({ activeTab, hideDrawer = false }) => {
  const [isDrawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();

  const toggleDrawer = () => setDrawerOpen(!isDrawerOpen);

  return (
    <>
      {/* Account Drawer - expanded above footer, separate from footer-section */}
      {!hideDrawer && activeTab !== 'watchlist' && (
        <div className={`account-drawer ${isDrawerOpen ? 'open' : ''}`}>
          <div className="drawer-inner">
            <div className="drawer-account-summary">
              <div className="summary-header">
                <span className="summary-title"><i className="fas fa-wallet"></i> Account Overview</span>
                <button className="drawer-close-btn" onClick={() => setDrawerOpen(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              <div className="summary-grid">
                <div className="summary-item">
                  <span className="summary-label">Total Balance</span>
                  <span className="summary-value">$124,500.00</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Available Margin</span>
                  <span className="summary-value highlight">$82,300.50</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Margin Used</span>
                  <span className="summary-value">$42,199.50</span>
                </div>
                <div className="summary-item">
                  <span className="summary-label">Today's P&L</span>
                  <span className="summary-value positive">+$1,240.20</span>
                </div>
              </div>
              <div className="summary-actions">
                <button className="summary-action-btn" onClick={() => { setDrawerOpen(false); router.push('/funds?tab=deposit'); }}>
                  <i className="fas fa-plus"></i> Add Funds
                </button>
                <button className="summary-action-btn secondary" onClick={() => { setDrawerOpen(false); router.push('/funds?tab=withdraw'); }}>
                  <i className="fas fa-university"></i> Withdraw
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation Bar */}
      <div className="footer-section">
        {/* Drawer Toggle - centered above the nav bar as a tab */}
        {!hideDrawer && activeTab !== 'watchlist' && (
          <div className="drawer-toggle-tab" onClick={toggleDrawer}>
            <div className="drawer-toggle-pill">
              <i className={`fas fa-chevron-${isDrawerOpen ? 'down' : 'up'}`}></i>
              <span>Account</span>
            </div>
          </div>
        )}

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
