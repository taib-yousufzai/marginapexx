'use client';
/**
 * useBalance
 *
 * Single source of truth for the user's wallet balance.
 * - Fetches once on mount
 * - Subscribes to Supabase Realtime on `profiles` table — instant push update
 *   whenever balance or settlement_amount changes (deposit approved, PnL settled, etc.)
 * - No polling needed — Realtime handles all updates
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface BalanceState {
  balance: number;
  settlementAmount: number;
  loading: boolean;
}

export function useBalance(): BalanceState {
  const [balance, setBalance] = useState(0);
  const [settlementAmount, setSettlementAmount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async (session: any) => {
      if (!session || cancelled) return;

      // 1. Initial fetch
      try {
        const res = await fetch('/api/pay/balance', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setBalance(Number(data.balance ?? 0));
          setSettlementAmount(Math.abs(Number(data.settlementAmount ?? 0)));
        }
      } catch (err) {
        console.error('[useBalance] failed to fetch balance:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }

      // 2. Realtime subscription — fires on any UPDATE to this user's profile row
      if (channel) {
        supabase.removeChannel(channel);
      }
      channel = supabase
        .channel(`balance-realtime-${session.user.id}-${Date.now()}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'profiles',
            filter: `id=eq.${session.user.id}`,
          },
          (payload) => {
            if (cancelled) return;
            const updated = payload.new as Record<string, unknown>;
            if (updated) {
              setBalance(Number(updated.balance ?? 0));
              setSettlementAmount(Math.abs(Number(updated.settlement_amount ?? 0)));
            }
          },
        )
        .subscribe();
    };

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        init(session);
      } else {
        if (!cancelled) setLoading(false);
      }
    });

    // Check current session immediately in case it's already cached
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        init(session);
      } else {
        // Give a tiny grace period, then mark loading as false if still no session
        setTimeout(() => {
          if (!cancelled && !session) setLoading(false);
        }, 500);
      }
    });

    const handleOrderPlaced = () => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) init(session);
      });
    };
    window.addEventListener('order_placed', handleOrderPlaced);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
      window.removeEventListener('order_placed', handleOrderPlaced);
    };
  }, []);

  return { balance, settlementAmount, loading };
}
