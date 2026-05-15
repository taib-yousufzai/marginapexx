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
import { useBinanceQuotes } from './useBinanceQuotes';
import { useComexQuotes } from './useComexQuotes';
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
    const timer = setInterval(fetchPositions, 1000); // DB fetch every 1s
    return () => clearInterval(timer);
  }, [fetchPositions]);

  // Group instrument keys by segment
  const { kiteKeys, binanceKeys, comexKeys } = useMemo(() => {
    const kite: string[] = [];
    const binance: string[] = [];
    const comex: string[] = [];

    rawPositions.filter(p => p.status === 'open' || p.status === 'active').forEach(p => {
      const seg = (p.settlement || '').toUpperCase();
      if (seg.includes('CRYPTO')) {
        // Binance API expects symbols without slashes like BTCUSDT
        binance.push(p.symbol.replace('/', ''));
      } else if (seg.includes('COMEX') || p.symbol.endsWith('=F')) {
        comex.push(p.symbol);
      } else {
        kite.push(p.symbol);
      }
    });

    return { kiteKeys: kite, binanceKeys: binance, comexKeys: comex };
  }, [rawPositions]);

  // Use the respective hooks for each segment
  const { quotes: kiteQuotes } = useKiteQuotes(kiteKeys, refreshInterval);
  const { quotes: binanceQuotes } = useBinanceQuotes(binanceKeys, refreshInterval);
  const { quotes: comexQuotes } = useComexQuotes(comexKeys, refreshInterval);

  // Enrich positions with live calculations
  const enrichedPositions = useMemo(() => {
    return rawPositions.map(p => {
      const seg = (p.settlement || '').toUpperCase();
      let ltp = p.ltp || p.entry_price;
      
      if (seg.includes('CRYPTO')) {
        const binanceKey = p.symbol.replace('/', '');
        ltp = binanceQuotes[binanceKey]?.lastPrice ?? ltp;
      } else if (seg.includes('COMEX') || p.symbol.endsWith('=F')) {
        ltp = comexQuotes[p.symbol]?.lastPrice ?? ltp;
      } else {
        ltp = kiteQuotes[p.symbol]?.lastPrice ?? ltp;
      }

      let unrealised = 0;
      if ((p.status === 'open' || p.status === 'active') && p.qty_open !== 0) {
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
  }, [rawPositions, kiteQuotes, binanceQuotes, comexQuotes]);

  return { positions: enrichedPositions, loading, error, refresh: fetchPositions };
}
