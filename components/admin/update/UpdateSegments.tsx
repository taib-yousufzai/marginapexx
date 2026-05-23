'use client';
import React, { useState, useEffect } from 'react';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState, UserListItem } from '../AdminUtils';

const ALL_SEGMENTS = ['INDEX-FUT', 'STOCK-OPT', 'NSE-EQ', 'COMEX', 'INDEX-OPT', 'MCX-FUT', 'CRYPTO', 'STOCK-FUT', 'MCX-OPT', 'FOREX'];

export type SegmentSettingsType = {
  commissionType: string; commissionValue: string;
  profitHoldSec: string; loss_hold_sec: string;
  strikeRange: string; maxLot: string;
  maxOrderLot: string; intradayLeverage: string;
  intradayType: string;
  holdingLeverage: string; entryBuffer: string;
  holdingType: string;
  exitBuffer: string; tradeAllowed: boolean;
};

export interface SegmentRow {
  segment: string;
  side: string;
  commission_type: string;
  commission_value: number;
  profit_hold_sec: number;
  loss_hold_sec: number;
  strike_range: number;
  max_lot: number;
  max_order_lot: number;
  intraday_leverage: number;
  intraday_type: string;
  holding_leverage: number;
  entry_buffer: number;
  holding_type: string;
  exit_buffer: number;
  trade_allowed: boolean;
}

const defaultSeg = (): SegmentSettingsType => ({
  commissionType: 'Per Crore', commissionValue: '4500',
  profitHoldSec: '120', loss_hold_sec: '0',
  strikeRange: '0', maxLot: '50',
  maxOrderLot: '50', intradayLeverage: '50',
  intradayType: 'Multiplier',
  holdingLeverage: '5', entryBuffer: '0.003',
  holdingType: 'Multiplier',
  exitBuffer: '0.0017', tradeAllowed: true,
});

