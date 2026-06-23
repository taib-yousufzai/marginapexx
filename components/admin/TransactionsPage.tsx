'use client';
import React, { useState, useEffect } from 'react';
import { signOut } from '@/lib/auth';
import { apiCall, SkeletonCard } from './AdminUtils';
import type { PayRequest } from '@/lib/csvExport';

type TxRecord = PayRequest & { user_name: string; user_client_id?: string };

export default function TransactionsPage({ isDemoMode }: { isDemoMode: boolean }) {
  const [requests, setRequests] = useState<TxRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [dateFilter, setDateFilter] = useState<'1' | '7' | '30' | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const rowsNum = 20;

  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiCall(`/api/admin/transactions/history?demo=${isDemoMode}`, { method: 'GET' })
      .then(({ ok, status, data }) => {
        if (status === 401) { signOut(); return; }
        if (!ok) { setError('Failed to fetch transactions'); return; }
        setRequests(data as TxRecord[]);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isDemoMode]);

  // Filter and pagination
  const filtered = requests.filter(r => {
    if (search && !r.user_name.toLowerCase().includes(search.toLowerCase()) && !r.user_id.toLowerCase().includes(search.toLowerCase()) && !r.id.toLowerCase().includes(search.toLowerCase()) && !(r.user_client_id && r.user_client_id.toLowerCase().includes(search.toLowerCase()))) {
      return false;
    }
    
    if (dateFilter !== 'ALL') {
      const txDate = new Date(r.created_at);
      const now = new Date();
      const diffDays = (now.getTime() - txDate.getTime()) / (1000 * 3600 * 24);
      if (diffDays > parseInt(dateFilter)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsNum));
  const displayed = filtered.slice((page - 1) * rowsNum, page * rowsNum);
  
  // Format amount
  const fmtAmount = (a: number) => '₹' + a.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const statusColor = (s: string) => s === 'APPROVED' ? '#2ea043' : s === 'PENDING' ? '#e3b341' : '#f85149';

  return (
    <div className="adm-pay-root">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 className="adm-page-title" style={{ margin: 0 }}>Transaction History</h2>
      </div>

      <div className="adm-card" style={{ padding: '16px 20px', marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <i className="fas fa-search" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#8b949e', fontSize: '0.85rem' }} />
            <input 
              className="adm-upd-input" 
              placeholder="Search by User Name, ID or Request ID..." 
              style={{ width: '100%', paddingLeft: 40, height: 44, borderRadius: 10, boxSizing: 'border-box' }}
              value={search} 
              onChange={e => { setSearch(e.target.value); setPage(1); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
            />
            {showDropdown && (
              <div style={{ position: 'absolute', top: 50, left: 0, right: 0, background: '#161b22', border: '1px solid #30363d', borderRadius: 10, zIndex: 100, maxHeight: 250, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                {Array.from(new Map(requests.map(r => [r.user_id, { id: r.user_id, name: r.user_name }])).values())
                  .filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.id.toLowerCase().includes(search.toLowerCase()))
                  .map(u => (
                    <div 
                      key={u.id} 
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #21262d', color: '#c9d1d9', display: 'flex', flexDirection: 'column' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#21262d'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      onClick={() => { setSearch(u.name); setPage(1); setShowDropdown(false); }}
                    >
                      <span style={{ fontWeight: 600 }}>{u.name}</span>
                      <span style={{ fontSize: '0.75rem', color: '#8b949e' }}>{u.id}</span>
                    </div>
                  ))}
                {Array.from(new Map(requests.map(r => [r.user_id, { id: r.user_id, name: r.user_name }])).values())
                  .filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.id.toLowerCase().includes(search.toLowerCase())).length === 0 && (
                    <div style={{ padding: '14px', color: '#8b949e', fontSize: '0.85rem', textAlign: 'center' }}>No users found</div>
                  )}
              </div>
            )}
          </div>
          <div style={{ width: 200 }}>
            <select 
              className="adm-upd-input" 
              style={{ width: '100%', height: 44, borderRadius: 10, cursor: 'pointer' }}
              value={dateFilter} onChange={e => { setDateFilter(e.target.value as any); setPage(1); }}
            >
              <option value="ALL">All Time</option>
              <option value="1">Last 24 Hours</option>
              <option value="7">Last 7 Days</option>
              <option value="30">Last 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      <div className="adm-pay-list">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} rows={3} />)}
          </div>
        ) : error ? (
           <div className="adm-dashed-box" style={{ borderColor: '#f85149', color: '#f85149' }}>{error}</div>
        ) : displayed.length === 0 ? (
           <div className="adm-dashed-box">No transactions found matching your criteria.</div>
        ) : displayed.map(r => (
          <div className="adm-pay-card" key={r.id}>
             <div className="adm-pay-card-top" style={{ borderBottom: 'none', paddingBottom: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '12px', background: r.type === 'DEPOSIT' ? 'rgba(46, 160, 67, 0.1)' : 'rgba(248, 81, 73, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: r.type === 'DEPOSIT' ? '#2ea043' : '#f85149', fontSize: '1.2rem', flexShrink: 0 }}>
                    <i className={r.type === 'DEPOSIT' ? 'fas fa-arrow-down' : 'fas fa-arrow-up'} />
                  </div>
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div className="adm-pay-uid" style={{ color: '#c9d1d9', fontSize: '1.1rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.user_name}</div>
                    <div className="adm-pay-time" style={{ marginTop: 2, whiteSpace: 'nowrap' }}>
                      <i className="far fa-user" style={{ marginRight: 6, fontSize: '0.75rem' }} /> {r.user_client_id || r.user_id.slice(0, 13) + '...'}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0, paddingLeft: 8 }}>
                    <div className="adm-pay-dv bold" style={{ fontSize: '1.15rem', color: r.type === 'DEPOSIT' ? '#2ea043' : '#f85149', whiteSpace: 'nowrap' }}>
                        {r.type === 'DEPOSIT' ? '+' : '-'}{fmtAmount(r.amount)}
                    </div>
                    <span className="adm-pay-status" style={{ background: statusColor(r.status) + '15', color: statusColor(r.status), border: `1px solid ${statusColor(r.status)}40`, padding: '2px 8px', fontSize: '0.7rem', borderRadius: 6, fontWeight: 700 }}>
                      {r.status}
                    </span>
                </div>
              </div>
              <div style={{ marginTop: 16, borderTop: '1px solid #21262d', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
                  <div className="adm-pay-time" style={{ display: 'flex', alignItems: 'center' }}>
                      <i className="far fa-clock" style={{ marginRight: 6 }} />
                      {new Date(r.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                  </div>
                  <div className="adm-pay-time" style={{ display: 'flex', alignItems: 'center' }}>
                      ID: {r.id.slice(0, 8)}...
                  </div>
              </div>
          </div>
        ))}
      </div>

      {displayed.length > 0 && (
        <div className="adm-pos-pagination" style={{ marginTop: 24 }}>
          <span className="adm-pos-page-info">Showing page {page} of {totalPages}</span>
          <div className="adm-pos-page-btns">
            <button className="adm-pos-page-btn" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <i className="fas fa-chevron-left" />
            </button>
            <button className="adm-pos-page-btn active-btn" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <i className="fas fa-chevron-right" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
