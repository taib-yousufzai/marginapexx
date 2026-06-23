'use client';
import React, { useState } from 'react';
import { apiCall, Toast, ToastState } from '../AdminUtils';

const ENTRY_TYPES = [
  { value: 'DEPOSIT', label: 'Deposit' },
  { value: 'WITHDRAWAL', label: 'Withdrawal' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
  { value: 'CORRECTION', label: 'Correction' },
  { value: 'REFUND', label: 'Refund' },
] as const;

type EntryType = typeof ENTRY_TYPES[number]['value'];

export default function UpdateLedger({ selectedUser }: { selectedUser: { id: string } }) {
  const uid = selectedUser.id;
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'Credit' | 'Debit'>('Credit');
  const [entryType, setEntryType] = useState<EntryType>('ADJUSTMENT');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const handleSave = async () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setToast({ message: 'Please enter a valid amount', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const { ok, data } = await apiCall(`/api/admin/users/${uid}/ledger`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          type: direction,
          entry_type: entryType,
          description: description.trim() || null,
        }),
      });

      if (!ok) {
        const err = data as { error?: string };
        setToast({ message: err.error || 'Failed to update ledger', type: 'error' });
        setLoading(false);
        return;
      }

      const res = data as { message: string; newBalance: number };
      setLoading(false);
      setToast({ message: res.message, type: 'success' });
      setAmount('');
      setDescription('');
    } catch (e) {
      setLoading(false);
      setToast({ message: 'Network error updating ledger', type: 'error' });
    }
  };

  return (
    <div className="adm-upd-root" style={{ padding: '0 0 40px 0' }}>
      <div className="adm-upd-section-title">Manual Ledger Adjustment</div>
      <p style={{ color: '#8b949e', fontSize: '14px', marginBottom: 20 }}>
        Manually credit or debit funds to the user&apos;s account for corrections, adjustments, or penalties.
      </p>

      <div className="adm-upd-card">
        <div className="adm-upd-grid2">
          <div className="adm-upd-field">
            <label className="adm-upd-label">Transaction Type</label>
            <select
              className="adm-upd-input adm-upd-select"
              value={entryType}
              onChange={e => setEntryType(e.target.value as EntryType)}
            >
              {ENTRY_TYPES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="adm-upd-field">
            <label className="adm-upd-label">Direction</label>
            <select
              className="adm-upd-input adm-upd-select"
              value={direction}
              onChange={e => setDirection(e.target.value as 'Credit' | 'Debit')}
            >
              <option value="Credit">Credit (+)</option>
              <option value="Debit">Debit (-)</option>
            </select>
          </div>
        </div>

        <div className="adm-upd-grid2">
          <div className="adm-upd-field">
            <label className="adm-upd-label">Amount (₹)</label>
            <input
              className="adm-upd-input"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
            />
          </div>
          <div className="adm-upd-field">
            <label className="adm-upd-label">Justification Note (Optional)</label>
            <input
              className="adm-upd-input"
              placeholder="Provide a reason explaining why you are adjusting this ledger"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
        </div>
      </div>

      <button
        className="adm-btn-primary"
        style={{ width: '100%', padding: '14px', fontSize: '0.9rem', borderRadius: 10, marginTop: 20 }}
        disabled={loading}
        onClick={handleSave}
      >
        {loading ? 'Processing…' : `Submit ${direction}`}
      </button>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
