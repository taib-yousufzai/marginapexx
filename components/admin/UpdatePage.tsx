'use client';
import React, { useState, useEffect } from 'react';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState } from './AdminUtils';

const ALL_SEGMENTS = ['INDEX-FUT', 'STOCK-OPT', 'NSE-EQ', 'COMEX', 'INDEX-OPT', 'MCX-FUT', 'CRYPTO', 'STOCK-FUT', 'MCX-OPT', 'FOREX'];

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

const defaultSeg = (): SegSettings => ({
  commissionType: 'Per Crore', commissionValue: '4500',
  profitHoldSec: '120', loss_hold_sec: '0',
  strikeRange: '0', maxLot: '50',
  maxOrderLot: '50', intradayLeverage: '50',
  intradayType: 'Multiplier',
  holdingLeverage: '5', entryBuffer: '0.003',
  holdingType: 'Multiplier',
  exitBuffer: '0.0017', tradeAllowed: true,
});

function SegmentBlock({ name, value, onChange }: { name: string; value: SegSettings; onChange: (k: keyof SegSettings, v: string | boolean) => void }) {
  const upd = (k: keyof SegSettings, v: string | boolean) => onChange(k, v);

  return (
    <div className="adm-upd-seg-block">
      <div className="adm-upd-seg-header">
        <span className="adm-upd-seg-name">{name}</span>
        <button className="adm-upd-copy-btn"><i className="fas fa-copy" /> Copy From</button>
      </div>

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

      <div className="adm-upd-grid2">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Profit Hold (sec)</label>
          <input className="adm-upd-input" type="number" value={value.profitHoldSec} onChange={e => upd('profitHoldSec', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Loss Hold (sec)</label>
          <input className="adm-upd-input" type="number" value={value.loss_hold_sec} onChange={e => upd('loss_hold_sec', e.target.value)} />
        </div>
      </div>

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

      <div className="adm-upd-grid2">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Intraday Type</label>
          <select className="adm-upd-input adm-upd-select" value={value.intradayType} onChange={e => upd('intradayType', e.target.value)}>
            <option>Multiplier</option><option>Direct</option>
          </select>
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Holding Leverage</label>
          <input className="adm-upd-input" type="number" value={value.holdingLeverage} onChange={e => upd('holdingLeverage', e.target.value)} />
        </div>
      </div>

      <div className="adm-upd-grid2">
        <div className="adm-upd-field">
          <label className="adm-upd-label">Entry Buffer</label>
          <input className="adm-upd-input" type="number" step="0.0001" value={value.entryBuffer} onChange={e => upd('entryBuffer', e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Holding Type</label>
          <select className="adm-upd-input adm-upd-select" value={value.holdingType} onChange={e => upd('holdingType', e.target.value)}>
            <option>Multiplier</option><option>Direct</option>
          </select>
        </div>
      </div>

      <div className="adm-upd-grid2" style={{ alignItems: 'center' }}>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Exit Buffer</label>
          <input className="adm-upd-input" type="number" step="0.0001" value={value.exitBuffer} onChange={e => upd('exitBuffer', e.target.value)} />
        </div>
        <div className="adm-upd-toggle-item" style={{ marginTop: 14 }}>
          <span className="adm-upd-label">Trade Allowed</span>
          <div className={`adm-toggle ${value.tradeAllowed ? 'on' : ''}`} onClick={() => upd('tradeAllowed', !value.tradeAllowed)}>
            <div className="adm-toggle-thumb" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UpdatePage({ selectedUser }: { selectedUser: { id: string; role: string } }) {
  const uid = selectedUser.id;

  const [activation, setActivation] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('User');
  const [parent, setParent] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [demoUser, setDemoUser] = useState(false);
  const [intradaySqOff, setIntradaySqOff] = useState(false);
  const [autoSqoff, setAutoSqoff] = useState('90');
  const [sqoffMethod, setSqoffMethod] = useState('Credit');
  const [segments, setSegments] = useState<string[]>([]);
  const [segSettings, setSegSettings] = useState<Record<string, SegSettings>>({});
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const rowToSegSettings = (row: any): SegSettings => ({
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
    setPassword('');

    apiCall(`/api/admin/users/${uid}`, { method: 'GET' }).then(({ ok, status, data }) => {
      if (status === 401) { signOut(); return; }
      if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
      if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
      const p = data as any;
      setEmail(p.email ?? '');
      setFullName(p.full_name ?? '');
      setPhone(p.phone ?? '');
      const roleMap: Record<string, string> = {
        user: 'User', sub_broker: 'Sub Broker', broker: 'Broker', admin: 'Admin', super_admin: 'Admin',
      };
      setRole(roleMap[p.role] ?? 'User');
      setParent(p.parent_id ?? '');
      setActivation(p.active ?? false);
      setReadOnly(p.read_only ?? false);
      setDemoUser(p.demo_user ?? false);
      setIntradaySqOff(p.intraday_sq_off ?? false);
      setAutoSqoff(String(p.auto_sqoff ?? 90));
      setSqoffMethod(p.sqoff_method ?? 'Credit');
      setSegments(p.segments ?? []);
    }).catch((err: unknown) => {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    });

    apiCall(`/api/admin/users/${uid}/segments`, { method: 'GET' }).then(({ ok, status, data }) => {
      if (status === 401) { signOut(); return; }
      if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); return; }
      if (!ok) { setToast({ message: 'Server Error', type: 'error' }); return; }
      const rows = data as any[];
      const map: Record<string, SegSettings> = {};
      for (const row of rows) {
        const key = `${row.segment}-${row.side}`;
        map[key] = rowToSegSettings(row);
      }
      setSegSettings(map);
    }).catch((err: unknown) => {
      setToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    });
  }, [uid]);

  const toggleSeg = (s: string) => setSegments(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const segBlocks = ALL_SEGMENTS.filter(s => segments.includes(s)).flatMap(s => [`${s}-BUY`, `${s}-SELL`]);

  const handleSave = async () => {
    setLoading(true);
    const { ok, status } = await apiCall(`/api/admin/users/${uid}`, {
      method: 'PATCH',
      body: JSON.stringify({
        email,
        password: password || undefined,
        full_name: fullName,
        phone,
        role: role.toLowerCase().replace(' ', '_'),
        parent_id: parent,
        active: activation,
        read_only: readOnly,
        demo_user: demoUser,
        intraday_sq_off: intradaySqOff,
        auto_sqoff: Number(autoSqoff),
        sqoff_method: sqoffMethod,
        segments,
      }),
    });
    if (status === 401) { signOut(); setLoading(false); return; }
    if (status === 403) { setToast({ message: 'Access Denied', type: 'error' }); setLoading(false); return; }
    if (!ok) { setToast({ message: 'Server Error', type: 'error' }); setLoading(false); return; }

    if (segBlocks.length > 0) {
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
      if (segRes.status === 401) { signOut(); setLoading(false); return; }
      if (segRes.status === 403) { setToast({ message: 'Access Denied', type: 'error' }); setLoading(false); return; }
      if (!segRes.ok) { setToast({ message: 'Server Error', type: 'error' }); setLoading(false); return; }
    }

    setToast({ message: 'Changes saved successfully', type: 'success' });
    setLoading(false);
  };

  return (
    <div className="adm-upd-root">
      <div className="adm-settings-tab">User Details</div>

      <div className="adm-upd-card">
        <div className="adm-upd-card-header">
          <span className="adm-upd-card-title">User Settings</span>
          <div className="adm-upd-activation">
            <span className="adm-upd-label">Activation</span>
            <div className={`adm-toggle ${activation ? 'on' : ''}`} onClick={() => setActivation(v => !v)}>
              <div className="adm-toggle-thumb" />
            </div>
          </div>
        </div>

        <div className="adm-upd-field">
          <label className="adm-upd-label">Username</label>
          <input className="adm-upd-input" value={uid} readOnly />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Email</label>
          <input className="adm-upd-input" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Password</label>
          <div className="adm-cu-input-wrap">
            <input className="adm-upd-input" style={{ paddingRight: 40 }} type={showPass ? 'text' : 'password'} placeholder="Leave blank to keep same" value={password} onChange={e => setPassword(e.target.value)} />
            <button className="adm-cu-eye" onClick={() => setShowPass(v => !v)}><i className={`fas ${showPass ? 'fa-eye-slash' : 'fa-eye'}`} /></button>
          </div>
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Full Name</label>
          <input className="adm-upd-input" value={fullName} onChange={e => setFullName(e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Phone Number</label>
          <input className="adm-upd-input" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Role</label>
          <select className="adm-upd-input adm-upd-select" value={role} onChange={e => setRole(e.target.value)}>
            <option>User</option><option>Sub Broker</option><option>Broker</option><option>Admin</option>
          </select>
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Parent Account</label>
          <div className="adm-upd-parent-wrap">
            <input className="adm-upd-input" value={parent} onChange={e => setParent(e.target.value)} />
            {parent && <button className="adm-upd-parent-clear" onClick={() => setParent('')}>✕</button>}
          </div>
        </div>
        <div className="adm-upd-field">
          <label className="adm-upd-label">Copy Settings From (optional)</label>
          <input className="adm-upd-input" value={copyFrom} onChange={e => setCopyFrom(e.target.value)} />
        </div>
      </div>

      <div className="adm-upd-card">
        <div className="adm-upd-section-title">User Options &amp; Global Settings</div>
        <div className="adm-upd-toggles-row">
          <div className="adm-upd-toggle-item">
            <span className="adm-upd-label">Read Only</span>
            <div className={`adm-toggle ${readOnly ? 'on' : ''}`} onClick={() => setReadOnly(v => !v)}><div className="adm-toggle-thumb" /></div>
          </div>
          <div className="adm-upd-toggle-item">
            <span className="adm-upd-label">Demo User</span>
            <div className={`adm-toggle ${demoUser ? 'on' : ''}`} onClick={() => setDemoUser(v => !v)}><div className="adm-toggle-thumb" /></div>
          </div>
          <div className="adm-upd-toggle-item">
            <span className="adm-upd-label">Intraday Square Off</span>
            <div className={`adm-toggle ${intradaySqOff ? 'on' : ''}`} onClick={() => setIntradaySqOff(v => !v)}><div className="adm-toggle-thumb" /></div>
          </div>
        </div>

        <div className="adm-upd-section-title" style={{ marginTop: 8 }}>Global Settings</div>
        <div className="adm-upd-grid2">
          <div className="adm-upd-field">
            <label className="adm-upd-label">Auto Sqoff %</label>
            <input className="adm-upd-input" value={autoSqoff} onChange={e => setAutoSqoff(e.target.value)} />
          </div>
          <div className="adm-upd-field">
            <label className="adm-upd-label">Auto Sqoff Method</label>
            <select className="adm-upd-input adm-upd-select" value={sqoffMethod} onChange={e => setSqoffMethod(e.target.value)}>
              <option>Credit</option><option>Debit</option><option>Net</option>
            </select>
          </div>
        </div>

        <div className="adm-upd-section-title" style={{ marginTop: 8 }}>Exchange Segments</div>
        <div className="adm-cu-segments-grid">
          {ALL_SEGMENTS.map(s => (
            <label className="adm-cu-seg-item" key={s}>
              <input type="checkbox" className="adm-cu-checkbox" checked={segments.includes(s)} onChange={() => toggleSeg(s)} />
              <span className="adm-cu-seg-label">{s}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="adm-upd-section-title">Segment Settings</div>
      {segBlocks.map(name => <SegmentBlock key={name} name={name} value={segSettings[name] ?? defaultSeg()} onChange={(k, v) => setSegSettings(prev => ({ ...prev, [name]: { ...(prev[name] ?? defaultSeg()), [k]: v } }))} />)}

      <button className="adm-btn-primary" style={{ width: '100%', padding: '14px', fontSize: '0.9rem', borderRadius: 10 }} disabled={loading} onClick={handleSave}>
        {loading ? 'Saving…' : 'Save Changes'}
      </button>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
      <div style={{ height: 24 }} />
    </div>
  );
}
