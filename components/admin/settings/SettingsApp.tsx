'use client';
import React, { useState } from 'react';
import { Toast, ToastState } from '../AdminUtils';

export default function SettingsApp() {
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [globalKillSwitch, setGlobalKillSwitch] = useState(false);
  const [allowNewRegistrations, setAllowNewRegistrations] = useState(true);
  
  const [toast, setToast] = useState<ToastState>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const handleSave = async () => {
    setSaveLoading(true);
    // TODO: Implement actual API call to save app settings
    setTimeout(() => {
      setToast({ message: 'App settings saved successfully', type: 'success' });
      setSaveLoading(false);
    }, 800);
  };

  return (
    <div className="adm-set-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      
      <div className="adm-mw-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 className="adm-page-title" style={{ margin: 0 }}>App Settings</h2>
          <p style={{ margin: '4px 0 0', color: '#8b949e', fontSize: '13px' }}>Platform-wide toggles and general configurations.</p>
        </div>
      </div>

      <div className="adm-card" style={{ maxWidth: 600, padding: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 24, color: '#e6edf3', fontSize: '16px', paddingBottom: 12, borderBottom: '1px solid #30363d' }}>Global Toggles</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Maintenance Mode */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 'bold', color: '#e6edf3', marginBottom: 4 }}>Maintenance Mode</div>
              <div style={{ color: '#8b949e', fontSize: '13px' }}>Shows a maintenance page to all users. Admins can still log in.</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={maintenanceMode} 
                onChange={(e) => setMaintenanceMode(e.target.checked)}
                style={{ accentColor: '#10b981', width: '20px', height: '20px' }}
              />
            </label>
          </div>

          {/* Global Kill Switch */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 'bold', color: '#f43f5e', marginBottom: 4 }}>Global Trading Kill Switch</div>
              <div style={{ color: '#8b949e', fontSize: '13px' }}>Emergency! Instantly disables all new order placement across the entire platform.</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={globalKillSwitch} 
                onChange={(e) => setGlobalKillSwitch(e.target.checked)}
                style={{ accentColor: '#f43f5e', width: '20px', height: '20px' }}
              />
            </label>
          </div>

          {/* Allow Registrations */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 'bold', color: '#e6edf3', marginBottom: 4 }}>Allow New Registrations</div>
              <div style={{ color: '#8b949e', fontSize: '13px' }}>Controls whether new users can sign up via the public registration page.</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={allowNewRegistrations} 
                onChange={(e) => setAllowNewRegistrations(e.target.checked)}
                style={{ accentColor: '#10b981', width: '20px', height: '20px' }}
              />
            </label>
          </div>
        </div>
        
        <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid #30363d' }}>
          <button 
            className="adm-btn-primary" 
            onClick={handleSave} 
            disabled={saveLoading}
          >
            {saveLoading ? 'Saving...' : 'Save App Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
