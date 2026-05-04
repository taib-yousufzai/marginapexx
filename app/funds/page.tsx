'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { useAuth } from '@/hooks/useAuth';
import { pageCache } from '@/lib/pageCache';
import './page.css';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import Footer from '../../components/Footer';
import QRCode from 'react-qr-code';

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
  const [utr, setUtr] = useState<string>('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Toast state for feedback
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setToast({ message: `${label} copied!`, type: 'success' });
    setTimeout(() => setToast(null), 2000);
  };

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

  // Realtime balance and request updates
  useEffect(() => {
    let channel: any;
    let isMounted = true;

    const setupRealtime = async () => {
      const session = await getSession();
      if (!session || !isMounted) return;

      const userId = session.user.id;

      // Consolidate into a single channel for this user's funds
      channel = supabase
        .channel(`user_funds_realtime_${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` },
          () => {
            if (isMounted) fetchBalance(session.access_token);
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'pay_requests', filter: `user_id=eq.${userId}` },
          (payload) => {
            if (!isMounted) return;
            if (payload.new && payload.new.status !== 'PENDING') {
              if (payload.new.status === 'APPROVED') {
                fetchBalance(session.access_token);
              }
              setSubmitted(false);
            }
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      isMounted = false;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Parse "?tab=withdraw" flag
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tab') === 'withdraw') {
      setActiveTab('withdraw');
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

  const handleProceedToPay = async () => {
    setSubmitError(null);
    setActiveAccountError(null);
    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount < 1000) return;

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
        return;
      }
      const account: ActiveAccountResponse = await accountRes.json();
      setActiveAccount(account);
      setActiveAccountLoading(false);
    } catch {
      setActiveAccountError('Network error. Please try again.');
      setActiveAccountLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setToast({ message: 'File too large. Max 5MB allowed.', type: 'error' });
        return;
      }
      setScreenshot(file);
      const reader = new FileReader();
      reader.onloadend = () => setScreenshotPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmDeposit = async () => {
    setSubmitError(null);
    const numAmount = Number(amount);
    if (!amount || isNaN(numAmount) || numAmount < 1000) return;
    if (!activeAccount) return;
    
    if (utr && !/^\d{12}$/.test(utr)) {
      setSubmitError('Invalid UTR: Must be exactly 12 digits if provided');
      return;
    }

    if (!screenshot) {
      setSubmitError('Payment screenshot is required');
      return;
    }

    setSubmitting(true);
    setUploading(true);
    try {
      const session = await getSession();
      if (!session) {
        router.replace('/login');
        return;
      }

      // Step 1: Upload screenshot to Supabase Storage
      const fileExt = screenshot.name.split('.').pop();
      const fileName = `${session.user.id}-${Date.now()}.${fileExt}`;
      const filePath = `payments/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('payments')
        .upload(filePath, screenshot);

      if (uploadError) {
        throw new Error('Failed to upload screenshot. Please ensure the "payments" bucket exists.');
      }

      const { data: { publicUrl } } = supabase.storage
        .from('payments')
        .getPublicUrl(filePath);

      // Step 2: Submit deposit request with screenshot_url
      const res = await fetch('/api/pay/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          type: 'DEPOSIT', 
          amount: numAmount, 
          payment_account_id: activeAccount.id, 
          utr: utr || undefined,
          screenshot_url: publicUrl,
        }),
      });
      if (res.status === 201) {
        setSubmitted(true);
        setScreenshot(null);
        setScreenshotPreview(null);
      } else {
        const data = await res.json();
        setSubmitError(data.error ?? 'Something went wrong. Please try again.');
      }
    } catch (err: any) {
      setSubmitError(err.message || 'Network error. Please try again.');
    } finally {
      setSubmitting(false);
      setUploading(false);
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
          <div className="content-padded" style={{ paddingTop: '20px', paddingBottom: '120px' }}>

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
                      <div style={{ textAlign: 'center' }}>
                        <i className="fas fa-check-circle" style={{ color: '#006400', fontSize: '1.5rem', marginRight: '8px' }}></i>
                        <span style={{ color: '#006400', fontWeight: 700, fontSize: '1rem' }}>
                          Request submitted — pending admin approval
                        </span>
                      </div>
                      <div style={{ marginTop: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        UTR: {utr}
                      </div>
                    </div>
                  ) : activeAccount ? (
                    <div style={{
                      background: 'var(--icon-bg)',
                      border: '1px solid var(--border-card)',
                      borderRadius: '12px',
                      padding: '20px',
                      marginBottom: '16px',
                    }}>
                      <div style={{ textAlign: 'center', marginBottom: '16px', display: 'flex', justifyContent: 'center' }}>
                        {activeAccount.upi_id ? (
                          <div style={{ padding: '16px', background: 'white', borderRadius: '12px', display: 'inline-block' }}>
                            <QRCode 
                              value={`upi://pay?pa=${activeAccount.upi_id}&pn=${encodeURIComponent(activeAccount.account_holder)}&am=${amount}&cu=INR`}
                              size={200}
                            />
                          </div>
                        ) : activeAccount.qr_image_url ? (
                          <img
                            src={activeAccount.qr_image_url}
                            alt="Payment QR Code"
                            style={{ maxWidth: '200px', width: '100%', borderRadius: '8px', border: '1px solid var(--border-card)' }}
                          />
                        ) : null}
                      </div>
                      <div style={{ marginBottom: '20px' }}>
                        {activeAccount.upi_id && (
                          <div className="copyable-row" onClick={() => copyToClipboard(activeAccount.upi_id, 'UPI ID')}>
                            <div><strong>UPI ID</strong> <span>{activeAccount.upi_id}</span></div>
                            <i className="fas fa-copy copy-icon"></i>
                          </div>
                        )}
                        <div className="copyable-row" onClick={() => copyToClipboard(activeAccount.account_holder, 'Account Holder')}>
                          <div><strong>Account Holder</strong> <span>{activeAccount.account_holder}</span></div>
                          <i className="fas fa-copy copy-icon"></i>
                        </div>
                        <div className="copyable-row" onClick={() => copyToClipboard(activeAccount.account_no, 'Account Number')}>
                          <div><strong>Account Number</strong> <span>{activeAccount.account_no}</span></div>
                          <i className="fas fa-copy copy-icon"></i>
                        </div>
                        <div className="copyable-row" onClick={() => copyToClipboard(activeAccount.bank_name, 'Bank Name')}>
                          <div><strong>Bank Name</strong> <span>{activeAccount.bank_name}</span></div>
                          <i className="fas fa-copy copy-icon"></i>
                        </div>
                        <div className="copyable-row" onClick={() => copyToClipboard(activeAccount.ifsc, 'IFSC Code')}>
                          <div><strong>IFSC Code</strong> <span>{activeAccount.ifsc}</span></div>
                          <i className="fas fa-copy copy-icon"></i>
                        </div>
                      </div>

                      <div style={{ marginBottom: '16px' }}>
                        <label>12-Digit UTR / Reference Number <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>(optional)</span></label>
                        <input
                          type="text"
                          value={utr}
                          onChange={(e) => setUtr(e.target.value.replace(/\D/g, '').slice(0, 12))}
                          placeholder="e.g. 123456789012"
                          style={{
                            width: '100%',
                            padding: '12px 16px',
                            borderRadius: '12px',
                            border: '1px solid var(--border-card)',
                            background: 'var(--main-bg)',
                            color: 'var(--text-primary)',
                            fontSize: '0.9rem',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                        {utr.length > 0 && utr.length < 12 && (
                          <p style={{ color: '#c0392b', fontSize: '0.75rem', marginTop: '4px' }}>Must be exactly 12 digits.</p>
                        )}
                      </div>

                      <div style={{ marginBottom: '20px' }}>
                        <label>Upload Payment Screenshot <span style={{ color: '#c0392b' }}>*</span></label>
                        <div style={{
                          border: '2px dashed var(--border-card)',
                          borderRadius: '12px',
                          padding: '20px',
                          textAlign: 'center',
                          background: 'var(--main-bg)',
                          cursor: 'pointer',
                          position: 'relative'
                        }} onClick={() => document.getElementById('screenshot-upload')?.click()}>
                          {screenshotPreview ? (
                            <div style={{ position: 'relative' }}>
                              <img src={screenshotPreview} alt="Preview" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px' }} />
                              <div style={{ marginTop: '8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Click to change image</div>
                            </div>
                          ) : (
                            <>
                              <i className="fas fa-cloud-upload-alt" style={{ fontSize: '2rem', color: 'var(--text-secondary)', marginBottom: '8px' }}></i>
                              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>Click to upload proof</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>JPG, PNG or PDF (Max 5MB)</div>
                            </>
                          )}
                          <input 
                            id="screenshot-upload"
                            type="file" 
                            accept="image/*" 
                            onChange={handleFileChange} 
                            style={{ display: 'none' }}
                          />
                        </div>
                      </div>

                      {submitError && (
                        <p style={{ color: '#c0392b', fontSize: '0.8rem', marginBottom: '12px', fontWeight: 600 }}>
                          ❌ {submitError}
                        </p>
                      )}
                      
                      <button
                        className="submit-funds-btn"
                        onClick={handleConfirmDeposit}
                        disabled={!screenshot || submitting}
                        style={{ opacity: (!screenshot || submitting) ? 0.6 : 1, cursor: (!screenshot || submitting) ? 'not-allowed' : 'pointer' }}
                      >
                        <i className="fas fa-check"></i>
                        {submitting ? (uploading ? 'Uploading Proof…' : 'Submitting…') : 'Confirm Deposit'}
                      </button>
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
                        onClick={handleProceedToPay}
                        disabled={depositDisabled}
                        style={{ opacity: depositDisabled ? 0.6 : 1, cursor: depositDisabled ? 'not-allowed' : 'pointer' }}
                      >
                        <i className="fas fa-qrcode"></i>
                        {activeAccountLoading ? 'Fetching details…' : 'Proceed to Pay'}
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

      {/* Toast Notification */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '100px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: toast.type === 'success' ? '#006400' : '#c0392b',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '50px',
          zIndex: 1000,
          fontSize: '0.9rem',
          fontWeight: 600,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          animation: 'fadeInUp 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          whiteSpace: 'nowrap'
        }}>
          <i className={`fas ${toast.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
          {toast.message}
        </div>
      )}

      {/* Footer Navigation Overlay */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50 }}>
        <Footer activeTab="home" hideDrawer={true} />
      </div>
    </div>
  );
}
