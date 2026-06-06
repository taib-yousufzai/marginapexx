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
  hold_lock_active: boolean;
  remaining_hold_seconds: number;
  required_hold_seconds: number;
}

interface UseMyPositionsResult {
  positions: EnrichedPosition[];
  loading:   boolean;
  error:     string | null;
  refresh:   () => Promise<void>;
  updatePositionLocally?: (posId: string, updatedFields: Partial<MyPosition>) => void;
  startConversion?: (posId: string, newType: string) => void;
  endConversion?: (posId: string) => void;
}

let globalPositionsCache: MyPosition[] = [];

const mapSegmentToDbSegment = (s: string): string => {
  if (!s) return '';
  const trimmed = s.trim();
  if (trimmed === 'NSE - Futures' || trimmed === 'BSE - Futures') return 'INDEX-FUT';
  if (trimmed === 'NSE - Options' || trimmed === 'BSE - Options') return 'INDEX-OPT';
  if (trimmed === 'NSE - Stock Futures' || trimmed === 'BSE - Stock Futures') return 'STOCK-FUT';
  if (trimmed === 'NSE - Stock Options' || trimmed === 'BSE - Stock Options') return 'STOCK-OPT';
  if (trimmed === 'MCX - Futures') return 'MCX-FUT';
  if (trimmed === 'MCX - Options') return 'MCX-OPT';
  if (trimmed === 'NSE - Equity' || trimmed === 'BSE - Equity') return 'NSE-EQ';
  if (trimmed === 'Crypto' || trimmed === 'CRYPTO') return 'CRYPTO';
  if (trimmed === 'Forex' || trimmed === 'FOREX' || trimmed === 'CDS - Futures' || trimmed === 'CDS - Options') return 'FOREX';
  if (trimmed === 'COMEX - Futures' || trimmed === 'COMEX - Options' || trimmed === 'COMEX' || trimmed === 'COI') return 'COMEX';
  return trimmed;
};

export function useMyPositions(refreshInterval = 5000): UseMyPositionsResult {
  const [rawPositions, setRawPositions] = useState<MyPosition[]>(globalPositionsCache);
  const [loading, setLoading] = useState(globalPositionsCache.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [inFlightConversions, setInFlightConversions] = useState<Record<string, string>>({});
  const [segmentSettings, setSegmentSettings] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('trading_mode')
          .eq('id', session.user.id)
          .single();
        const mode = profile?.trading_mode || 'normal';
        const res = await fetch(`/api/user/segments?mode=${mode}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (res.ok) {
          const sData = await res.json();
          setSegmentSettings(sData || []);
        }
      } catch (err) {
        console.error('Failed to fetch segment settings in useMyPositions', err);
      }
    });
  }, []);

  const updatePositionLocally = useCallback((posId: string, updatedFields: Partial<MyPosition>) => {
    setRawPositions(prev =>
      prev.map(p => (p.id === posId ? { ...p, ...updatedFields } : p))
    );
  }, []);

  const startConversion = useCallback((posId: string, newType: string) => {
    setInFlightConversions(prev => ({ ...prev, [posId]: newType }));
  }, []);

  const endConversion = useCallback((posId: string) => {
    setInFlightConversions(prev => {
      const next = { ...prev };
      delete next[posId];
      return next;
    });
  }, []);

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
      globalPositionsCache = data.positions || [];
      setRawPositions(globalPositionsCache);
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
        let sym = p.symbol.replace('/', '');
        if (!sym.endsWith('USDT')) {
          sym = sym + 'USDT';
        }
        binance.push(sym);
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
      // Overwrite product_type if there is an in-flight conversion for this position
      const product_type = inFlightConversions[p.id] || p.product_type;

      const seg = (p.settlement || '').toUpperCase();
      let ltp = p.ltp || p.entry_price;
      
      if (seg.includes('CRYPTO')) {
        let binanceKey = p.symbol.replace('/', '');
        if (!binanceKey.endsWith('USDT')) {
          binanceKey = binanceKey + 'USDT';
        }
        ltp = binanceQuotes[binanceKey]?.lastPrice ?? ltp;
      } else if (seg.includes('COMEX') || p.symbol.endsWith('=F')) {
        ltp = comexQuotes[p.symbol]?.lastPrice ?? ltp;
      } else {
        ltp = kiteQuotes[p.symbol]?.lastPrice ?? ltp;
      }

      // Derive DB segment once — used for both PnL and anti-scalping calculations
      const dbSeg = mapSegmentToDbSegment(p.settlement || '');

      let unrealised = 0;
      if ((p.status === 'open' || p.status === 'active') && p.qty_open !== 0) {
        const matchingSetting = segmentSettings.find(s => s.segment === dbSeg && s.side === 'BUY');
        const entryBuffer = matchingSetting ? matchingSetting.entry_buffer : 0.003;

        if (p.side === 'BUY') {
          // BUY: evaluates at current Ask price
          const currentAsk = (ltp * 1.001) + (ltp * entryBuffer);
          unrealised = (currentAsk - p.entry_price) * p.qty_open;
        } else {
          // SELL: evaluates at current Bid price
          const currentBid = ltp * 0.999;
          unrealised = (p.entry_price - currentBid) * p.qty_open;
        }
      }

      const total_pnl = (p.status === 'closed') ? p.pnl : unrealised;
      const investment = p.entry_price * p.qty_open;
      const pnl_percent = investment > 0 ? (total_pnl / investment) * 100 : 0;

      // Anti-Scalping calculations
      const sideSetting = segmentSettings.find(s => s.segment === dbSeg && s.side === p.side);
      const profitHoldSec = sideSetting ? Number(sideSetting.profit_hold_sec) : 120;
      const lossHoldSec = sideSetting ? Number(sideSetting.loss_hold_sec) : 0;

      const elapsedSec = Math.floor((Date.now() - new Date(p.entry_time).getTime()) / 1000);
      const requiredHold = total_pnl >= 0 ? profitHoldSec : lossHoldSec;
      const isLocked = (p.status === 'open' || p.status === 'active') && elapsedSec < requiredHold;
      const remainingSec = isLocked ? (requiredHold - elapsedSec) : 0;

      return {
        ...p,
        product_type,
        current_ltp: ltp,
        unrealised_pnl: (p.status === 'closed') ? 0 : unrealised,
        total_pnl,
        pnl_percent: parseFloat(pnl_percent.toFixed(2)),
        hold_lock_active: isLocked,
        remaining_hold_seconds: remainingSec,
        required_hold_seconds: requiredHold
      } as EnrichedPosition;
    });
  }, [rawPositions, kiteQuotes, binanceQuotes, comexQuotes, inFlightConversions, segmentSettings]);

  return {
    positions: enrichedPositions,
    loading,
    error,
    refresh: fetchPositions,
    updatePositionLocally,
    startConversion,
    endConversion
  };
}
