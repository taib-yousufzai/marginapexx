'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { getSession } from '@/lib/auth';
import './page.css';

interface SegmentSetting {
  id: string;
  segment: string;
  side: 'BUY' | 'SELL';
  trade_allowed: boolean;
  intraday_leverage: number;
  holding_leverage: number;
  strike_range: number;
  max_lot: number;
  max_order_lot: number;
  commission_type: string;
  commission_value: number;
  carry_commission_type: string;
  carry_commission_value: number;
  gtt_commission_type: string;
  gtt_commission_value: number;
  profit_hold_sec: number;
  loss_hold_sec: number;
  entry_buffer: number;
  exit_buffer: number;
}

export default function UnifiedSettingsPage() {
  useAuth();
  const router = useRouter();
  const [theme, setTheme] = useState<'light' | 'dark' | 'black' | 'blue'>('light');
  const [segments, setSegments] = useState<SegmentSetting[]>([]);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<'normal' | 'scalper'>('normal');
  const [actualMode, setActualMode] = useState<'normal' | 'scalper'>('normal');
  const [modeLockedUntil, setModeLockedUntil] = useState<string | null>(null);
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [isGoToScalperModalOpen, setIsGoToScalperModalOpen] = useState(false);
  const [isGoToNormalModalOpen, setIsGoToNormalModalOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);

  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [alertModalContent, setAlertModalContent] = useState<{ title: string, bullets: string[] } | null>(null);

  const showAlert = (title: string, message: string) => {
    const lines = message.split('\n').filter(l => l.trim() !== '');
    setAlertModalContent({ title, bullets: lines });
    setIsAlertModalOpen(true);
  };

  useEffect(() => {
    const savedTheme = localStorage.getItem('marginApexTheme') as 'light' | 'dark' | 'black' | 'blue' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.body.classList.remove('dark', 'black', 'blue');
      if (savedTheme !== 'light') document.body.classList.add(savedTheme);
    }
  }, []);

  // Fetch current user trading mode on mount
  useEffect(() => {
    let cancelled = false;
    getSession().then(async (session) => {
      if (cancelled || !session) return;

      try {
        const res = await fetch('/api/user/trading-mode', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setActualMode(data.trading_mode);
            setActiveTab(data.trading_mode);
            setModeLockedUntil(data.mode_locked_until);
          }
        }
      } catch (err) {
        console.error('Error fetching trading mode:', err);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch segment settings whenever the viewed tab (activeTab) changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getSession().then(async (session) => {
      if (cancelled) return;
      if (!session) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`/api/user/segments?mode=${activeTab}`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          const sorted = (data || []).sort((a: SegmentSetting, b: SegmentSetting) => {
            const segCompare = a.segment.localeCompare(b.segment);
            if (segCompare !== 0) return segCompare;
            return a.side.localeCompare(b.side);
          });
          if (!cancelled) setSegments(sorted);
        }
      } catch (err) {
        console.error('Error fetching user segments:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const formatCommissionType = (type: string) => {
    if (!type) return 'Per Crore';
    return type
      .replace(/[_-]/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  };

  const handleChooseNormal = () => {
    setIsChoiceModalOpen(false);
    if (actualMode === 'scalper') {
      if (modeLockedUntil) {
        const lockedTime = new Date(modeLockedUntil).getTime();
        if (lockedTime > Date.now()) {
          const hours = ((lockedTime - Date.now()) / (1000 * 60 * 60)).toFixed(1);
          showAlert("Mode Locked", `Cannot switch back to Normal Mode yet. Scalper Mode is locked for another ${hours} hours (until ${new Date(modeLockedUntil).toLocaleString()}).`);
          return;
        }
      }
      setIsGoToNormalModalOpen(true);
    } else {
      showAlert("Notice", "You are already in Normal Mode.");
    }
  };

  const handleChooseScalper = () => {
    setIsChoiceModalOpen(false);
    if (actualMode === 'normal') {
      setIsGoToScalperModalOpen(true);
    } else {
      showAlert("Notice", "You are already in Scalper Mode. 48-hour lock is active.");
    }
  };

  const confirmScalperMode = async () => {
    setIsGoToScalperModalOpen(false);
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) throw new Error('Not logged in');

      const res = await fetch('/api/user/trading-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ trading_mode: 'scalper' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to activate Scalper Mode');
      }

      setActualMode('scalper');
      setActiveTab('scalper');
      setModeLockedUntil(data.mode_locked_until);
      showAlert("Scalper Mode Activated!", "Slightly Higher Brokerage\nLow Profit Hold Trade Time\nPerfect For Scalper");
    } catch (err: any) {
      showAlert("Activation Failed", err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const confirmNormalMode = async () => {
    setIsGoToNormalModalOpen(false);
    setLoading(true);
    try {
      const session = await getSession();
      if (!session) throw new Error('Not logged in');

      const res = await fetch('/api/user/trading-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ trading_mode: 'normal' }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to activate Normal Mode');
      }

      setActualMode('normal');
      setActiveTab('normal');
      setModeLockedUntil(null);
      showAlert("Normal Mode Activated!", "Slightly Low Brokerage\nHigher Profit Hold Trade Timer\nScalping Banned");
    } catch (err: any) {
      showAlert("Switch Failed", err.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`app-container ${theme}`}>

      {/* HEADER */}
      <div className="compact-header">
        <div className="header-row-top">
          <Link href="/" className="back-button">
            <i className="fas fa-arrow-left"></i>
          </Link>
          <div className="rectangle-toggle-group">
            <button
              className={`rect-toggle-btn ${activeTab === 'normal' ? 'active-toggle' : ''}`}
              onClick={() => setActiveTab('normal')}
            >
              Normal Mode {actualMode === 'normal' && <span style={{ color: '#10b981', marginLeft: '4px' }}>●</span>}
            </button>
            <button
              className={`rect-toggle-btn ${activeTab === 'scalper' ? 'active-toggle' : ''}`}
              onClick={() => setActiveTab('scalper')}
            >
              Scalper Mode {actualMode === 'scalper' && <span style={{ color: '#10b981', marginLeft: '4px' }}>●</span>}
            </button>
          </div>
        </div>
        <div className="header-row-bottom">
          <span className="instruction-label">
            {actualMode === 'scalper' ? 'Scalper Mode Active' : 'Normal Mode Active'}
          </span>
          <div className="action-buttons-wrapper">
            <button className="select-mode-btn" onClick={() => setIsChoiceModalOpen(true)}>SELECT MODE →</button>
            <button className="rules-trigger-btn" onClick={() => setIsRulesModalOpen(true)}>RULES</button>
          </div>
        </div>
      </div>

      {/* CONTENT: NORMAL VIEW */}
      {activeTab === 'normal' && (
        <div className="margin-settings-content">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>Fetching your profile...</div>
          ) : segments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>No Segments Allowed.</div>
          ) : (
            <div className="segments-list">
              {segments.map((item) => {
                const isBuy = item.side.toUpperCase() === 'BUY';
                const isAllowed = item.trade_allowed;

                return (
                  <div key={item.id} className={`segment-premium-card ${isBuy ? 'side-buy' : 'side-sell'} ${!isAllowed ? 'trade-blocked' : ''}`}>
                    <div className="card-top-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 className="segment-label">{item.segment.toUpperCase()}</h3>
                        <span className={`badge-transaction ${isBuy ? 'buy' : 'sell'}`}>{item.side.toUpperCase()}</span>
                      </div>
                    </div>

                    <div className="settings-section">
                      <div className="section-title-faint">LEVERAGE & RISK LIMITS</div>
                      <div className="segment-details-grid">
                        <div className="detail-item"><span className="detail-label">Intraday Leverage</span><span className="detail-value">{item.intraday_leverage}</span></div>
                        <div className="detail-item"><span className="detail-label">Holding Leverage</span><span className="detail-value">{item.holding_leverage}</span></div>
                        <div className="detail-item"><span className="detail-label">Max Lot</span><span className="detail-value">{item.max_lot}</span></div>
                        <div className="detail-item"><span className="detail-label">Max Order Lot</span><span className="detail-value">{item.max_order_lot}</span></div>
                        <div className="detail-item"><span className="detail-label">Strike Range</span><span className="detail-value">{item.strike_range || '0'}</span></div>
                        <div className="detail-item">
                          <span className="detail-label">GTT Comm. {item.gtt_commission_type ? formatCommissionType(item.gtt_commission_type) : ''}</span>
                          <span className="detail-value">{item.gtt_commission_value != null ? item.gtt_commission_value : '—'}</span>
                        </div>

                      </div>
                    </div>

                    <div className="settings-section">
                      <div className="section-title-faint">TRADING & COMMISSIONS</div>
                      <div className="segment-details-grid">
                        <div className="detail-item">
                          <span className="detail-label">Intraday Commission Type</span>
                          <span className="detail-value">{formatCommissionType(item.commission_type)}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Intraday Commission Value</span>
                          <span className="detail-value">{item.commission_value}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Carry Commission Type</span>
                          <span className="detail-value">{item.carry_commission_type ? formatCommissionType(item.carry_commission_type) : '—'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Carry Commission Value</span>
                          <span className="detail-value">{item.carry_commission_value != null ? item.carry_commission_value : '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="settings-section">
                      <div className="section-title-faint">SYSTEM RISK TIMERS</div>
                      <div className="segment-details-grid">
                        <div className="detail-item"><span className="detail-label">Min Hold Profit</span><span className="detail-value">{item.profit_hold_sec ? `${item.profit_hold_sec}s` : 'None'}</span></div>
                        <div className="detail-item"><span className="detail-label">Min Hold Loss</span><span className="detail-value">{item.loss_hold_sec ? `${item.loss_hold_sec}s` : 'None'}</span></div>
                      </div>
                    </div>

                    {!isAllowed && (
                      <div className="blocked-overlay">
                        <div className="blocked-content">
                          <span>Trading Blocked by Admin</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CONTENT: SCALPER VIEW */}
      {activeTab === 'scalper' && (
        <div className="margin-settings-content">
          <div className="scalper-intro">
            <p>Scalper Mode is active. High-frequency execution parameter safeguards are being applied directly from the liquidity node.</p>
          </div>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>Fetching your profile...</div>
          ) : segments.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>No Segments Allowed.</div>
          ) : (
            <div className="segments-list">
              {segments.map((item) => {
                const isBuy = item.side.toUpperCase() === 'BUY';
                const isAllowed = item.trade_allowed;

                return (
                  <div key={item.id} className={`segment-premium-card ${isBuy ? 'side-buy' : 'side-sell'} ${!isAllowed ? 'trade-blocked' : ''}`}>
                    <div className="card-top-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <h3 className="segment-label">{item.segment.toUpperCase()}</h3>
                        <span className={`badge-transaction ${isBuy ? 'buy' : 'sell'}`}>{item.side.toUpperCase()}</span>
                      </div>
                      <span className="scalper-card-active-badge">ACTIVE</span>
                    </div>

                    <div className="settings-section">
                      <div className="section-title-faint">LEVERAGE & RISK LIMITS</div>
                      <div className="segment-details-grid">
                        <div className="detail-item"><span className="detail-label">Intraday Leverage</span><span className="detail-value">{item.intraday_leverage}</span></div>
                        <div className="detail-item"><span className="detail-label">Holding Leverage</span><span className="detail-value">{item.holding_leverage}</span></div>
                        <div className="detail-item"><span className="detail-label">Max Lot</span><span className="detail-value">{item.max_lot}</span></div>
                        <div className="detail-item"><span className="detail-label">Max Order Lot</span><span className="detail-value">{item.max_order_lot}</span></div>
                        <div className="detail-item"><span className="detail-label">Strike Range</span><span className="detail-value">{item.strike_range || '0'}</span></div>
                        <div className="detail-item">
                          <span className="detail-label">GTT Comm. {item.gtt_commission_type ? formatCommissionType(item.gtt_commission_type) : ''}</span>
                          <span className="detail-value">{item.gtt_commission_value != null ? item.gtt_commission_value : '—'}</span>
                        </div>

                      </div>
                    </div>

                    <div className="settings-section">
                      <div className="section-title-faint">TRADING & COMMISSIONS</div>
                      <div className="segment-details-grid">
                        <div className="detail-item">
                          <span className="detail-label">Intraday Commission Type</span>
                          <span className="detail-value">{formatCommissionType(item.commission_type)}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Intraday Commission Value</span>
                          <span className="detail-value">{item.commission_value}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Carry Commission Type</span>
                          <span className="detail-value">{item.carry_commission_type ? formatCommissionType(item.carry_commission_type) : '—'}</span>
                        </div>
                        <div className="detail-item">
                          <span className="detail-label">Carry Commission Value</span>
                          <span className="detail-value">{item.carry_commission_value != null ? item.carry_commission_value : '—'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="settings-section">
                      <div className="section-title-faint">SYSTEM RISK TIMERS</div>
                      <div className="segment-details-grid">
                        <div className="detail-item"><span className="detail-label">Min Hold Profit</span><span className="detail-value">{item.profit_hold_sec ? `${item.profit_hold_sec}s` : 'None'}</span></div>
                        <div className="detail-item"><span className="detail-label">Min Hold Loss</span><span className="detail-value">{item.loss_hold_sec ? `${item.loss_hold_sec}s` : 'None'}</span></div>
                      </div>
                    </div>

                    {!isAllowed && (
                      <div className="blocked-overlay">
                        <div className="blocked-content">
                          <span>Trading Blocked by Admin</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODALS */}
      {/* 1. Select Mode Choice Modal */}
      <div className={`scalper-modal-overlay ${isChoiceModalOpen ? 'active' : ''}`} onClick={() => setIsChoiceModalOpen(false)}>
        <div className="scalper-modal-card" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">Select Trading Mode</h3>
            <button className="modal-close-x" onClick={() => setIsChoiceModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <p className="modal-intro-text">Choose your preferred trading mode. <strong>Once selected, you cannot switch for 48 hours.</strong></p>

            <div className="mode-option-card" onClick={handleChooseNormal}>
              <div className="mode-option-title">Normal Mode</div>
              <ul className="mode-feature-list">
                <li>Slightly Low Brokerage</li>
                <li>Higher Profit Hold Trade Timer</li>
                <li>Scalping Banned</li>
              </ul>
            </div>

            <div className="mode-option-card" onClick={handleChooseScalper}>
              <div className="mode-option-title">Scalper Mode</div>
              <ul className="mode-feature-list">
                <li>Slightly Higher Brokerage</li>
                <li>Low Profit Hold Trade Time</li>
                <li>Perfect For Scalper</li>
              </ul>
            </div>

            <div className="warning-48h">
              <strong>Important:</strong> Once you select a mode, you cannot change it for 48 hours. Please choose carefully based on your trading strategy.
            </div>
          </div>
          <div className="modal-footer">
            <button className="modal-btn cancel" onClick={() => setIsChoiceModalOpen(false)}>Cancel</button>
          </div>
        </div>
      </div>

      {/* 2. Go to Scalper Modal */}
      <div className={`scalper-modal-overlay ${isGoToScalperModalOpen ? 'active' : ''}`} onClick={() => setIsGoToScalperModalOpen(false)}>
        <div className="scalper-modal-card" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">Scalper Settings Risk Disclosure</h3>
            <button className="modal-close-x" onClick={() => setIsGoToScalperModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <p className="modal-intro-text">Please review and accept the following conditions to activate high-frequency Scalper Settings on your profile:</p>
            <div className="conditions-list">
              <div className="condition-item"><span className="condition-num">1</span><div className="condition-desc"><p>Read trading rules before trading.</p></div></div>
              <div className="condition-item"><span className="condition-num">2</span><div className="condition-desc"><p>Scalping includes quick trade actions.</p></div></div>
              <div className="condition-item"><span className="condition-num">3</span><div className="condition-desc"><p>Switching to scalper mode will not be chargeable for 48 hours, check the settings of scalper mode thoroughly before switching.</p></div></div>
              <div className="condition-item"><span className="condition-num">4</span><div className="condition-desc"><p>Trade with proper risk management and trade wisely.</p></div></div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="modal-btn cancel" onClick={() => setIsGoToScalperModalOpen(false)}>Cancel</button>
            <button className="modal-btn confirm" onClick={confirmScalperMode}>I Understand & Confirm</button>
          </div>
        </div>
      </div>

      {/* 3. Go to Normal Modal */}
      <div className={`scalper-modal-overlay ${isGoToNormalModalOpen ? 'active' : ''}`} onClick={() => setIsGoToNormalModalOpen(false)}>
        <div className="scalper-modal-card" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">Return to Standard Settings</h3>
            <button className="modal-close-x" onClick={() => setIsGoToNormalModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <p className="modal-intro-text">Please confirm if you want to deactivate high-frequency Scalper Mode and switch your active trading profile parameters back to normal:</p>
            <div className="conditions-list">
              <div className="condition-item"><span className="condition-num">1</span><div className="condition-desc"><strong>Standard Risk Control Settings</strong><p>Trading leverages, Strike Range rules, and Max Order Lot ceilings will return to the system administrator's original configurations.</p></div></div>
              <div className="condition-item"><span className="condition-num">2</span><div className="condition-desc"><strong>Standard Routing Gateway</strong><p>Deactivates direct liquidity-node gateways. Orders will be routed using standard execution buffers.</p></div></div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="modal-btn cancel" onClick={() => setIsGoToNormalModalOpen(false)}>Cancel</button>
            <button className="modal-btn confirm" onClick={confirmNormalMode}>Confirm & Proceed</button>
          </div>
        </div>
      </div>

      {/* 4. Trading Rules Modal */}
      <div className={`scalper-modal-overlay ${isRulesModalOpen ? 'active' : ''}`} onClick={() => setIsRulesModalOpen(false)}>
        <div className="scalper-modal-card" onClick={e => e.stopPropagation()}>
          <div className="modal-header">
            <h3 className="modal-title">Trading Rules, Fair Usage Policy & Code of Conduct</h3>
            <button className="modal-close-x" onClick={() => setIsRulesModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <p className="modal-intro-text">Please read carefully before continuing.</p>
            <div className="conditions-list" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <div className="condition-item">
                <span className="condition-num">1</span>
                <div className="condition-desc">
                  <strong>Chamka Trading is strictly prohibited.</strong>
                  <p>Any artificial, manipulative, collusive, circular, non-genuine, or platform-exploiting trading activity intended to generate unfair gains, rankings, rewards, incentives, rebates, referrals, competition results, or account performance is prohibited.</p>
                </div>
              </div>
              <div className="condition-item">
                <span className="condition-num">2</span>
                <div className="condition-desc">
                  <strong>Maximum Position Holding Period</strong>
                  <p>No position may be carried forward for more than three (3) trading days. Users wishing to continue a market view must close the existing position and initiate a new position.</p>
                </div>
              </div>
              <div className="condition-item">
                <span className="condition-num">3</span>
                <div className="condition-desc">
                  <strong>High-Frequency Trading (HFT) Prohibited</strong>
                  <p>High-frequency trading, excessive order placement, rapid-fire trading, algorithmic trading, latency exploitation, quote stuffing, excessive scalping, or similar behavior is prohibited.</p>
                </div>
              </div>
              <div className="condition-item">
                <span className="condition-num">4</span>
                <div className="condition-desc">
                  <strong>Minimum Trade Interval</strong>
                  <p>A minimum gap of two (2) minutes must be maintained between consecutive trades.</p>
                </div>
              </div>
              <div className="condition-item">
                <span className="condition-num">5</span>
                <div className="condition-desc">
                  <strong>Artificial Volume Generation Prohibited</strong>
                  <p>Users may not place trades solely to generate turnover, activity, rankings, incentives, rewards, or competition points.</p>
                </div>
              </div>
              <div className="condition-item">
                <span className="condition-num">6</span>
                <div className="condition-desc">
                  <strong>Excessive Churning Prohibited</strong>
                  <p>Repeated entry and exit of positions without genuine market rationale may be treated as abusive trading activity.</p>
                </div>
              </div>
              <div className="condition-item">
                <span className="condition-num">7</span>
                <div className="condition-desc">
                  <strong>Platform Exploitation Prohibited</strong>
                  <p>Users may not exploit pricing errors, technical glitches, delayed feeds, software bugs, calculation anomalies, latency differences, system vulnerabilities, or unintended platform behavior.</p>
                </div>
              </div>
            </div>
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.85rem', color: '#475569', fontWeight: 500 }}>
              <input type="checkbox" id="rules-agree" style={{ marginTop: '3px' }} defaultChecked />
              <label htmlFor="rules-agree">I have read, understood, and agree to the Trading Rules, Fair Usage Policy, and Code of Conduct.</label>
            </div>
          </div>
          <div className="modal-footer">
            <button className="modal-btn confirm" style={{ width: '100%', textTransform: 'uppercase' }} onClick={() => setIsRulesModalOpen(false)}>[ I AGREE & CONTINUE ]</button>
          </div>
        </div>
      </div>

      {/* 5. Custom Alert / Success Modal (Professional Minimal) */}
      <div className={`scalper-modal-overlay ${isAlertModalOpen ? 'active' : ''}`} onClick={() => setIsAlertModalOpen(false)}>
        <div className="scalper-modal-card" onClick={e => e.stopPropagation()} style={{ padding: 0, borderRadius: '16px', overflow: 'hidden', maxWidth: '340px' }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              {alertModalContent?.title || 'Notice'}
            </h3>
            <button onClick={() => setIsAlertModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', color: '#94a3b8', cursor: 'pointer', padding: '0 4px' }}>✕</button>
          </div>

          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {alertModalContent?.bullets.map((bullet, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{
                    minWidth: '20px', height: '20px', background: '#22c55e', borderRadius: '6px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white',
                    fontSize: '0.75rem', marginTop: '1px'
                  }}>
                    <i className="fas fa-check"></i>
                  </div>
                  <div style={{ color: '#334155', fontSize: '0.95rem', fontWeight: 500, lineHeight: '1.4' }}>
                    {bullet.replace('• ', '')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: '0 24px 24px 24px' }}>
            <button onClick={() => setIsAlertModalOpen(false)} style={{
              width: '100%', padding: '14px', background: '#0f172a', color: 'white',
              border: 'none', borderRadius: '10px', fontSize: '0.95rem', fontWeight: 600,
              cursor: 'pointer'
            }}>
              OK
            </button>
          </div>

        </div>
      </div>

    </div>
  );
}
