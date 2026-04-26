/**
 * KiteConnectButton
 *
 * On mount:
 * 1. Tries to restore the Kite session from DB if cookie is missing
 * 2. Checks connection status
 * 3. Shows "Connect Zerodha" if not connected, green "LIVE" if connected
 */

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface KiteStatus {
  connected: boolean;
  userName?: string;
  reason?: string;
}

export default function KiteConnectButton() {
  const [status, setStatus] = useState<KiteStatus | null>(null);

  useEffect(() => {
    async function init() {
      // Get the Supabase access token to send with restore request
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? '';

      // Try to restore session from DB (no-op if cookie already exists)
      try {
        await fetch('/api/kite/restore', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
      } catch {
        // Ignore — restore is best-effort
      }

      // Now check status
      try {
        const res = await fetch('/api/kite/status', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data: KiteStatus = await res.json();
        setStatus(data);
      } catch {
        setStatus({ connected: false });
      }
    }

    init();
  }, []);

  const handleConnect = () => {
    const apiKey = process.env.NEXT_PUBLIC_KITE_API_KEY ?? '6029iuextwfch9pp';
    const redirectUrl = encodeURIComponent('http://localhost:3000/api/kite/callback');
    window.open(
      `https://kite.trade/connect/login?api_key=${apiKey}&v=3&redirect_url=${redirectUrl}`,
      '_blank',
    );
  };

  if (status === null) return null; // loading

  if (status.connected) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.7rem',
        fontWeight: 700,
        color: '#059669',
        background: 'rgba(5,150,105,0.1)',
        padding: '4px 10px',
        borderRadius: '20px',
        whiteSpace: 'nowrap',
      }}>
        <span style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: '#059669',
          display: 'inline-block',
        }} />
        LIVE
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.7rem',
        fontWeight: 700,
        color: '#fff',
        background: '#C62E2E',
        border: 'none',
        padding: '6px 12px',
        borderRadius: '20px',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      <span>⚡</span>
      Connect Zerodha
    </button>
  );
}
