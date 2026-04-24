'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { useAuth } from '@/hooks/useAuth';
import { pageCache } from '@/lib/pageCache';
import './page.css';
import Link from 'next/link';
import Footer from '../../components/Footer';

type ActiveAccountResponse = {
  id: string;
  account_holder: string;
  bank_name: string;
  account_no: string;
  ifsc: string;
  upi_id: string;
  qr_image_url: string;
};

export default function FundsPage() {
  const router = useRouter();
  useAuth();
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [amount, setAmount] = useState<string>('500');

  // Balance state — initialise from cache for instant display
  const [balance, setBalance] = useState<number | null>(() => pageCache.get<number>('funds:balance'));
  const [balanceLoading, setBalanceLoading] = useState<boolean>(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);

  // Withdrawal bank detail state
  const [accountName, setAccountName] = useState<string>('');
  const [accountNo, setAccountNo] = useState<string>('');
  const [ifsc, setIfsc] = useState<string>('');
  const [upi, setUpi] = useState<string>('');

  // Active account state (for deposit flow)
  const [activeAccount, setActiveAccount] = useState<ActiveAccountResponse | null>(null);
  const [activeAccountLoading, setActiveAccountLoading] = useState<boolean>(false);
  const [activeAccountError, setActiveAccountError] = useState<string | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSession().then((session) => {
      if (cancelled) return;
      if (session) fetchBalance(session.access_token);
    });
    return () => { cancelled = true; };
  }, []);

  const fetchBalance = async (accessToken: string) => {
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const res = await fetch('/api/pay/balance', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const bal = data.balance ?? 0;
        setBalance(bal);
        pageCache.set('funds:balance', bal);
      } else {
        setBalanceError('Failed to load balance');
        if (balance === null) setBalance(null);
      }
    } catch {
      setBalanceError('Failed to load balance');
      if (balance === null) setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  };

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

  // Reset submitted/error state when switching tabs
  const handleTabChange = (tab: 'deposit' | 'withdraw') => {
    setActiveTab(tab);
    setSubmitted(false);
    setSubmitError(null);
  };

  const handleDeposit = async () => {
    setSubmitError(null);
    setActiveAccountError(null);
    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount < 1000) return;

    setSubmitting(true);
    setActiveAccountLoading(true);
    try {
      const session = await getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      // Step 1: Fetch active account
      const accountRes = await fetch('/api/pay/active-account', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!accountRes.ok) {
        const accountData = await accountRes.json();
        setActiveAccountError(accountData.error ?? 'Failed to fetch payment account. Please try again.');
        setActiveAccountLoading(false);
        setSubmitting(false);
        return;
      }
      const account: ActiveAccountResponse = await accountRes.json();
      setActiveAccount(account);
      setActiveAccountLoading(false);

      // Step 2: Submit deposit request with payment_account_id
      const res = await fetch('/api/pay/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ type: 'DEPOSIT', amount: numAmount, payment_account_id: account.id }),
      });
      if (res.status === 201) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setSubmitError(data.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setActiveAccountLoading(false);
      setSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    setSubmitError(null);
    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) return;
    if (!accountName || !accountNo || !ifsc) return;

    setSubmitting(true);
    try {
      const session = await getSession();
      if (!session) {
        router.replace('/login');
        return;
      }
      const res = await fetch('/api/pay/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          type: 'WITHDRAWAL',
          amount: numAmount,
          account_name: accountName,
          account_no: accountNo,
          ifsc,
          upi: upi || undefined,
        }),
      });
      if (res.status === 201) {
        setSubmitted(true);
      } else {
        const data = await res.json();
        setSubmitError(data.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setSubmitError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const numAmount = Number(amount);
  const amountInvalid = !amount || isNaN(numAmount) || numAmount <= 0;
  const depositBelowMin = !amountInvalid && numAmount < 1000;
  const depositDisabled = submitting || submitted || amountInvalid || depositBelowMin;
  const withdrawDisabled = submitting || submitted || amountInvalid || !accountName || !accountNo || !ifsc;

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
              <h1 className="balance-amount">
                {balanceLoading
                  ? <span style={{ fontSize: '1.2rem', opacity: 0.7 }}>Loading…</span>
                  : `₹${balance?.toFixed(2) ?? '0.00'}`
                }
              </h1>
              {balanceError && (
                <p style={{ fontSize: '0.7rem', color: 'rgba(255,100,100,0.9)', marginBottom: '8px' }}>
                  {balanceError}
                </p>
              )}
              <div className="balance-chip"><i className="fas fa-shield-check"></i> 100% Encrypted &amp; Secure</div>
            </div>

            {/* Deposit / Withdraw Tabs */}
            <div className="funds-tabs">
              <div className={`fund-tab ${activeTab === 'deposit' ? 'active' : ''}`} onClick={() => handleTabChange('deposit')}>Deposit</div>
              <div className={`fund-tab ${activeTab === 'withdraw' ? 'active' : ''}`} onClick={() => handleTabChange('withdraw')}>Withdraw</div>
            </div>

            {/* Main Interactive Form */}
            <div className="payment-box">
              <label>Amount (INR)</label>
              <div className="amount-input-wrapper">
                <span className="currency-symbol">₹</span>
                <input
                  type="number"
                  className="amount-input"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {amountInvalid && amount !== '' && (
                <p style={{ color: '#c0392b', fontSize: '0.75rem', marginTop: '-10px', marginBottom: '10px' }}>
                  Please enter a valid positive amount.
                </p>
              )}

              <div className="quick-amounts">
                {[500, 1000, 5000, 10000].map(val => (
                  <div key={val} className="quick-btn" onClick={() => setAmount(val.toString())}>+₹{val}</div>
                ))}
              </div>

              {/* Deposit Tab Content */}
              {activeTab === 'deposit' && (
                <>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '-8px', marginBottom: '12px' }}>
                    Minimum deposit: ₹1,000
                  </p>

                  {depositBelowMin && (
                    <p style={{ color: '#c0392b', fontSize: '0.75rem', marginTop: '-8px', marginBottom: '10px' }}>
                      Minimum deposit is ₹1,000
                    </p>
                  )}

                  {submitted && activeAccount ? (
                    <div style={{
                      background: 'var(--icon-bg)',
                      border: '1px solid #006400',
                      borderRadius: '12px',
                      padding: '20px',
                      marginBottom: '16px',
                    }}>
                      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                        <i className="fas fa-check-circle" style={{ color: '#006400', fontSize: '1.5rem', marginRight: '8px' }}></i>
                        <span style={{ color: '#006400', fontWeight: 700, fontSize: '1rem' }}>
                          Request submitted — pending admin approval
                        </span>
                      </div>
                      <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                        <img
                          src={activeAccount.qr_image_url}
                          alt="Payment QR Code"
                          style={{ maxWidth: '200px', width: '100%', borderRadius: '8px', border: '1px solid var(--border-card)' }}
                        />
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: '1.8' }}>
                        <div><strong>Account Holder:</strong> {activeAccount.account_holder}</div>
                        <div><strong>Bank Name:</strong> {activeAccount.bank_name}</div>
                        <div><strong>Account Number:</strong> {activeAccount.account_no}</div>
                        <div><strong>IFSC:</strong> {activeAccount.ifsc}</div>
                        <div><strong>UPI ID:</strong> {activeAccount.upi_id}</div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {activeAccountError && (
                        <p style={{ color: '#c0392b', fontSize: '0.8rem', marginBottom: '12px', fontWeight: 600 }}>
                          ❌ {activeAccountError}
                        </p>
                      )}
                      {submitError && (
                        <p style={{ color: '#c0392b', fontSize: '0.8rem', marginBottom: '12px', fontWeight: 600 }}>
                          ❌ {submitError}
                        </p>
                      )}
                      <button
                        className="submit-funds-btn"
                        onClick={handleDeposit}
                        disabled={depositDisabled}
                        style={{ opacity: depositDisabled ? 0.6 : 1, cursor: depositDisabled ? 'not-allowed' : 'pointer' }}
                      >
                        <i className="fas fa-lock"></i>
                        {submitting ? (activeAccountLoading ? 'Fetching account…' : 'Submitting…') : 'Request Deposit'}
                      </button>
                    </>
                  )}
                </>
              )}

              {/* Withdraw Tab Content */}
              {activeTab === 'withdraw' && (
                <>
                  <div style={{ marginBottom: '16px' }}>
                    <label>Account Name <span style={{ color: '#c0392b' }}>*</span></label>
                    <input
                      type="text"
                      value={accountName}
                      onChange={(e) => setAccountName(e.target.value)}
                      placeholder="Enter account holder name"
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        border: '1px solid var(--border-card)',
                        background: 'var(--icon-bg)',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                    {!accountName && (
                      <p style={{ color: '#c0392b', fontSize: '0.72rem', marginTop: '4px' }}>Account name is required.</p>
                    )}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label>Account Number <span style={{ color: '#c0392b' }}>*</span></label>
                    <input
                      type="text"
                      value={accountNo}
                      onChange={(e) => setAccountNo(e.target.value)}
                      placeholder="Enter account number"
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        border: '1px solid var(--border-card)',
                        background: 'var(--icon-bg)',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                    {!accountNo && (
                      <p style={{ color: '#c0392b', fontSize: '0.72rem', marginTop: '4px' }}>Account number is required.</p>
                    )}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label>IFSC Code <span style={{ color: '#c0392b' }}>*</span></label>
                    <input
                      type="text"
                      value={ifsc}
                      onChange={(e) => setIfsc(e.target.value)}
                      placeholder="e.g. SBIN0001234"
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        border: '1px solid var(--border-card)',
                        background: 'var(--icon-bg)',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                    {!ifsc && (
                      <p style={{ color: '#c0392b', fontSize: '0.72rem', marginTop: '4px' }}>IFSC code is required.</p>
                    )}
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <label>UPI ID <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(optional)</span></label>
                    <input
                      type="text"
                      value={upi}
                      onChange={(e) => setUpi(e.target.value)}
                      placeholder="e.g. name@upi"
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '12px',
                        border: '1px solid var(--border-card)',
                        background: 'var(--icon-bg)',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {submitted ? (
                    <div style={{
                      background: 'rgba(0,100,0,0.1)',
                      border: '1px solid #006400',
                      borderRadius: '12px',
                      padding: '16px',
                      textAlign: 'center',
                      color: '#006400',
                      fontWeight: 700,
                      marginBottom: '16px',
                    }}>
                      <i className="fas fa-check-circle" style={{ marginRight: '8px' }}></i>
                      Request submitted — pending admin approval
                    </div>
                  ) : (
                    <>
                      {submitError && (
                        <p style={{ color: '#c0392b', fontSize: '0.8rem', marginBottom: '12px', fontWeight: 600 }}>
                          ❌ {submitError}
                        </p>
                      )}
                      <button
                        className="submit-funds-btn"
                        onClick={handleWithdraw}
                        disabled={withdrawDisabled}
                        style={{ opacity: withdrawDisabled ? 0.6 : 1, cursor: withdrawDisabled ? 'not-allowed' : 'pointer' }}
                      >
                        <i className="fas fa-paper-plane"></i>
                        {submitting ? 'Submitting…' : 'Request Withdrawal'}
                      </button>
                    </>
                  )}
                </>
              )}

            </div>

          </div>
        </div>
      </div>

      {/* Footer Navigation Overlay */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50 }}>
        <Footer activeTab="home" hideDrawer={true} />
      </div>
    </div>
  );
}
