'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import { getSession } from '@/lib/auth';
import type { Session } from '@supabase/supabase-js';
import './page.css';

interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  accountHolderName: string;
  upiId?: string;
  isPrimary: boolean;
}

export default function BankDetailsPage() {
  const router = useRouter();
  
  useEffect(() => {
    const saved = localStorage.getItem('marginApexTheme');
    document.body.classList.remove('dark', 'black');
    if (saved === 'dark' || saved === 'black') document.body.classList.add(saved);
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);

  const sortAccounts = (accs: BankAccount[]) => {
    return [...accs].sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1));
  };

  useEffect(() => {
    let cancelled = false;
    getSession().then(async (s) => {
      if (cancelled) return;
      if (!s) {
        setLoading(false);
        return;
      }
      setSession(s);
      try {
        const res = await fetch('/api/pay/bank-accounts', { headers: { Authorization: `Bearer ${s.access_token}` } });
        if (res.ok) {
          const data = await res.json();
          const mappedAccounts: BankAccount[] = data.map((acc: any) => ({
            id: acc.id,
            bankName: acc.bank_name || '',
            accountNumber: acc.account_no || '',
            ifsc: acc.ifsc || '',
            accountHolderName: acc.account_name || 'Account Holder',
            upiId: acc.upi_id || '',
            isPrimary: acc.is_primary || false
          }));
          setAccounts(sortAccounts(mappedAccounts));
        }
      } catch (e) {}
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    bankName: '',
    accountNumber: '',
    ifsc: '',
    accountHolderName: '',
    upiId: ''
  });

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', message: '', confirmText: '', onConfirm: () => {} });

  const closeConfirm = () => setConfirmConfig(prev => ({ ...prev, isOpen: false }));

  const openAddModal = () => {
    setFormData({ bankName: '', accountNumber: '', ifsc: '', accountHolderName: '', upiId: '' });
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (acc: BankAccount) => {
    setFormData({
      bankName: acc.bankName,
      accountNumber: acc.accountNumber,
      ifsc: acc.ifsc,
      accountHolderName: acc.accountHolderName,
      upiId: acc.upiId || ''
    });
    setEditingId(acc.id);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };

  const [saving, setSaving] = useState(false);

  const executeSave = async () => {
    setSaving(true);
    closeConfirm();
    try {
      const s = await getSession();
      if (!s) throw new Error('No session');

      const payload = {
        id: editingId || undefined,
        account_name: formData.accountHolderName,
        account_no: formData.accountNumber,
        ifsc: formData.ifsc,
        bank_name: formData.bankName,
        upi_id: formData.upiId,
        is_primary: accounts.length === 0 || undefined
      };

      const method = editingId ? 'PATCH' : 'POST';

      const res = await fetch('/api/pay/bank-accounts', {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to update');
      const savedAcc = await res.json();
      
      const newAcc: BankAccount = {
        id: savedAcc.id,
        bankName: savedAcc.bank_name || '',
        accountNumber: savedAcc.account_no || '',
        ifsc: savedAcc.ifsc || '',
        accountHolderName: savedAcc.account_name || '',
        upiId: savedAcc.upi_id || '',
        isPrimary: savedAcc.is_primary || false
      };

      if (editingId) {
        setAccounts(sortAccounts(accounts.map(a => a.id === editingId ? newAcc : a)));
      } else {
        setAccounts(sortAccounts([newAcc, ...accounts]));
      }
      
      closeModal();
    } catch (e) {
      alert('Failed to save bank details. Please fill all required fields.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    setConfirmConfig({
      isOpen: true,
      title: editingId ? 'Save Changes?' : 'Add Bank Account?',
      message: editingId 
        ? 'Are you sure you want to update these bank details?' 
        : 'Are you sure you want to add this new bank account?',
      confirmText: editingId ? 'Yes, Update' : 'Yes, Add',
      onConfirm: executeSave
    });
  };

  const executeSetPrimary = async (id: string) => {
    closeConfirm();
    try {
      const s = await getSession();
      if (!s) return;
      const acc = accounts.find(a => a.id === id);
      if (!acc) return;

      const payload = { id, is_primary: true };

      const res = await fetch('/api/pay/bank-accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setAccounts(sortAccounts(accounts.map(a => ({ ...a, isPrimary: a.id === id }))));
      }
    } catch (e) {
      alert('Failed to update primary account.');
    } finally {
      setSaving(false);
    }
  };

  const confirmSetPrimary = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Set as Primary?',
      message: 'Are you sure you want to make this your primary bank account for all transactions?',
      confirmText: 'Yes, Set Primary',
      onConfirm: () => executeSetPrimary(id)
    });
  };

  const [selectPrimaryModal, setSelectPrimaryModal] = useState<{isOpen: boolean, deleteId: string | null}>({isOpen: false, deleteId: null});
  const [newPrimarySelection, setNewPrimarySelection] = useState<string | null>(null);

  const executeDelete = async (id: string, newPrimaryId?: string) => {
    closeConfirm();
    try {
      const s = await getSession();
      if (!s) return;

      const accToDelete = accounts.find(a => a.id === id);
      let primaryToSet = newPrimaryId;

      if (accToDelete?.isPrimary && !newPrimaryId && accounts.length === 2) {
        const otherAcc = accounts.find(a => a.id !== id);
        if (otherAcc) primaryToSet = otherAcc.id;
      }

      if (primaryToSet) {
        await fetch('/api/pay/bank-accounts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access_token}` },
          body: JSON.stringify({ id: primaryToSet, is_primary: true }),
        });
      }

      const res = await fetch(`/api/pay/bank-accounts?id=${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${s.access_token}` }
      });

      if (res.ok) {
        setAccounts(prev => {
          let next = prev.filter(a => a.id !== id);
          if (primaryToSet) {
            next = next.map(a => ({ ...a, isPrimary: a.id === primaryToSet }));
          }
          return sortAccounts(next);
        });
        setSelectPrimaryModal({isOpen: false, deleteId: null});
      } else {
        throw new Error();
      }
    } catch (e) {
      alert('Failed to delete bank account.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (acc: BankAccount) => {
    if (acc.isPrimary && accounts.length > 2) {
      setNewPrimarySelection(null);
      setSelectPrimaryModal({ isOpen: true, deleteId: acc.id });
      return;
    }
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Account?',
      message: 'Are you sure you want to remove this bank account? This action cannot be undone.',
      confirmText: 'Yes, Delete',
      onConfirm: () => executeDelete(acc.id)
    });
  };

  return (
    <div className="desktop-layout">
      <Sidebar />
      <main className="main-viewport">
        <div className="app-container">
          {/* Header */}
          <div className="bd-header">
            <Link href="/profile" className="bd-back-btn" suppressHydrationWarning>
              <i className="fas fa-chevron-left"></i>
            </Link>
            <h1 className="bd-title">Bank Details</h1>
            <div style={{width: 40}}></div>
          </div>

          <div className="bd-content">
            <p className="bd-subtitle">Manage your linked bank accounts for seamless withdrawals and deposits.</p>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#8F9BB3' }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '10px' }}></i>
                <p>Loading details...</p>
              </div>
            ) : (
              <>
                <div className="bd-accounts-list">
                  {accounts.length === 0 ? (
                    <div className="bd-empty-state">
                      <div className="bd-empty-icon"><i className="fas fa-university"></i></div>
                      <p>No bank accounts linked yet.</p>
                    </div>
                  ) : (
                    accounts.map(acc => (
                      <div key={acc.id} className={`bd-card ${acc.isPrimary ? 'primary-card' : ''}`}>
                        <div className="bd-card-header">
                          <div className="bd-bank-info">
                            <div className="bd-bank-icon">
                              <i className="fas fa-university"></i>
                            </div>
                            <div>
                              <h3 className="bd-bank-name">{acc.bankName || 'Bank Account'}</h3>
                              {acc.isPrimary && <span className="bd-badge-primary">Primary Account</span>}
                            </div>
                          </div>
                          <div className="bd-card-actions">
                            <button type="button" className="bd-icon-btn edit" onClick={() => openEditModal(acc)} suppressHydrationWarning>
                              <i className="fas fa-pen"></i>
                            </button>
                            <button type="button" className="bd-icon-btn" onClick={() => confirmDelete(acc)} suppressHydrationWarning style={{ color: '#C62E2E' }}>
                              <i className="fas fa-trash"></i>
                            </button>
                          </div>
                        </div>
                        
                        <div className="bd-card-body">
                          <div className="bd-detail-row">
                            <div className="bd-detail-label">ACCOUNT NO.</div>
                            <div className="bd-detail-value">{acc.accountNumber || '—'}</div>
                          </div>
                          <div className="bd-detail-row">
                            <div className="bd-detail-label">IFSC CODE</div>
                            <div className="bd-detail-value">{acc.ifsc || '—'}</div>
                          </div>
                          <div className="bd-detail-row">
                            <div className="bd-detail-label">HOLDER NAME</div>
                            <div className="bd-detail-value">{acc.accountHolderName || '—'}</div>
                          </div>
                          {acc.upiId && (
                            <div className="bd-detail-row">
                              <div className="bd-detail-label">UPI ID</div>
                              <div className="bd-detail-value">{acc.upiId}</div>
                            </div>
                          )}
                        </div>

                        {!acc.isPrimary && (
                          <div className="bd-card-footer">
                            <button className="bd-set-primary-btn" onClick={() => confirmSetPrimary(acc.id)}>
                              Set as Primary
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <button type="button" className="bd-add-btn" onClick={openAddModal} suppressHydrationWarning>
                  <i className="fas fa-plus-circle"></i> Add New Bank Account
                </button>
              </>
            )}
          </div>

          {/* Add/Edit Modal */}
          <div className={`bd-modal-overlay ${isModalOpen ? 'open' : ''}`} onClick={closeModal}></div>
          <div className={`bd-modal ${isModalOpen ? 'open' : ''}`}>
            <div className="bd-modal-header">
              <h3>{editingId ? 'Edit Bank Details' : 'Add Bank Account'}</h3>
              <button type="button" suppressHydrationWarning className="bd-modal-close" onClick={closeModal}><i className="fas fa-times"></i></button>
            </div>
            <div className="bd-modal-body">
              <div className="bd-form-group">
                <label><i className="fas fa-university"></i> Bank Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. HDFC, SBI" 
                  value={formData.bankName}
                  onChange={e => setFormData({...formData, bankName: e.target.value})}
                  suppressHydrationWarning
                />
              </div>
              <div className="bd-form-group">
                <label><i className="fas fa-hashtag"></i> Account Number *</label>
                <input 
                  type="text" 
                  placeholder="Enter account number" 
                  value={formData.accountNumber}
                  onChange={e => setFormData({...formData, accountNumber: e.target.value})}
                  suppressHydrationWarning
                />
              </div>
              <div className="bd-form-group">
                <label><i className="fas fa-code-branch"></i> IFSC Code *</label>
                <input 
                  type="text" 
                  placeholder="e.g. SBIN0001234" 
                  value={formData.ifsc}
                  onChange={e => setFormData({...formData, ifsc: e.target.value})}
                  suppressHydrationWarning
                />
              </div>
              <div className="bd-form-group">
                <label><i className="fas fa-user"></i> Account Holder Name *</label>
                <input 
                  type="text" 
                  placeholder="Name as per bank records" 
                  value={formData.accountHolderName}
                  onChange={e => setFormData({...formData, accountHolderName: e.target.value})}
                  suppressHydrationWarning
                />
              </div>
              <div className="bd-form-group">
                <label><i className="fas fa-qrcode"></i> UPI ID (Optional)</label>
                <input 
                  type="text" 
                  placeholder="name@upi" 
                  value={formData.upiId}
                  onChange={e => setFormData({...formData, upiId: e.target.value})}
                  suppressHydrationWarning
                />
              </div>
              
              <button type="button" className="bd-save-btn" onClick={handleSaveClick} disabled={saving} suppressHydrationWarning>
                {saving ? (
                  <><i className="fas fa-spinner fa-spin"></i> Saving...</>
                ) : (
                  editingId ? 'Save Changes' : 'Add Account'
                )}
              </button>
            </div>
          </div>

          {/* Universal Confirmation Modal */}
          <div className={`bd-modal-overlay ${confirmConfig.isOpen ? 'open' : ''}`} style={{ zIndex: 3000 }} onClick={closeConfirm}></div>
          <div className={`bd-modal ${confirmConfig.isOpen ? 'open' : ''}`} style={{ 
            zIndex: 3001, height: 'auto', bottom: 'auto', top: '50%', 
            transform: confirmConfig.isOpen ? 'translateY(-50%) scale(1)' : 'translateY(-50%) scale(0.95)', 
            opacity: confirmConfig.isOpen ? 1 : 0,
            visibility: confirmConfig.isOpen ? 'visible' : 'hidden',
            pointerEvents: confirmConfig.isOpen ? 'auto' : 'none',
            margin: '0 20px', left: 0, right: 0, width: 'auto', borderRadius: '20px',
            transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
          }}>
            <div className="bd-modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <h3 style={{ color: '#1A1E2B' }}>{confirmConfig.title}</h3>
            </div>
            <div className="bd-modal-body" style={{ paddingTop: '10px' }}>
              <p style={{ color: '#6B728E', fontSize: '0.95rem', marginBottom: '24px', lineHeight: '1.5' }}>
                {confirmConfig.message}
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  type="button"
                  suppressHydrationWarning
                  className="bd-icon-btn" 
                  style={{ flex: 1, padding: '14px', height: 'auto', borderRadius: '14px', background: '#F8FAFF', border: '1px solid #EEF2F8', color: '#1A1E2B', fontWeight: 600, fontSize: '0.95rem' }}
                  onClick={closeConfirm}
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  suppressHydrationWarning
                  className="bd-save-btn" 
                  style={{ flex: 1, margin: 0, borderRadius: '14px', fontSize: '0.95rem', background: confirmConfig.title.includes('Delete') ? '#C62E2E' : '#2C8E5A' }}
                  onClick={() => {
                    setSaving(true);
                    confirmConfig.onConfirm();
                  }}
                  disabled={saving}
                >
                  {saving ? 'Processing...' : confirmConfig.confirmText}
                </button>
              </div>
            </div>
          </div>

          {/* Select Primary Modal */}
          <div className={`bd-modal-overlay ${selectPrimaryModal.isOpen ? 'open' : ''}`} style={{ zIndex: 3000 }} onClick={() => setSelectPrimaryModal({isOpen: false, deleteId: null})}></div>
          <div className={`bd-modal ${selectPrimaryModal.isOpen ? 'open' : ''}`} style={{ 
            zIndex: 3001, height: 'auto', bottom: 'auto', top: '50%', 
            transform: selectPrimaryModal.isOpen ? 'translateY(-50%) scale(1)' : 'translateY(-50%) scale(0.95)', 
            opacity: selectPrimaryModal.isOpen ? 1 : 0,
            visibility: selectPrimaryModal.isOpen ? 'visible' : 'hidden',
            pointerEvents: selectPrimaryModal.isOpen ? 'auto' : 'none',
            margin: '0 20px', left: 0, right: 0, width: 'auto', borderRadius: '20px',
            transition: 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
          }}>
            <div className="bd-modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <h3 style={{ color: '#1A1E2B' }}>Select New Primary</h3>
            </div>
            <div className="bd-modal-body" style={{ paddingTop: '10px' }}>
              <p style={{ color: '#6B728E', fontSize: '0.95rem', marginBottom: '16px', lineHeight: '1.5' }}>
                You are deleting your primary account. Please select another account to become primary before deleting.
              </p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
                {accounts.filter(a => a.id !== selectPrimaryModal.deleteId).map(acc => (
                  <div key={acc.id} onClick={() => setNewPrimarySelection(acc.id)} style={{
                    padding: '12px 16px', borderRadius: '14px', border: newPrimarySelection === acc.id ? '2px solid #2C8E5A' : '1px solid #EEF2F8', background: newPrimarySelection === acc.id ? '#F0FDF4' : '#F8FAFF', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: '0.2s'
                  }}>
                    <div>
                      <div style={{ fontWeight: 700, color: '#1A1E2B', fontSize: '0.95rem' }}>{acc.bankName || 'Bank Account'}</div>
                      <div style={{ fontSize: '0.75rem', color: '#8F9BB3', marginTop: '2px' }}>{acc.accountNumber}</div>
                    </div>
                    {newPrimarySelection === acc.id && <i className="fas fa-check-circle" style={{ color: '#2C8E5A', fontSize: '1.2rem' }}></i>}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button 
                  type="button"
                  suppressHydrationWarning
                  className="bd-icon-btn" 
                  style={{ flex: 1, padding: '14px', height: 'auto', borderRadius: '14px', background: '#F8FAFF', border: '1px solid #EEF2F8', color: '#1A1E2B', fontWeight: 600, fontSize: '0.95rem' }}
                  onClick={() => setSelectPrimaryModal({isOpen: false, deleteId: null})}
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  suppressHydrationWarning
                  className="bd-save-btn" 
                  style={{ flex: 1, margin: 0, borderRadius: '14px', fontSize: '0.95rem', background: '#C62E2E' }}
                  onClick={() => {
                    if (newPrimarySelection && selectPrimaryModal.deleteId) {
                      setSaving(true);
                      executeDelete(selectPrimaryModal.deleteId, newPrimarySelection);
                    }
                  }}
                  disabled={saving || !newPrimarySelection}
                >
                  {saving ? 'Deleting...' : 'Confirm Delete'}
                </button>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
