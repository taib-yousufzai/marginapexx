'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { getSession } from '@/lib/auth';
import type { Session } from '@supabase/supabase-js';
import './page.css';

interface Transaction {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  created_at: string;
}

export default function TransactionHistoryPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('marginApexTheme');
    document.body.classList.remove('dark', 'black');
    if (saved === 'dark' || saved === 'black') document.body.classList.add(saved);
  }, []);

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
        const res = await fetch('/api/pay/history', { 
            headers: { Authorization: `Bearer ${s.access_token}` } 
        });
        if (res.ok) {
          const data = await res.json();
          setTransactions(data);
        }
      } catch (e) {}
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const formatAmount = (amount: number) => {
    return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-IN', { 
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  };

  // Convert status to Title Case for better aesthetics
  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  return (
    <div className="desktop-layout">
      <Sidebar />
      <main className="main-viewport">
        <div className="app-container th-root">
          <div className="th-header">
            <Link href="/profile" className="th-back-btn" suppressHydrationWarning>
              <i className="fas fa-chevron-left"></i>
            </Link>
            <h1 className="th-title">Transaction History</h1>
            <div style={{width: 40}}></div>
          </div>

          <div className="th-content">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#8F9BB3' }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: '2rem', marginBottom: '10px' }}></i>
                <p>Loading transactions...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="th-empty">
                <i className="fas fa-history"></i>
                <p>No transactions found.</p>
              </div>
            ) : (
              <div className="th-list-container">
                {transactions.map(tx => (
                  <div key={tx.id} className="th-item">
                    <div className="th-info">
                      <div className={`th-icon ${tx.type.toLowerCase()}`}>
                        <i className={`fas ${tx.type === 'DEPOSIT' ? 'fa-arrow-down' : 'fa-arrow-up'}`}></i>
                      </div>
                      <div className="th-details">
                        <h3 className="th-type">{tx.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}</h3>
                        <p className="th-date">{formatDate(tx.created_at)}</p>
                      </div>
                    </div>
                    <div className="th-amount-status">
                      <div className={`th-amount ${tx.type.toLowerCase()}`}>
                        {tx.type === 'DEPOSIT' ? `+${formatAmount(tx.amount)}` : `-${formatAmount(tx.amount)}`}
                      </div>
                      <div className={`th-status-badge ${tx.status.toLowerCase()}`}>
                        <span className="status-dot"></span>
                        {formatStatus(tx.status)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
