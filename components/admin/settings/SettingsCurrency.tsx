'use client';
import React, { useState } from 'react';
import { Toast, ToastState } from '../AdminUtils';

export default function SettingsCurrency() {
  const [exchangeRate, setExchangeRate] = useState('83.50');
  const [toast, setToast] = useState<ToastState>(null);
  const [saveLoading, setSaveLoading] = useState(false);

  const handleSave = async () => {
    if (!exchangeRate || isNaN(Number(exchangeRate))) {
      setToast({ message: 'Please enter a valid number', type: 'error' });
      return;
    }
    
    setSaveLoading(true);
    // TODO: Implement actual API call to save currency settings
    setTimeout(() => {
      setToast({ message: 'Currency settings saved successfully', type: 'success' });
      setSaveLoading(false);
    }, 800);
  };

  return (
    <div className="adm-set-root">
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      
      <div className="adm-mw-header" style={{ marginBottom: 20 }}>
        <div>
          <h2 className="adm-page-title" style={{ margin: 0 }}>Currency Settings</h2>
          <p style={{ margin: '4px 0 0', color: '#8b949e', fontSize: '13px' }}>Configure the global exchange rate used for FOREX and COMEX conversion.</p>
        </div>
      </div>

      <div className="adm-card" style={{ maxWidth: 500, padding: 24 }}>
        <h3 style={{ marginTop: 0, marginBottom: 20, color: '#e6edf3', fontSize: '16px' }}>USD/INR Exchange Rate</h3>
        
        <div className="adm-upd-field">
          <label className="adm-upd-label">1 USD equals (INR)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ color: '#8b949e', fontWeight: 'bold' }}>₹</span>
            <input 
              type="number" 
              className="adm-upd-input" 
              value={exchangeRate}
              onChange={e => setExchangeRate(e.target.value)}
              placeholder="83.50"
              step="0.01"
              style={{ maxWidth: 200 }}
            />
          </div>
          <p style={{ margin: '8px 0 0', color: '#8b949e', fontSize: '12px' }}>
            This rate will be multiplied by the live USD price for applicable segments to display the INR equivalent.
          </p>
        </div>
        
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #30363d' }}>
          <button 
            className="adm-btn-primary" 
            onClick={handleSave} 
            disabled={saveLoading}
          >
            {saveLoading ? 'Saving...' : 'Save Exchange Rate'}
          </button>
        </div>
      </div>
    </div>
  );
}
