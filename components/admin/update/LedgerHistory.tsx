'use client';
import React, { useState, useEffect } from 'react';
import { apiCall, Toast, ToastState } from '../AdminUtils';

type LedgerEntry = {
  id: string;
  user_id: string;
  entry_type: 'DEPOSIT' | 'WITHDRAWAL' | 'ADJUSTMENT' | 'CORRECTION' | 'REFUND';
  direction: 'CREDIT' | 'DEBIT';
  amount: number;
  remarks: string | null;
  pay_request_id: string | null;
  balance_after: number | null;
  created_at: string;
};

export default function LedgerHistory({ selectedUser }: { selectedUser: { id: string } }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastState>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const uid = selectedUser.id;
  const rowsPerPage = 20;
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));

  const fmt = (n: number | null | undefined) => {
    if (n === null || n === undefined || isNaN(n)) return '0.00';
    return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  useEffect(() => {
    setLoading(true);
    apiCall(`/api/admin/users/${uid}/ledger-history?page=${page}&rows=${rowsPerPage}`, { method: 'GET' })
      .then((res) => {
        setLoading(false);
        if (res.ok) {
          const payload = res.data as { data: LedgerEntry[]; total: number };
          setEntries(payload.data || []);
          setTotal(payload.total || 0);
        } else {
          setToast({ message: 'Failed to load ledger history', type: 'error' });
        }
      })
      .catch(() => {
        setLoading(false);
        setToast({ message: 'Network error', type: 'error' });
      });
  }, [uid, page]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  const getEntryLabel = (type: string) => {
    return type.charAt(0) + type.slice(1).toLowerCase();
  };

  return (
    <div className="adm-upd-root" style={{ padding: '0 0 40px 0' }}>
      <Toast toast={toast} onDismiss={() => setToast(null)} />
      
      <div className="adm-upd-section-title">Ledger History</div>
      <p style={{ color: '#8b949e', fontSize: '14px', marginBottom: 20 }}>
        Chronological record of all balance adjustments, deposits, and withdrawals for this user.
      </p>

      <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 8, overflow: 'hidden' }}>
        <table className="adm-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#21262d', color: '#8b949e', fontSize: '12px', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Date & Time</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Type</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>Remarks</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Amount</th>
              <th style={{ padding: '12px 16px', fontWeight: 600, textAlign: 'right' }}>Balance After</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: '30px', textAlign: 'center', color: '#8b949e' }}>
                  Loading history...
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: '#8b949e' }}>
                  No ledger history found for this user.
                </td>
              </tr>
            ) : (
              entries.map((entry) => {
                const isCredit = entry.direction === 'CREDIT';
                return (
                  <tr key={entry.id} style={{ borderTop: '1px solid #30363d', fontSize: '13px' }}>
                    <td style={{ padding: '12px 16px', color: '#c9d1d9', whiteSpace: 'nowrap' }}>
                      {formatDate(entry.created_at)}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        background: '#21262d', color: '#8b949e',
                        padding: '2px 8px', borderRadius: 12, fontSize: '11px', fontWeight: 600,
                      }}>
                        {getEntryLabel(entry.entry_type)}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#8b949e', maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {entry.remarks || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: isCredit ? '#10b981' : '#f43f5e' }}>
                      {isCredit ? '+' : '-'} ₹{fmt(entry.amount)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: '#e6edf3', fontWeight: 600 }}>
                      {entry.balance_after !== null ? `₹${fmt(entry.balance_after)}` : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {entries.length > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderTop: '1px solid #30363d', background: '#0d1117'
          }}>
            <span style={{ color: '#8b949e', fontSize: '12px' }}>
              Page {page} of {totalPages}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                style={{
                  background: 'transparent', border: '1px solid #30363d', color: '#c9d1d9',
                  padding: '4px 12px', borderRadius: 4, cursor: page <= 1 ? 'not-allowed' : 'pointer',
                  opacity: page <= 1 ? 0.5 : 1, fontSize: '12px'
                }}
              >
                Prev
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                style={{
                  background: '#21262d', border: '1px solid #30363d', color: '#e6edf3',
                  padding: '4px 12px', borderRadius: 4, cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                  opacity: page >= totalPages ? 0.5 : 1, fontSize: '12px'
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
