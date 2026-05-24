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

export default function ScalperSettingsPage() {
  useAuth();
  const router = useRouter();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [segments, setSegments] = useState<SegmentSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleConfirmNormal = () => {
    setIsModalOpen(false);
    router.push('/margin-settings');
  };

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
          // Sort segments by name and side
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

  return (
    <div className={`app-container ${theme}`}>
      {/* Header */}
      <div className="app-header" style={{ padding: '20px 16px', background: 'var(--bg-surface)' }}>
        <div className="header-top" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
          <div className="logo-area" style={{ display: 'flex', alignItems: 'center' }}>
            <Link href="/" className="back-button">
              <i className="fas fa-arrow-left"></i>
            </Link>
            <div className="logo-text" style={{ marginLeft: '12px', fontSize: '1.2rem', fontWeight: 800 }}>
              Scalper Settings
            </div>
          </div>
          <button className="scalper-trigger-btn" onClick={() => setIsModalOpen(true)}>
            NORMAL SETTINGS
            <span style={{ fontSize: '0.75rem' }}>→</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="scalper-settings-content">
        <div className="scalper-intro">
          <i className="fas fa-bolt info-icon"></i>
          <p>
            Scalper Mode is active. High-frequency execution parameter safeguards are being applied directly from the liquidity node.
          </p>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="premium-spinner"></div>
            <p>Fetching your customized scalper profile...</p>
          </div>
        ) : segments.length === 0 ? (
          <div className="empty-container">
            <i className="fas fa-sliders-h empty-icon"></i>
            <h3>No Allowed Segments</h3>
            <p>
              Your administrator hasn't configured any segments for your profile yet. Please contact support.
            </p>
          </div>
        ) : (
          <div className="segments-list">
            {segments.map((item) => {
              const isBuy = item.side.toUpperCase() === 'BUY';
              const isAllowed = item.trade_allowed;
              
              return (
                <div 
                  key={item.id} 
                  className={`segment-premium-card ${isBuy ? 'side-buy' : 'side-sell'} ${!isAllowed ? 'trade-blocked' : ''}`}
                >
                  {/* Header Row */}
                  <div className="card-top-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 className="segment-label">{item.segment.toUpperCase()}</h3>
                      <span className={`badge-transaction ${isBuy ? 'buy' : 'sell'}`}>
                        {item.side.toUpperCase()}
                      </span>
                    </div>
                    <span className="scalper-card-active-badge">ACTIVE</span>
                  </div>

                  {/* Category 1: EXECUTION CONTROL */}
                  <div className="settings-section">
                    <div className="section-title-faint">SCALPER EXECUTION CONTROL</div>
                    <div className="segment-details-grid">
                      <div className="detail-item">
                        <span className="detail-label">Scalper Engine</span>
                        <span className="detail-value text-active">
                          {isAllowed ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Auto Exit Buffer</span>
                        <span className="detail-value">15 seconds</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Tick Refresh Speed</span>
                        <span className="detail-value">100ms</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Routing Gateway</span>
                        <span className="detail-value">Direct Liquidity Node</span>
                      </div>
                    </div>
                  </div>

                  {/* Category 2: RISK CONTROL CEILINGS */}
                  <div className="settings-section">
                    <div className="section-title-faint">SAFETY RISK CEILINGS</div>
                    <div className="segment-details-grid">
                      <div className="detail-item">
                        <span className="detail-label">Max Orders Per Minute</span>
                        <span className="detail-value">12 / min</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Max Slippage Tolerance</span>
                        <span className="detail-value">0.05%</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Pre-configured Lot Multiplier</span>
                        <span className="detail-value">2x Multiplier</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Execution Guard Buffer</span>
                        <span className="detail-value">Active</span>
                      </div>
                    </div>
                  </div>

                  {/* Category 3: SYSTEM RISK TIMERS */}
                  <div className="settings-section">
                    <div className="section-title-faint">AUTO TARGETS & TRAILING TRIGGERS</div>
                    <div className="segment-details-grid">
                      <div className="detail-item">
                        <span className="detail-label">Trailing Profit Trigger</span>
                        <span className="detail-value">+0.50%</span>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">Hard Risk Stop Loss</span>
                        <span className="detail-value">-0.25%</span>
                      </div>
                    </div>
                  </div>

                  {/* Warning overlay if blocked */}
                  {!isAllowed && (
                    <div className="blocked-overlay">
                      <div className="blocked-content">
                        <i className="fas fa-lock"></i>
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

      {/* Return to Normal Settings Confirmation Modal */}
      {isModalOpen && (
        <div className="scalper-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}>
          <div className="scalper-modal-card">
            <div className="modal-header">
              <h3 className="modal-title">Return to Standard Settings</h3>
              <button className="modal-close-x" onClick={() => setIsModalOpen(false)}>✕</button>
            </div>
            
            <div className="modal-body">
              <p className="modal-intro-text">
                Please confirm if you want to deactivate high-frequency Scalper Mode and switch your active trading profile parameters back to normal:
              </p>
              
              <div className="conditions-list">
                <div className="condition-item">
                  <span className="condition-num">1</span>
                  <div className="condition-desc">
                    <strong>Standard Risk Control Settings</strong>
                    <p>Trading leverages, Strike Range rules, and Max Order Lot ceilings will return to the system administrator's original configurations.</p>
                  </div>
                </div>
                
                <div className="condition-item">
                  <span className="condition-num">2</span>
                  <div className="condition-desc">
                    <strong>Standard Routing Gateway</strong>
                    <p>Deactivates direct liquidity-node gateways. Orders will be routed using standard execution buffers.</p>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={() => setIsModalOpen(false)}>
                Cancel
              </button>
              <button className="modal-btn confirm" onClick={handleConfirmNormal}>
                Confirm & Proceed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
