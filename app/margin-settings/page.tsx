'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import './page.css';

// Mock Data for Margin Segments
const marginSegments = [
  {
    id: 1,
    name: 'Equity Intraday (MIS)',
    icon: 'fas fa-bolt',
    leverage: '5x Leverage',
    marginReq: '20% Required',
    note: 'Auto-square off at 3:15 PM',
    colorClass: 'equity-mis'
  },
  {
    id: 2,
    name: 'Equity Delivery (CNC)',
    icon: 'fas fa-briefcase',
    leverage: '1x Leverage',
    marginReq: '100% Required',
    note: 'Full margin required for overnight holding',
    colorClass: 'equity-cnc'
  },
  {
    id: 3,
    name: 'Options Buying',
    icon: 'fas fa-chart-pie',
    leverage: '1x Leverage',
    marginReq: '100% Required',
    note: 'Full premium required',
    colorClass: 'options-buy'
  },
  {
    id: 4,
    name: 'Options Selling',
    icon: 'fas fa-shield-alt',
    leverage: '1x (NRML) / 1x (MIS)',
    marginReq: 'SPAN + Exposure',
    note: 'High margin required to cover risk',
    colorClass: 'options-sell'
  },
  {
    id: 5,
    name: 'Futures (NRML)',
    icon: 'fas fa-chart-line',
    leverage: '1x Leverage',
    marginReq: 'SPAN + Exposure',
    note: 'Standard exchange margin required',
    colorClass: 'futures'
  },
  {
    id: 6,
    name: 'Commodities (MCX)',
    icon: 'fas fa-gem',
    leverage: '1x Leverage',
    marginReq: 'SPAN + Exposure',
    note: 'Silver/Gold requires ~10-12% margin',
    colorClass: 'commodity'
  },
  {
    id: 7,
    name: 'Crypto Futures',
    icon: 'fab fa-bitcoin',
    leverage: '10x Leverage',
    marginReq: '10% Required',
    note: 'Highly volatile, strict liquidation',
    colorClass: 'crypto'
  }
];

export default function MarginSettingsPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const savedTheme = localStorage.getItem('marginApexTheme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
      document.body.classList.toggle('dark', savedTheme === 'dark');
    }
  }, []);

  return (
    <div className={`app-container ${theme}`}>
      <div className="app-header" style={{ padding: '20px 16px', background: 'var(--bg-surface)' }}>
        <div className="header-top" style={{ display: 'flex', alignItems: 'center', marginBottom: 0 }}>
          <div className="logo-area" style={{ flex: 1 }}>
            <Link href="/" className="back-button">
              <i className="fas fa-arrow-left"></i>
            </Link>
            <div className="logo-text" style={{ marginLeft: '12px', fontSize: '1.2rem' }}>Margin Policies</div>
          </div>
        </div>
      </div>

      <div className="margin-settings-content">
        <div className="margin-intro">
          <i className="fas fa-info-circle info-icon"></i>
          <p>Margin requirements and leverage limits are determined by the exchange and system admin. These values affect your active buying power.</p>
        </div>

        <div className="segments-list">
          {marginSegments.map((segment) => (
            <div key={segment.id} className={`margin-card ${segment.colorClass}`}>
              <div className="margin-card-header">
                <div className="segment-icon">
                  <i className={segment.icon}></i>
                </div>
                <div className="segment-title">{segment.name}</div>
              </div>
              <div className="margin-card-body">
                <div className="leverage-badge">
                  <i className="fas fa-rocket"></i> {segment.leverage}
                </div>
                <div className="margin-req">
                  <span className="req-label">Margin Required:</span>
                  <span className="req-value">{segment.marginReq}</span>
                </div>
              </div>
              {segment.note && (
                <div className="margin-card-footer">
                  <i className="fas fa-clock"></i> {segment.note}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
