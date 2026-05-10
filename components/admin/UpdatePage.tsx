'use client';
import React, { useState } from 'react';
import UpdateProfile from './update/UpdateProfile';
import UpdateSegments from './update/UpdateSegments';
import UpdateLedger from './update/UpdateLedger';
import UpdateCopySettings from './update/UpdateCopySettings';
import UpdateBlockScripts from './update/UpdateBlockScripts';
import UpdateNotifications from './update/UpdateNotifications';
import UpdateMultipleSettings from './update/UpdateMultipleSettings';

type UpdateTab = 'profile' | 'segments' | 'ledger' | 'copy_settings' | 'block_scripts' | 'notifications' | 'multiple_settings';

export type SegSettings = {
  commissionType: string; commissionValue: string;
  profitHoldSec: string; loss_hold_sec: string;
  strikeRange: string; maxLot: string;
  maxOrderLot: string; intradayLeverage: string;
  intradayType: string;
  holdingLeverage: string; entryBuffer: string;
  holdingType: string;
  exitBuffer: string; tradeAllowed: boolean;
};

const EmptyState = ({ message, onOpen }: { message: string, onOpen?: () => void }) => (
  <div style={{ color: '#8b949e', padding: 20, display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'flex-start' }}>
    <div>{message}</div>
    {onOpen && (
      <button onClick={onOpen} className="adm-btn-primary" style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '6px' }}>
        Select User
      </button>
    )}
  </div>
);

export default function UpdatePage({ selectedUser, onOpenUserPanel }: { selectedUser?: { id: string; role: string }, onOpenUserPanel?: () => void }) {
  const [activeTab, setActiveTab] = useState<UpdateTab>('profile');

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'profile':
        return selectedUser?.id ? <UpdateProfile selectedUser={selectedUser as any} /> : <EmptyState message="Please select a user first to edit their profile." onOpen={onOpenUserPanel} />;
      case 'segments':
        return selectedUser?.id ? <UpdateSegments selectedUser={selectedUser as any} /> : <EmptyState message="Please select a user first to configure their segments." onOpen={onOpenUserPanel} />;
      case 'ledger':
        return selectedUser?.id ? <UpdateLedger selectedUser={selectedUser as any} /> : <EmptyState message="Please select a user first to update their ledger." onOpen={onOpenUserPanel} />;
      case 'copy_settings':
        return <UpdateCopySettings selectedUser={selectedUser} />;
      case 'block_scripts':
        return selectedUser?.id ? <UpdateBlockScripts selectedUser={selectedUser as any} /> : <EmptyState message="Please select a user first to block their scripts." onOpen={onOpenUserPanel} />;
      case 'notifications':
        return <UpdateNotifications selectedUser={selectedUser} />;
      case 'multiple_settings':
        return <UpdateMultipleSettings selectedUser={selectedUser} />;
      default:
        return selectedUser?.id ? <UpdateProfile selectedUser={selectedUser as any} /> : <EmptyState message="Please select a user first." onOpen={onOpenUserPanel} />;
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)' }}>
      {/* Update Settings Sidebar */}
      <div style={{ 
        width: '240px', 
        borderRight: '1px solid #30363d', 
        display: 'flex', 
        flexDirection: 'column',
        padding: '20px 0'
      }}>
        <div style={{ padding: '0 20px 20px 20px', borderBottom: '1px solid #30363d', marginBottom: '20px' }}>
          <h2 style={{ color: '#e6edf3', fontSize: '18px', fontWeight: 600, margin: '0 0 8px 0' }}>
            Update User
          </h2>
          <div style={{ 
            color: '#8b949e', 
            fontSize: '13px', 
            background: '#161b22', 
            padding: '6px 10px', 
            borderRadius: '6px',
            fontFamily: 'monospace',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <span>{selectedUser?.id ? selectedUser.id : 'No User'}</span>
            {onOpenUserPanel && (
              <button 
                onClick={onOpenUserPanel} 
                style={{ 
                  background: 'transparent', 
                  border: 'none', 
                  color: '#4493f8', 
                  fontSize: '12px', 
                  cursor: 'pointer', 
                  padding: 0 
                }}>
                Change
              </button>
            )}
          </div>
        </div>
        
        <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '0 12px' }}>
          <SidebarButton 
            active={activeTab === 'profile'} 
            onClick={() => setActiveTab('profile')}
            label="User Profile"
          />
          <SidebarButton 
            active={activeTab === 'segments'} 
            onClick={() => setActiveTab('segments')}
            label="Segment Config"
          />
          <SidebarButton 
            active={activeTab === 'ledger'} 
            onClick={() => setActiveTab('ledger')}
            label="Ledger Update"
          />
          <SidebarButton 
            active={activeTab === 'copy_settings'} 
            onClick={() => setActiveTab('copy_settings')}
            label="Copy Settings"
          />
          <SidebarButton 
            active={activeTab === 'block_scripts'} 
            onClick={() => setActiveTab('block_scripts')}
            label="Block Scripts"
          />
          <SidebarButton 
            active={activeTab === 'notifications'} 
            onClick={() => setActiveTab('notifications')}
            label="Send Notification"
          />
          <SidebarButton 
            active={activeTab === 'multiple_settings'} 
            onClick={() => setActiveTab('multiple_settings')}
            label="Bulk Updates"
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
