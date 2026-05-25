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
  profit_hold_sec: number;
  loss_hold_sec: number;
  entry_buffer: number;
  exit_buffer: number;
}

export default function UnifiedSettingsPage() {
  useAuth();
  const router = useRouter();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [segments, setSegments] = useState<SegmentSetting[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState<'normal' | 'scalper'>('normal');
  const [isChoiceModalOpen, setIsChoiceModalOpen] = useState(false);
  const [isGoToScalperModalOpen, setIsGoToScalperModalOpen] = useState(false);
  const [isGoToNormalModalOpen, setIsGoToNormalModalOpen] = useState(false);
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('marginApexTheme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.body.classList.toggle('dark', savedTheme === 'dark');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSession().then(async (session) => {
      if (cancelled) return;
      if (!session) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('/api/user/segments', {
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
  }, []);

  const formatCommissionType = (type: string) => {
    if (!type) return 'per crore';
    return type.toLowerCase().replace(/[_-]/g, ' ');
  };

  const handleChooseNormal = () => {
    setIsChoiceModalOpen(false);
    if (activeTab === 'scalper') {
      setIsGoToNormalModalOpen(true);
    } else {
      alert("You are already in Normal Mode.");
    }
  };

  const handleChooseScalper = () => {
    setIsChoiceModalOpen(false);
    if (activeTab === 'normal') {
      setIsGoToScalperModalOpen(true);
    } else {
      alert("You are already in Scalper Mode. 48-hour lock is active.");
    }
  };

  const confirmScalperMode = () => {
    setIsGoToScalperModalOpen(false);
    setActiveTab('scalper');
    alert("Scalper Mode Activated!\n\n• Brokerage increased to ₹85/crore\n• Auto-exit timer: 15 seconds\n• 48-hour lock period started");
  };

  const confirmNormalMode = () => {
    setIsGoToNormalModalOpen(false);
    setActiveTab('normal');
    alert("Normal Mode Activated!\n\n• Brokerage reduced to ₹20/crore\n• Standard execution timing restored");
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
              Normal Mode
            </button>
            <button 
              className={`rect-toggle-btn ${activeTab === 'scalper' ? 'active-toggle' : ''}`} 
              onClick={() => setActiveTab('scalper')}
            >
              Scalper Mode
            </button>
          </div>
        </div>
        <div className="header-row-bottom">
          <span className="instruction-label">Choose your margin settings</span>
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
                      </div>
                    </div>

                    <div className="settings-section">
                      <div className="section-title-faint">TRADING & COMMISSIONS</div>
                      <div className="segment-details-grid">
                        <div className="detail-item"><span className="detail-label">Trading Allowed</span><span className="detail-value">{item.trade_allowed ? 'Yes' : 'No'}</span></div>
                        <div className="detail-item"><span className="detail-label">Commission Type</span><span className="detail-value">{formatCommissionType(item.commission_type)}</span></div>
                        <div className="detail-item"><span className="detail-label">Commission Value</span><span className="detail-value">{item.commission_value}</span></div>
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
                      <div className="section-title-faint">SCALPER EXECUTION CONTROL</div>
                      <div className="segment-details-grid">
                        <div className="detail-item"><span className="detail-label">Scalper Engine</span><span className={`detail-value ${isAllowed ? 'text-active' : ''}`}>{isAllowed ? 'ENABLED' : 'DISABLED'}</span></div>
                        <div className="detail-item"><span className="detail-label">Auto Exit Buffer</span><span className="detail-value">{item.exit_buffer || 15} seconds</span></div>
                        <div className="detail-item"><span className="detail-label">Tick Refresh Speed</span><span className="detail-value">100ms</span></div>
                        <div className="detail-item"><span className="detail-label">Routing Gateway</span><span className="detail-value">Direct Liquidity Node</span></div>
                      </div>
                    </div>

                    <div className="settings-section">
                      <div className="section-title-faint">SAFETY RISK CEILINGS</div>
                      <div className="segment-details-grid">
                        <div className="detail-item"><span className="detail-label">Max Orders Per Minute</span><span className="detail-value">12 / min</span></div>
                        <div className="detail-item"><span className="detail-label">Max Slippage Tolerance</span><span className="detail-value">0.05%</span></div>
                        <div className="detail-item"><span className="detail-label">Pre-configured Lot Multiplier</span><span className="detail-value">2x Multiplier</span></div>
                        <div className="detail-item"><span className="detail-label">Execution Guard Buffer</span><span className="detail-value">Active</span></div>
                      </div>
                    </div>

                    <div className="settings-section">
                      <div className="section-title-faint">AUTO TARGETS & TRAILING TRIGGERS</div>
                      <div className="segment-details-grid">
                        <div className="detail-item"><span className="detail-label">Trailing Profit Trigger</span><span className="detail-value">+0.50%</span></div>
                        <div className="detail-item"><span className="detail-label">Hard Risk Stop Loss</span><span className="detail-value">-0.25%</span></div>
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
                <li>Low Brokerage - ₹20 per crore (equity) / ₹15 per lot (options)</li>
                <li>High Profit Hold Time - Hold positions until EOD (3:20 PM)</li>
                <li>Standard execution speed (~250ms)</li>
                <li>No lock-in period on mode switching</li>
              </ul>
            </div>
            
            <div className="mode-option-card" onClick={handleChooseScalper}>
              <div className="mode-option-title">Scalper Mode</div>
              <ul className="mode-feature-list">
                <li>High Brokerage - ₹85 per crore (equity) + 40% surcharge on options</li>
                <li>Low Profit Hold Time - Auto-exit after 15 seconds (equity) / 10 seconds (options)</li>
                <li>Ultra-fast execution (~45ms) with direct liquidity routing</li>
                <li>48-hour lock period - Cannot switch back to Normal for 48 hours</li>
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
              <div className="condition-item"><span className="condition-num">1</span><div className="condition-desc"><strong>Direct High-Speed Routing</strong><p>Scalper trades bypass standard order buffers for millisecond execution. This might increase immediate market fill risk.</p></div></div>
              <div className="condition-item"><span className="condition-num">2</span><div className="condition-desc"><strong>High Frequency Safety Limits</strong><p>Accounts under scalper mode are subject to a strict safety ceiling of max 12 orders per minute to protect your margin.</p></div></div>
              <div className="condition-item"><span className="condition-num">3</span><div className="condition-desc"><strong>Mandatory Auto-Exit Liability</strong><p>Auto-exit safety timers execute market-level orders. BFO/NFO slippages during automatic exits are the sole liability of the trader.</p></div></div>
              <div className="condition-item"><span className="condition-num">4</span><div className="condition-desc"><strong>Locked Trailing Stop-Loss</strong><p>Stop-losses are calculated on tick-level updates. Trailing stop-loss triggers cannot be modified while an active position is open.</p></div></div>
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
            <h3 className="modal-title">Trading Rules & Regulations</h3>
            <button className="modal-close-x" onClick={() => setIsRulesModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <p className="modal-intro-text">Official trading guidelines for both Margin and Scalper modes:</p>
            <div className="conditions-list">
              <div className="condition-item"><span className="condition-num">1</span><div className="condition-desc"><strong>Standard Margin Rules</strong><p>Intraday leverage up to 5x. Minimum margin requirements must be maintained. Positions auto-square off at market close.</p></div></div>
              <div className="condition-item"><span className="condition-num">2</span><div className="condition-desc"><strong>Scalper HFT Rules</strong><p>Maximum 12 orders per minute. Auto-exit at 15 seconds for equity, 10 seconds for options. Direct routing with millisecond execution.</p></div></div>
              <div className="condition-item"><span className="condition-num">3</span><div className="condition-desc"><strong>Risk Management</strong><p>Stop-loss is mandatory for all positions. Maximum slippage tolerance 0.05% in scalper mode. System may square off if margin falls below requirement.</p></div></div>
              <div className="condition-item"><span className="condition-num">4</span><div className="condition-desc"><strong>Liability Clause</strong><p>All trades are at trader's own risk. Auto-exit market orders may incur slippage. Platform not liable for high-frequency execution losses.</p></div></div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="modal-btn confirm" onClick={() => setIsRulesModalOpen(false)}>I Understand</button>
          </div>
        </div>
      </div>

    </div>
  );
}