function SegmentBlock({ 
  name, 
  value, 
  onChange,
  availableBlocks,
  onPerformCopy
}: { 
  name: string; 
  value: SegmentSettingsType; 
  onChange: (k: keyof SegmentSettingsType, v: string | boolean) => void;
  availableBlocks: string[];
  onPerformCopy: (sourceName: string) => void;
}) {
  const [showCopyDropdown, setShowCopyDropdown] = useState(false);
  const upd = (k: keyof SegmentSettingsType, v: string | boolean) => onChange(k, v);

  return (
    <div className="adm-upd-seg-block" style={{ marginBottom: '20px', position: 'relative' }}>
      <div className="adm-upd-seg-header">
        <span className="adm-upd-seg-name" style={{ fontSize: '1rem', fontWeight: 700 }}>{name}</span>
        
        {/* Copy From Button */}
        <div style={{ position: 'relative' }}>
          <button 
            className="adm-upd-copy-btn" 
            onClick={(e) => { e.preventDefault(); setShowCopyDropdown(!showCopyDropdown); }}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <i className="far fa-copy"></i> Copy From
          </button>
          
          {showCopyDropdown && (
            <div 
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 5px)',
                background: '#161b22',
                border: '1px solid #30363d',
                borderRadius: '8px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                zIndex: 10,
                minWidth: '160px',
                maxHeight: '200px',
                overflowY: 'auto',
                padding: '6px 0'
              }}
              onMouseLeave={() => setShowCopyDropdown(false)}
            >
              <div style={{ padding: '6px 12px', fontSize: '11px', color: '#8b949e', borderBottom: '1px solid #30363d', fontWeight: 600 }}>Select Segment</div>
              {availableBlocks.filter(b => b !== name).length === 0 ? (
                <div style={{ padding: '8px 12px', fontSize: '12px', color: '#8b949e' }}>No other segments</div>
              ) : (
                availableBlocks.filter(b => b !== name).map(b => (
                  <button
                    key={b}
                    onClick={() => {
                      onPerformCopy(b);
                      setShowCopyDropdown(false);
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      background: 'transparent',
                      border: 'none',
                      color: '#c9d1d9',
                      textAlign: 'left',
                      fontSize: '12px',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#21262d'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    {b}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row 1: Commission Type & Value */}
      <div className="adm-upd-grid2">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Commission Type</label>
          <select className="adm-upd-input adm-upd-select" value={value.commissionType} onChange={e => upd('commissionType', e.target.value)}>
            <option>Per Crore</option><option>Per Lot</option><option>Per Trade</option>
          </select>
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Commission Value</label>
          <input className="adm-upd-input" type="number" value={value.commissionValue} onChange={e => upd('commissionValue', e.target.value)} />
        </div>
      </div>

      {/* Row 2: Profit Hold Sec & Loss Hold Sec */}
      <div className="adm-upd-grid2">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Profit Hold Sec</label>
          <input className="adm-upd-input" type="number" value={value.profitHoldSec} onChange={e => upd('profitHoldSec', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Loss Hold Sec</label>
          <input className="adm-upd-input" type="number" value={value.loss_hold_sec} onChange={e => upd('loss_hold_sec', e.target.value)} />
        </div>
      </div>

      {/* Row 3: Strike Range & Max Lot */}
      <div className="adm-upd-grid2">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Strike Range</label>
          <input className="adm-upd-input" type="number" value={value.strikeRange} onChange={e => upd('strikeRange', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Max Lot</label>
          <input className="adm-upd-input" type="number" value={value.maxLot} onChange={e => upd('maxLot', e.target.value)} />
        </div>
      </div>

      {/* Row 4: Max Order Lot & Intraday Leverage */}
      <div className="adm-upd-grid2">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Max Order Lot</label>
          <input className="adm-upd-input" type="number" value={value.maxOrderLot} onChange={e => upd('maxOrderLot', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Intraday Leverage</label>
          <input className="adm-upd-input" type="number" value={value.intradayLeverage} onChange={e => upd('intradayLeverage', e.target.value)} />
        </div>
      </div>

      {/* Row 5: Intraday Type on Right (Left side blank) */}
      <div className="adm-upd-grid2">
        <div></div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Intraday Type</label>
          <select className="adm-upd-input adm-upd-select" value={value.intradayType} onChange={e => upd('intradayType', e.target.value)}>
            <option>Multiplier</option><option>Direct</option>
          </select>
          <span style={{ fontSize: '10px', color: '#8b949e', marginTop: '4px', display: 'block', lineHeight: '1.4' }}>
            Req Funds = (Qty &times; Market Price) &divide; Leverage
          </span>
        </div>
      </div>

      {/* Row 6: Holding Leverage & Entry Buffer */}
      <div className="adm-upd-grid2">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Holding Leverage</label>
          <input className="adm-upd-input" type="number" value={value.holdingLeverage} onChange={e => upd('holdingLeverage', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Entry Buffer</label>
          <input className="adm-upd-input" type="number" step="0.0001" value={value.entryBuffer} onChange={e => upd('entryBuffer', e.target.value)} />
        </div>
      </div>

      {/* Row 7: Holding Type on Left (Right side blank) */}
      <div className="adm-upd-grid2">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Holding Type</label>
          <select className="adm-upd-input adm-upd-select" value={value.holdingType} onChange={e => upd('holdingType', e.target.value)}>
            <option>Multiplier</option><option>Direct</option>
          </select>
          <span style={{ fontSize: '10px', color: '#8b949e', marginTop: '4px', display: 'block', lineHeight: '1.4' }}>
            Req Funds = (Qty &times; Market Price) &divide; Leverage
          </span>
        </div>
        <div></div>
      </div>

      {/* Row 8: Exit Buffer & Trade Allowed */}
      <div className="adm-upd-grid2" style={{ alignItems: 'flex-start' }}>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Exit Buffer</label>
          <input className="adm-upd-input" type="number" step="0.0001" value={value.exitBuffer} onChange={e => upd('exitBuffer', e.target.value)} />
        </div>
        <div className="adm-upd-toggle-item" style={{ marginTop: 2 }}>
          <span className="adm-upd-label">Trade Allowed</span>
          <div style={{ display: 'flex', alignItems: 'center', height: '40px', marginTop: '4px' }}>
            <div 
              className={`adm-toggle ${value.tradeAllowed ? 'on' : ''}`} 
              style={value.tradeAllowed ? { background: '#14b8a6' } : {}}
              onClick={() => upd('tradeAllowed', !value.tradeAllowed)}
            >
              <div className="adm-toggle-thumb" style={{ background: '#fff' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UpdateSegments({ selectedUser }: { selectedUser: { id: string } }) {
  const uid = selectedUser.id;
  
  const [segments, setSegments] = useState<string[]>([]);
  const [segSettings, setSegSettings] = useState<Record<string, SegmentSettingsType>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const rowToSegSettings = (row: SegmentRow): SegmentSettingsType => ({
    commissionType: row.commission_type,
    commissionValue: String(row.commission_value),
    profitHoldSec: String(row.profit_hold_sec),
    loss_hold_sec: String(row.loss_hold_sec),
    strikeRange: String(row.strike_range),
    maxLot: String(row.max_lot),
    maxOrderLot: String(row.max_order_lot),
    intradayLeverage: String(row.intraday_leverage),
    intradayType: row.intraday_type,
    holdingLeverage: String(row.holding_leverage),
    entryBuffer: String(row.entry_buffer),
    holdingType: row.holding_type,
    exitBuffer: String(row.exit_buffer),
    tradeAllowed: row.trade_allowed,
  });

  useEffect(() => {
    if (!uid) return;
    
    // Fetch both user segments and the settings
    Promise.all([
      apiCall(`/api/admin/users/${uid}`, { method: 'GET' }),
      apiCall(`/api/admin/users/${uid}/segments`, { method: 'GET' })
    ]).then(([userRes, segRes]) => {
      setLoading(false);
      
      if (!userRes.ok || !segRes.ok) {
        setToast({ message: 'Error loading segment settings', type: 'error' });
        return;
      }
      
      const userData = userRes.data as UserListItem;
      setSegments(userData.segments ?? []);
      
      const rows = segRes.data as SegmentRow[];
      const map: Record<string, SegmentSettingsType> = {};
      for (const row of rows) {
        const key = `${row.segment}-${row.side}`;
        map[key] = rowToSegSettings(row);
      }
      setSegSettings(map);
    }).catch(err => {
      setLoading(false);
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    });
  }, [uid]);

  const segBlocks = ALL_SEGMENTS.flatMap(s => [`${s}-BUY`, `${s}-SELL`]);

  const handleSave = async () => {
    setSaving(true);
    
    const segRows = segBlocks.map(name => {
      const parts = name.split('-');
      const side = parts[parts.length - 1];
      const segment = parts.slice(0, parts.length - 1).join('-');
      const s = segSettings[name] ?? defaultSeg();
      return {
        user_id: uid,
        segment,
        side,
        commission_type: s.commissionType,
        commission_value: Number(s.commissionValue),
        profit_hold_sec: Number(s.profitHoldSec),
        loss_hold_sec: Number(s.loss_hold_sec),
        strike_range: Number(s.strikeRange),
        max_lot: Number(s.maxLot),
        max_order_lot: Number(s.maxOrderLot),
        intraday_leverage: Number(s.intradayLeverage),
        intraday_type: s.intradayType,
        holding_leverage: Number(s.holdingLeverage),
        entry_buffer: Number(s.entryBuffer),
        holding_type: s.holdingType,
        exit_buffer: Number(s.exitBuffer),
        trade_allowed: s.tradeAllowed,
      };
    });
    
    const segRes = await apiCall(`/api/admin/users/${uid}/segments`, {
      method: 'POST',
      body: JSON.stringify(segRows),
    });
    
    setSaving(false);
    if (segRes.status === 401) { signOut(); return; }
    if (segRes.status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
    if (!segRes.ok) { setToast({ message: 'Server Error', type: 'error' }); return; }

    setToast({ message: 'Segment settings saved successfully', type: 'success' });
  };

  if (loading) return <div style={{ color: '#8b949e', padding: 20 }}>Loading...</div>;

  return (
    <div className="adm-upd-root" style={{ padding: '0 0 40px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>Segment Settings</span>
        <i className="fas fa-bars" style={{ color: '#8b949e', fontSize: '1.2rem', cursor: 'pointer' }}></i>
      </div>
      
      {segBlocks.map(name => (
        <SegmentBlock 
          key={name} 
          name={name} 
          value={segSettings[name] ?? defaultSeg()} 
          onChange={(k, v) => setSegSettings(prev => ({ ...prev, [name]: { ...(prev[name] ?? defaultSeg()), [k]: v } }))} 
          availableBlocks={segBlocks}
          onPerformCopy={(sourceName) => setSegSettings(prev => ({ ...prev, [name]: { ...(prev[sourceName] ?? defaultSeg()) } }))}
        />
      ))}

      <button className="adm-btn-primary" style={{ width: '100%', padding: '14px', fontSize: '0.9rem', borderRadius: 10, marginTop: 20 }} disabled={saving} onClick={handleSave}>
        {saving ? 'Saving…' : 'Save Segment Settings'}
      </button>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
