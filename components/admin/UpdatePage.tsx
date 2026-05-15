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
        return selectedUser?.id ? <UpdateProfile selectedUser={selectedUser} /> : <EmptyState message="Please select a user first to edit their profile." onOpen={onOpenUserPanel} />;
      case 'segments':
        return selectedUser?.id ? <UpdateSegments selectedUser={selectedUser} /> : <EmptyState message="Please select a user first to configure their segments." onOpen={onOpenUserPanel} />;
      case 'ledger':
        return selectedUser?.id ? <UpdateLedger selectedUser={selectedUser} /> : <EmptyState message="Please select a user first to update their ledger." onOpen={onOpenUserPanel} />;
      case 'copy_settings':
        return <UpdateCopySettings selectedUser={selectedUser} />;
      case 'block_scripts':
        return selectedUser?.id ? <UpdateBlockScripts selectedUser={selectedUser} /> : <EmptyState message="Please select a user first to block their scripts." onOpen={onOpenUserPanel} />;
      case 'notifications':
        return <UpdateNotifications selectedUser={selectedUser} />;
      case 'multiple_settings':
        return <UpdateMultipleSettings selectedUser={selectedUser} />;
      default:
        return selectedUser?.id ? <UpdateProfile selectedUser={selectedUser} /> : <EmptyState message="Please select a user first." onOpen={onOpenUserPanel} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
      {/* User selector row - above tabs */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderBottom: '1px solid #30363d', flexShrink: 0
      }}>
        <span style={{ color: '#e6edf3', fontSize: '13px', fontWeight: 600 }}>Update User</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#8b949e', fontSize: '12px', fontFamily: 'monospace' }}>
            {selectedUser?.id ? selectedUser.id.slice(0, 12) + '...' : 'No User'}
          </span>
          {onOpenUserPanel && (
            <button onClick={onOpenUserPanel} style={{ background: '#161b22', border: '1px solid #30363d', color: '#4493f8', fontSize: '12px', cursor: 'pointer', padding: '4px 10px', borderRadius: '6px' }}>
              Change
            </button>
          )}
        </div>
      </div>

      {/* Horizontal scrollable tabs */}
      <div style={{
        display: 'flex', flexDirection: 'row', overflowX: 'auto',
        borderBottom: '1px solid #30363d', padding: '8px 12px', gap: '4px',
        flexShrink: 0, scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        <SidebarButton active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} label="Profile" />
        <SidebarButton active={activeTab === 'segments'} onClick={() => setActiveTab('segments')} label="Segments" />
        <SidebarButton active={activeTab === 'ledger'} onClick={() => setActiveTab('ledger')} label="Ledger" />
        <SidebarButton active={activeTab === 'copy_settings'} onClick={() => setActiveTab('copy_settings')} label="Copy" />
        <SidebarButton active={activeTab === 'block_scripts'} onClick={() => setActiveTab('block_scripts')} label="Block" />
        <SidebarButton active={activeTab === 'notifications'} onClick={() => setActiveTab('notifications')} label="Notify" />
        <SidebarButton active={activeTab === 'multiple_settings'} onClick={() => setActiveTab('multiple_settings')} label="Bulk" />
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, padding: '16px', overflowY: 'auto', backgroundColor: '#0d1117' }}>
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
        padding: '6px 12px',
        textAlign: 'center',
        background: active ? '#1f2937' : 'transparent',
        border: active ? '1px solid #374151' : '1px solid transparent',
        borderRadius: '6px',
        color: active ? '#e6edf3' : '#8b949e',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        fontSize: '12px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'all 0.2s ease'
      }}
    >
      {label}
    </button>
  );
}
