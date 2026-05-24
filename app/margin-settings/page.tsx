'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
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

export default function MarginSettingsPage() {
  useAuth();
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [segments, setSegments] = useState<SegmentSetting[]>([]);
  const [loading, setLoading] = useState(true);

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

  // Determine icon based on segment name
  const getSegmentIcon = (segmentName: string) => {
    const name = segmentName.toLowerCase();
    if (name.includes('comex') || name.includes('gold') || name.includes('silver')) {
      return 'fas fa-coins';
    }
    if (name.includes('forex') || name.includes('fx') || name.includes('currency')) {
      return 'fas fa-globe';
    }
    if (name.includes('mcx') || name.includes('crude') || name.includes('commodity')) {
      return 'fas fa-fire-alt';
    }
    if (name.includes('option')) {
      return 'fas fa-chart-pie';
    }
    if (name.includes('nse') || name.includes('equity') || name.includes('stock')) {
      return 'fas fa-chart-line';
    }
    return 'fas fa-wallet';
  };

  // Format commission type strictly as per crore or per lot without underscore
  const formatCommissionType = (type: string) => {
    if (!type) return 'per crore';
    return type.toLowerCase().replace(/[_-]/g, ' ');
  };

  return (
    <div className={`app-container ${theme}`}>
      {/* Header */}
      <div className="app-header" style={{ padding: '20px 16px', background: 'var(--bg-surface)' }}>
        <div className="header-top" style={{ display: 'flex', alignItems: 'center', marginBottom: 0 }}>
          <div className="logo-area" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
            <Link href="/" className="back-button">
              <i className="fas fa-arrow-left"></i>
            </Link>
            <div className="logo-text" style={{ marginLeft: '12px', fontSize: '1.2rem', fontWeight: 800 }}>
              Margin Settings
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="margin-settings-content">
        {/* Info/Intro Alert Section */}
        <div className="margin-intro">
          <i className="fas fa-info-circle info-icon"></i>
          <p>
            Your trading segments, leverages, limits, and commission rules are custom configured by the system administrator.
          </p>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="premium-spinner"></div>
            <p>Fetching your customized margin profile...</p>
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
                  {/* Card Glow Border Accent */}
                  <div className="card-accent-glow"></div>

                  {/* Header Row */}
                  <div className="card-top-header">
                    <div className="segment-left-header">
                      <div className="segment-symbol-icon">
                        <i className={getSegmentIcon(item.segment)}></i>
                      </div>
                      <h3 className="segment-label">
                        {item.segment.toUpperCase()}-{item.side.toUpperCase()}
                      </h3>
                    </div>
                  </div>

                  {/* Details Grid - Exactly 10 Items (including Hold Timers) */}
                  <div className="segment-details-grid">
                    
                    {/* 1. Trading Allowed */}
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fas fa-toggle-on"></i> Trading Allowed
                      </span>
                      <span className={`detail-value ${isAllowed ? 'value-active' : 'value-inactive'}`}>
                        {isAllowed ? 'Yes' : 'No'}
                      </span>
                    </div>

                    {/* 2. Intraday Leverage */}
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fas fa-bolt"></i> Intraday Leverage
                      </span>
                      <span className="detail-value">{item.intraday_leverage}</span>
                    </div>

                    {/* 3. Holding Leverage */}
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fas fa-briefcase"></i> Holding Leverage
                      </span>
                      <span className="detail-value">{item.holding_leverage}</span>
                    </div>

                    {/* 4. Strike Range */}
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fas fa-bullseye"></i> Strike Range
                      </span>
                      <span className="detail-value">{item.strike_range || '0'}</span>
                    </div>

                    {/* 5. Max Lot */}
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fas fa-expand-arrows-alt"></i> Max Lot
                      </span>
                      <span className="detail-value">{item.max_lot}</span>
                    </div>

                    {/* 6. Max Order Lot */}
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fas fa-shopping-cart"></i> Max Order Lot
                      </span>
                      <span className="detail-value">{item.max_order_lot}</span>
                    </div>

                    {/* 7. Commission Type */}
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fas fa-calculator"></i> Commission Type
                      </span>
                      <span className="detail-value">{formatCommissionType(item.commission_type)}</span>
                    </div>

                    {/* 8. Commission Value */}
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fas fa-coins"></i> Commission Value
                      </span>
                      <span className="detail-value text-highlight">{item.commission_value}</span>
                    </div>

                    {/* 9. Min Hold Profit (Hold Timer) */}
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fas fa-history"></i> Min Hold Profit
                      </span>
                      <span className="detail-value">
                        {item.profit_hold_sec ? `${item.profit_hold_sec}s` : 'None'}
                      </span>
                    </div>

                    {/* 10. Min Hold Loss (Hold Timer) */}
                    <div className="detail-item">
                      <span className="detail-label">
                        <i className="fas fa-hourglass-half"></i> Min Hold Loss
                      </span>
                      <span className="detail-value">
                        {item.loss_hold_sec ? `${item.loss_hold_sec}s` : 'None'}
                      </span>
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
    </div>
  );
}
