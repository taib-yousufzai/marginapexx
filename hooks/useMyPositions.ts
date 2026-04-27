/**
 * useMyPositions
 * 
 * Fetches internal platform positions from /api/positions and
 * enriches them with live LTP from Zerodha Kite.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useKiteQuotes } from './useKiteQuotes';
import { MyPosition } from '@/lib/types/order';

export interface EnrichedPosition extends MyPosition {
  current_ltp: number;
  unrealised_pnl: number;
  total_pnl: number;
  pnl_percent: number;
}

interface UseMyPositionsResult {
  positions: EnrichedPosition[];
  loading:   boolean;
  error:     string | null;
  refresh:   () => void;
}

export function useMyPositions(refreshInterval = 5000): UseMyPositionsResult {
  const [rawPositions, setRawPositions] = useState<MyPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/positions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store'
      });

      if (!res.ok) throw new Error('Failed to fetch positions');
      const data = await res.json();
      setRawPositions(data.positions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
    const timer = setInterval(fetchPositions, 10000); // DB fetch every 10s
    return () => clearInterval(timer);
  }, [fetchPositions]);

  // Instruments for LTP polling
  // We need to map symbol (e.g. "NIFTY FUT") back to a kite instrument if possible,
  // or store the kite_instrument in the positions table.
  // Assuming 'symbol' in positions table is actually the Kite key "EXCHANGE:SYMBOL"
  const instrumentKeys = useMemo(() => 
    rawPositions.filter(p => p.status === 'open' || p.status === 'active').map(p => p.symbol),
  [rawPositions]);

  // Use the existing Kite Quotes hook for real-time prices
  const { quotes } = useKiteQuotes(instrumentKeys, refreshInterval);

  // Enrich positions with live calculations
  const enrichedPositions = useMemo(() => {
    return rawPositions.map(p => {
      const quote = quotes[p.symbol];
      const ltp = quote ? quote.lastPrice : (p.ltp || p.entry_price);

      let unrealised = 0;
      if ((p.status === 'open' || p.status === 'active') && p.qty_open !== 0) {
        // P&L = (LTP - EntryPrice) * Qty if BUY
        // P&L = (EntryPrice - LTP) * Qty if SELL
        if (p.side === 'BUY') {
          unrealised = (ltp - p.entry_price) * p.qty_open;
        } else {
          unrealised = (p.entry_price - ltp) * p.qty_open;
        }
      }

      const total_pnl = (p.status === 'closed') ? p.pnl : unrealised;
      const investment = p.entry_price * p.qty_open;
      const pnl_percent = investment > 0 ? (total_pnl / investment) * 100 : 0;

      return {
        ...p,
        current_ltp: ltp,
        unrealised_pnl: (p.status === 'closed') ? 0 : unrealised,
        total_pnl,
        pnl_percent: parseFloat(pnl_percent.toFixed(2))
      } as EnrichedPosition;
    });
  }, [rawPositions, quotes]);

  return { positions: enrichedPositions, loading, error, refresh: fetchPositions };
}
