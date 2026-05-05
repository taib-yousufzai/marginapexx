'use client';

import React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function OptionChainPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const symbol = searchParams.get('symbol') || 'NIFTY';

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '30px' }}>
        <button 
          onClick={() => router.back()} 
          style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', marginRight: '15px' }}
        >
          <i className="fas fa-arrow-left"></i>
        </button>
        <h1 style={{ margin: 0 }}>Option Chain</h1>
      </div>
      
      <div style={{ padding: '30px', background: 'var(--card-bg, #fff)', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', textAlign: 'center' }}>
        <i className="fas fa-link" style={{ fontSize: '3rem', color: '#059669', marginBottom: '20px' }}></i>
        <h2 style={{ margin: '0 0 10px 0' }}>{symbol}</h2>
        <p style={{ color: 'var(--text-secondary, #666)', marginBottom: '20px' }}>
          This is a placeholder page for the {symbol} option chain.
        </p>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted, #999)' }}>
          Detailed options data (Call/Put OI, Greeks, Strike Prices) will be implemented here.
        </p>
      </div>
    </div>
  );
}
