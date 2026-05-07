'use client';
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { signOut } from '@/lib/auth';
import { apiCall, Toast, ToastState, SkeletonLine, SkeletonCard, ConfirmDialog } from './AdminUtils';

export type PaymentAccount = {
  id: string;
  account_holder: string;
  bank_name: string;
  account_no: string;
  ifsc: string;
  upi_id: string;
  qr_image_url: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type PAFormState = {
  account_holder: string;
  bank_name: string;
  account_no: string;
  ifsc: string;
  upi_id: string;
  sort_order: string;
  is_active: boolean;
  qr_image: File | null;
};

export const emptyPAForm = (): PAFormState => ({
  account_holder: '',
  bank_name: '',
  account_no: '',
  ifsc: '',
  upi_id: '',
  sort_order: '0',
  is_active: true,
  qr_image: null,
});

export function accountToForm(a: PaymentAccount): PAFormState {
  return {
    account_holder: a.account_holder,
    bank_name: a.bank_name,
    account_no: a.account_no,
    ifsc: a.ifsc,
    upi_id: a.upi_id,
    sort_order: String(a.sort_order),
    is_active: a.is_active,
    qr_image: null,
  };
}

export default function PaymentAccountsPage() {
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [paLoading, setPaLoading] = useState(false);
  const [paError, setPaError] = useState<string | null>(null);
  const [paActionLoading, setPaActionLoading] = useState<Record<string, boolean>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccount | null>(null);
  const [paToast, setPaToast] = useState<ToastState>(null);

  // Form state (shared for add and edit)
  const [form, setForm] = useState<PAFormState>(emptyPAForm());
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Confirm dialog state for delete
  const [deleteTarget, setDeleteTarget] = useState<PaymentAccount | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchAccounts = async () => {
    setPaLoading(true);
    setPaError(null);
    try {
      const { ok, status: httpStatus, data } = await apiCall('/api/admin/payment-accounts', { method: 'GET' });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setPaError((data as { error?: string })?.error ?? 'Failed to load payment accounts');
        return;
      }
      setPaymentAccounts(data as PaymentAccount[]);
    } catch (err: unknown) {
      setPaError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setPaLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open add form
  const handleOpenAdd = () => {
    setEditingAccount(null);
    setForm(emptyPAForm());
    setShowAddForm(true);
  };

  // Open edit form
  const handleOpenEdit = (account: PaymentAccount) => {
    setShowAddForm(false);
    setEditingAccount(account);
    setForm(accountToForm(account));
  };

  // Cancel form
  const handleCancelForm = () => {
    setShowAddForm(false);
    setEditingAccount(null);
    setForm(emptyPAForm());
  };

  // Submit add or edit form
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';

      const fd = new FormData();
      fd.append('account_holder', form.account_holder);
      fd.append('bank_name', form.bank_name);
      fd.append('account_no', form.account_no);
      fd.append('ifsc', form.ifsc);
      fd.append('upi_id', form.upi_id);
      fd.append('sort_order', form.sort_order);
      fd.append('is_active', String(form.is_active));
      if (form.qr_image) {
        fd.append('qr_image', form.qr_image);
      }

      if (editingAccount) {
        // PATCH existing account
        const res = await fetch(`/api/admin/payment-accounts/${editingAccount.id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (res.status === 401) { signOut(); return; }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setPaToast({ message: (errData as { error?: string })?.error ?? 'Failed to update account', type: 'error' });
          return;
        }
        setPaToast({ message: 'Account updated successfully', type: 'success' });
        setEditingAccount(null);
        setForm(emptyPAForm());
        await fetchAccounts();
      } else {
        // POST new account
        const res = await fetch('/api/admin/payment-accounts', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: fd,
        });
        if (res.status === 401) { signOut(); return; }
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          setPaToast({ message: (errData as { error?: string })?.error ?? 'Failed to create account', type: 'error' });
          return;
        }
        setPaToast({ message: 'Account created successfully', type: 'success' });
        setShowAddForm(false);
        setForm(emptyPAForm());
        await fetchAccounts();
      }
    } catch (err: unknown) {
      setPaToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setFormSubmitting(false);
    }
  };

  // Toggle active/inactive
  const handleToggleActive = async (account: PaymentAccount) => {
    setPaActionLoading(prev => ({ ...prev, [account.id]: true }));
    try {
      const { ok, status: httpStatus, data } = await apiCall(`/api/admin/payment-accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: !account.is_active }),
      });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setPaToast({ message: (data as { error?: string })?.error ?? 'Failed to update account', type: 'error' });
        return;
      }
      setPaymentAccounts(prev =>
        prev.map(a => a.id === account.id ? { ...a, is_active: !account.is_active } : a),
      );
    } catch (err: unknown) {
      setPaToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setPaActionLoading(prev => ({ ...prev, [account.id]: false }));
    }
  };

  // Delete account
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const { ok, status: httpStatus, data } = await apiCall(`/api/admin/payment-accounts/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      if (httpStatus === 401) { signOut(); return; }
      if (!ok) {
        setPaToast({ message: (data as { error?: string })?.error ?? 'Failed to delete account', type: 'error' });
        return;
      }
      setPaymentAccounts(prev => prev.filter(a => a.id !== deleteTarget.id));
      setPaToast({ message: 'Account deleted', type: 'success' });
      setDeleteTarget(null);
    } catch (err: unknown) {
      setPaToast({ message: err instanceof Error ? err.message : 'Network error', type: 'error' });
    } finally {
      setDeleteLoading(false);
    }
  };

  const formTitle = editingAccount ? 'Edit Payment Account' : 'Add Payment Account';
  const isFormOpen = showAddForm || editingAccount !== null;

  return (
    <div className="adm-page">
      <Toast toast={paToast} onDismiss={() => setPaToast(null)} />

      {deleteTarget && (
        <ConfirmDialog
          message={`Delete account "${deleteTarget.account_holder}" (${deleteTarget.bank_name})? This cannot be undone.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          loading={deleteLoading}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 className="adm-page-title" style={{ margin: 0 }}>Payment Accounts</h2>
        {!isFormOpen && (
          <button className="adm-btn-primary" onClick={handleOpenAdd}>
            + Add Account
          </button>
        )}
      </div>

      {/* Add / Edit Form */}
      {isFormOpen && (
        <div className="adm-card" style={{ marginBottom: 20 }}>
          <div className="adm-upd-section-title" style={{ marginBottom: 16 }}>{formTitle}</div>
          <form onSubmit={handleFormSubmit}>
            <div className="adm-upd-grid2">
              <div className="adm-upd-field">
                <label className="adm-upd-label">Account Holder *</label>
                <input
                  className="adm-upd-input"
                  value={form.account_holder}
                  onChange={e => setForm(f => ({ ...f, account_holder: e.target.value }))}
                  required
                  placeholder="e.g. John Doe"
                />
              </div>
              <div className="adm-upd-field">
                <label className="adm-upd-label">Bank Name *</label>
                <input
                  className="adm-upd-input"
                  value={form.bank_name}
                  onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                  required
                  placeholder="e.g. HDFC Bank"
                />
              </div>
              <div className="adm-upd-field">
                <label className="adm-upd-label">Account Number *</label>
                <input
                  className="adm-upd-input"
                  value={form.account_no}
                  onChange={e => setForm(f => ({ ...f, account_no: e.target.value }))}
                  required
                  placeholder="e.g. 1234567890"
                />
              </div>
              <div className="adm-upd-field">
                <label className="adm-upd-label">IFSC Code *</label>
                <input
                  className="adm-upd-input"
                  value={form.ifsc}
                  onChange={e => setForm(f => ({ ...f, ifsc: e.target.value }))}
                  required
                  placeholder="e.g. HDFC0001234"
                />
              </div>
              <div className="adm-upd-field">
                <label className="adm-upd-label">UPI ID *</label>
                <input
                  className="adm-upd-input"
                  value={form.upi_id}
                  onChange={e => setForm(f => ({ ...f, upi_id: e.target.value }))}
                  required
                  placeholder="e.g. name@upi"
                />
              </div>
              <div className="adm-upd-field">
                <label className="adm-upd-label">Sort Order</label>
                <input
                  type="number"
                  className="adm-upd-input"
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="adm-upd-field" style={{ marginTop: 12 }}>
              <label className="adm-upd-label">
                QR Image (Optional - auto-generated from UPI ID)
              </label>
              <input
                type="file"
                accept="image/jpeg,image/png"
                style={{ color: '#e6edf3', fontSize: '0.875rem' }}
                onChange={e => setForm(f => ({ ...f, qr_image: e.target.files?.[0] ?? null }))}
              />
            </div>

            <div className="adm-pay-rule-row" style={{ marginTop: 12 }}>
              <span className="adm-upd-label">Active</span>
              <div
                className={`adm-toggle ${form.is_active ? 'on' : ''}`}
                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
              >
                <div className="adm-toggle-thumb" />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button type="submit" className="adm-btn-primary" disabled={formSubmitting}>
                {formSubmitting ? 'Saving…' : editingAccount ? 'Update Account' : 'Create Account'}
              </button>
              <button type="button" className="adm-sheet-cancel" onClick={handleCancelForm} disabled={formSubmitting}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Account list */}
      {paLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} rows={6} />)}
        </div>
      ) : paError ? (
        <div className="adm-mw-empty" style={{ color: '#f85149' }}>{paError}</div>
      ) : paymentAccounts.length === 0 ? (
        <div className="adm-mw-empty">No payment accounts found. Add one to get started.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {paymentAccounts.map(account => (
            <div className="adm-pay-card" key={account.id}>
              <div className="adm-pay-card-top">
                <div>
                  <div className="adm-pay-uid">{account.account_holder}</div>
                  <div className="adm-pay-time">{account.bank_name}</div>
                  <div className="adm-pay-refid">{account.id}</div>
                </div>
                <span
                  className="adm-pay-status"
                  style={{
                    background: account.is_active ? '#2ea04322' : '#f8514922',
                    color: account.is_active ? '#2ea043' : '#f85149',
                    border: `1px solid ${account.is_active ? '#2ea043' : '#f85149'}`,
                  }}
                >
                  {account.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="adm-pay-grid">
                <span className="adm-pay-dl">Account No</span>
                <span className="adm-pay-dv bold">{account.account_no}</span>
                <span className="adm-pay-dl">IFSC</span>
                <span className="adm-pay-dv">{account.ifsc}</span>
                <span className="adm-pay-dl">UPI ID</span>
                <span className="adm-pay-dv">{account.upi_id}</span>
                <span className="adm-pay-dl">Sort Order</span>
                <span className="adm-pay-dv">{account.sort_order}</span>
              </div>

              {account.qr_image_url && (
                <div style={{ marginTop: 10 }}>
                  <div className="adm-pay-dl" style={{ marginBottom: 6 }}>QR Code</div>
                  <img
                    src={account.qr_image_url}
                    alt={`QR code for ${account.account_holder}`}
                    style={{
                      width: 80,
                      height: 80,
                      objectFit: 'cover',
                      borderRadius: 6,
                      border: '1px solid #30363d',
                    }}
                  />
                </div>
              )}

              <div className="adm-pay-actions" style={{ marginTop: 12 }}>
                <button
                  className="adm-pay-btn accept"
                  disabled={!!paActionLoading[account.id]}
                  onClick={() => handleOpenEdit(account)}
                >
                  Edit
                </button>
                <button
                  className="adm-pay-btn"
                  style={{
                    background: account.is_active ? '#7c2d1222' : '#16532422',
                    color: account.is_active ? '#fca5a5' : '#86efac',
                    border: `1px solid ${account.is_active ? '#fca5a5' : '#86efac'}`,
                    borderRadius: 6,
                    padding: '6px 14px',
                    fontSize: '0.8rem',
                    cursor: paActionLoading[account.id] ? 'not-allowed' : 'pointer',
                    opacity: paActionLoading[account.id] ? 0.6 : 1,
                  }}
                  disabled={!!paActionLoading[account.id]}
                  onClick={() => handleToggleActive(account)}
                >
                  {paActionLoading[account.id] ? '…' : account.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  className="adm-pay-btn delete"
                  disabled={!!paActionLoading[account.id]}
                  onClick={() => setDeleteTarget(account)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
