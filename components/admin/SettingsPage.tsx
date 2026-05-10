'use client';
import React, { useState } from 'react';
import SettingsScripts from './settings/SettingsScripts';
import SettingsTradingHours from './settings/SettingsTradingHours';
import SettingsCurrency from './settings/SettingsCurrency';
import SettingsApp from './settings/SettingsApp';
import SettingsBroadcaster from './settings/SettingsBroadcaster';

type SettingsTab = 'scripts' | 'trading_hours' | 'currency' | 'app' | 'broadcaster';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('scripts');

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'scripts':
        return <SettingsScripts />;
      case 'trading_hours':
        return <SettingsTradingHours />;
      case 'currency':
        return <SettingsCurrency />;
      case 'app':
        return <SettingsApp />;
      case 'broadcaster':
        return <SettingsBroadcaster />;
      default:
        return <SettingsScripts />;
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
      {/* Settings Sidebar */}
      <div style={{ 
        width: '240px', 
        borderRight: '1px solid #30363d', 
        display: 'flex', 
        flexDirection: 'column',
        padding: '20px 0'
      }}>
        <h2 style={{ 
          margin: '0 0 20px 20px', 
          color: '#e6edf3', 
          fontSize: '18px',
          fontWeight: 600 
        }}>
          System Settings
        </h2>
        
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 12px' }}>
          <SidebarButton 
            active={activeTab === 'scripts'} 
            onClick={() => setActiveTab('scripts')}
            label="Script Settings"
          />
          <SidebarButton 
            active={activeTab === 'trading_hours'} 
            onClick={() => setActiveTab('trading_hours')}
            label="Trading Hours"
          />
          <SidebarButton 
            active={activeTab === 'currency'} 
            onClick={() => setActiveTab('currency')}
            label="Currency Settings"
          />
          <SidebarButton 
            active={activeTab === 'app'} 
            onClick={() => setActiveTab('app')}
            label="App Settings"
          />
          <SidebarButton 
            active={activeTab === 'broadcaster'} 
            onClick={() => setActiveTab('broadcaster')}
            label="Broadcaster"
          />
        </nav>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', backgroundColor: '#0d1117' }}>
        {renderActiveTab()}
      </div>
    </div>
  );
}

function SidebarButton({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 16px',
        textAlign: 'left',
        background: active ? '#1f2937' : 'transparent',
        border: 'none',
        borderRadius: '6px',
        color: active ? '#e6edf3' : '#8b949e',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        fontSize: '14px',
        transition: 'all 0.2s ease'
      }}
      onMouseOver={(e) => {
        if (!active) e.currentTarget.style.background = '#161b22';
        e.currentTarget.style.color = '#e6edf3';
      }}
      onMouseOut={(e) => {
        if (!active) {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = '#8b949e';
        }
      }}
    >
      {label}
    </button>
  );
}
