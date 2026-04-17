'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import './page.css';
import Link from 'next/link';
import Footer from '../../components/Footer';

export default function FundsPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState<string>('500');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSession().then((session) => {
      if (cancelled) return;
      if (!session) {
        router.replace('/login');
      } else {
        setIsChecking(false);
      }
    });
    return () => { cancelled = true; };
  }, [router]);

  // Parse "?tab=withdraw" flag
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'withdraw') {
      setActiveTab('withdraw');
      setAmount('100');
    }

    const savedTheme = localStorage.getItem('marginApexTheme') as 'light' | 'dark' | null;
    if (savedTheme) {
      document.body.className = savedTheme;
    }
  }, []);

  const handleAction = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setToastMsg("❌ Please enter a valid amount");
    } else {
      setToastMsg(`✅ Success: You have successfully ${activeTab === 'deposit' ? 'deposited' : 'withdrawn'} $${amount}.`);
    }
    setTimeout(() => setToastMsg(null), 2500);
  };

  if (isChecking) return null;

  return (
    <div className="app-container funds-shell">
      {/* Top Navbar */}
      <div className="nav-bar-full">
        <Link href="/" className="nav-icon-btn"><i className="fas fa-arrow-left"></i></Link>
        <div className="nav-app-name">Manage <span style={{ color: '#006400', marginLeft: '4px' }}>Funds</span></div>
        <div style={{ width: '40px' }}></div> {/* Spacer for centering */}
      </div>

      <div className="main-scroll-wrapper" style={{ flex: 1, overflowY: 'auto' }}>
        <div className="main-content screen">
          <div className="content-padded" style={{ paddingTop: '20px' }}>

            {/* Balance Overview Card */}
            <div className="balance-card">
              <p className="balance-label">Total Current Balance</p>
              <h1 className="balance-amount">$124,500.00</h1>
              <div className="balance-chip"><i className="fas fa-shield-check"></i> 100% Encrypted & Secure</div>
            </div>

            {/* Deposit / Withdraw Tabs */}
            <div className="funds-tabs">
              <div className={`fund-tab ${activeTab === 'deposit' ? 'active' : ''}`} onClick={() => setActiveTab('deposit')}>Deposit</div>
              <div className={`fund-tab ${activeTab === 'withdraw' ? 'active' : ''}`} onClick={() => setActiveTab('withdraw')}>Withdraw</div>
            </div>

            {/* Main Interactive Form */}
            <div className="payment-box">
              <label>Amount (USD)</label>
              <div className="amount-input-wrapper">
                <span className="currency-symbol">$</span>
                <input type="number" className="amount-input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>

              <div className="quick-amounts">
                {[100, 500, 1000, 5000].map(val => (
                  <div key={val} className="quick-btn" onClick={() => setAmount(val.toString())}>+${val}</div>
                ))}
              </div>

              <label style={{ marginTop: '24px' }}>{activeTab === 'deposit' ? 'Select Payment Method' : 'Transfer Destination'}</label>
              <div className="method-selector">
                <div className="method-item active">
                  <div className="method-icon"><i className="fas fa-university"></i></div>
                  <div className="method-info">
                    <h4>Bank Transfer / NEFT</h4>
                    <p>Instant Settlement (2-3 mins)</p>
                  </div>
                  <div className="method-check"><i className="fas fa-check-circle"></i></div>
                </div>
                <div className="method-item">
                  <div className="method-icon"><i className="fab fa-bitcoin"></i></div>
                  <div className="method-info">
                    <h4>Crypto Wallet</h4>
                    <p>USDT / USDC / BTC supported</p>
                  </div>
                  <div className="method-check"></div>
                </div>
              </div>

              <button className="submit-funds-btn" onClick={handleAction}>
                <i className={activeTab === 'deposit' ? "fas fa-lock" : "fas fa-paper-plane"}></i>
                {activeTab === 'deposit' ? 'Confirm Deposit' : 'Request Withdrawal'}
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Footer Navigation Overlay */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50 }}>
        <Footer activeTab="home" hideDrawer={true} />
      </div>

      {/* Dynamic Toast popup replicating global behavior */}
      {toastMsg && (
        <div className="toast-msg" style={{
          opacity: 1, position: 'fixed', bottom: '120px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(30,35,45,0.95)', color: '#fff', padding: '14px 24px', borderRadius: '40px',
          fontSize: '0.9rem', zIndex: 9999, fontWeight: 600, width: 'max-content', maxWidth: '90vw'
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
