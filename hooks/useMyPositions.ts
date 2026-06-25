/**
 * useMyPositions
 * 
 * Fetches internal platform positions from /api/positions and
 * enriches them with live LTP from Zerodha Kite.
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useMarketQuotes } from './useMarketQuotes';
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

      const controller = new AbortController();
      const res = await fetch('/api/positions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!res.ok) throw new Error('Failed to fetch positions');
      const data = await res.json();
      const newPositions: MyPosition[] = data.positions || [];

      // Only update state if something actually changed — avoids unnecessary
      // re-renders (and the visible layout shift) when data is identical
      const didChange =
        newPositions.length !== globalPositionsCache.length ||
        newPositions.some((p, i) => {
          const cached = globalPositionsCache[i];
          return (
            !cached ||
            p.id !== cached.id ||
            p.qty_open !== cached.qty_open ||
            p.avg_price !== cached.avg_price ||
            p.status !== cached.status ||
            p.product_type !== cached.product_type ||
            p.ltp !== cached.ltp
          );
        });

      if (didChange) {
        globalPositionsCache = newPositions;
        setRawPositions(newPositions);
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
    const timer = setInterval(fetchPositions, 5000); // DB fetch fallback

    // Remove any stale channel with the same name before subscribing (handles
    // React strict-mode double-invocation and hot-reload re-runs where the
    // channel already exists in a subscribed state and calling .on() on it
    // throws "cannot add postgres_changes callbacks after subscribe()").
    const stale = supabase.getChannels().find(c => c.topic === 'realtime:my-positions-realtime');
    if (stale) supabase.removeChannel(stale);

    const channel = supabase
      .channel('my-positions-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'positions' },
        () => {
          fetchPositions();
        }
      )
      .subscribe();

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [fetchPositions]);

  // Group instrument keys by segment
  const { kiteKeys, binanceKeys, comexKeys } = useMemo(() => {
    const kite: string[] = [];
    const binance: string[] = [];
    const comex: string[] = [];

    rawPositions.filter(p => p.status === 'open' || p.status === 'active').forEach(p => {
      const seg = (p.settlement || '').toUpperCase();
      if (seg.includes('CRYPTO') || seg === 'USDT' || p.symbol.endsWith('USDT')) {
        // Binance API expects symbols without slashes like BTCUSDT
        let sym = p.symbol.replace('/', '');
        if (!sym.endsWith('USDT')) {
          sym = sym + 'USDT';
        }
        binance.push(sym);
      } else if (seg.includes('COMEX') || p.symbol.endsWith('=F')) {
        comex.push(p.symbol);
      } else {
        kite.push(p.kite_instrument || p.symbol);
      }
    });

    return { kiteKeys: kite, binanceKeys: binance, comexKeys: comex };
  }, [rawPositions]);

  // Combine Kite and Binance symbols for the unified hook
  const marketSymbols = useMemo(() => [...kiteKeys, ...binanceKeys], [kiteKeys, binanceKeys]);
  const { quotes: marketQuotes } = useMarketQuotes(marketSymbols);
  const { quotes: comexQuotes } = useComexQuotes(comexKeys, refreshInterval);

  // Enrich positions with live calculations
  const enrichedPositions = useMemo(() => {
    // Pre-build settings map to avoid O(n²) finds per tick
    const settingsMap = new Map<string, any>();
    for (const s of segmentSettings) {
      settingsMap.set(`${s.segment}|${s.side}`, s);
    }

    return rawPositions.map(p => {
      // Overwrite product_type if there is an in-flight conversion for this position
      const product_type = inFlightConversions[p.id] || p.product_type;

      const seg = (p.settlement || '').toUpperCase();
      let ltp = p.ltp || p.entry_price;
      
      if (seg.includes('CRYPTO') || seg === 'USDT' || p.symbol.endsWith('USDT')) {
        let binanceKey = p.symbol.replace('/', '');
        if (!binanceKey.endsWith('USDT')) {
          binanceKey = binanceKey + 'USDT';
        }
        ltp = marketQuotes[binanceKey]?.lastPrice ?? ltp;
      } else if (seg.includes('COMEX') || p.symbol.endsWith('=F')) {
        ltp = comexQuotes[p.symbol]?.lastPrice ?? ltp;
      } else {
        const kiteKey = p.kite_instrument || p.symbol;
        ltp = marketQuotes[kiteKey]?.lastPrice ?? ltp;
      }

      // Derive DB segment once — used for both PnL and anti-scalping calculations
      const dbSeg = mapSegmentToDbSegment(p.settlement || '');

      const avgPrice = p.avg_price || p.entry_price;

      // Retrieve segment-specific exit buffer (fallback to 0.0017)
      const sideSetting = settingsMap.get(`${dbSeg}|${p.side}`);
      const exitBuffer = sideSetting ? Number(sideSetting.exit_buffer ?? 0.0017) : 0.0017;

      let unrealised = 0;
      if ((p.status === 'open' || p.status === 'active') && p.qty_open !== 0) {
        if (p.side === 'BUY') {
          // BUY (Long) exits at raw LTP
          unrealised = (ltp - avgPrice) * p.qty_open;
        } else {
          // SELL (Short) exits at raw LTP
          unrealised = (avgPrice - ltp) * p.qty_open;
        }
      }

      const total_pnl = (p.status === 'closed') ? p.pnl : unrealised;
      const investment = avgPrice * p.qty_open;
      const pnl_percent = investment > 0 ? (total_pnl / investment) * 100 : 0;

      // Anti-scalping hold lock
      // The hold period is determined ONCE based on entry-time PnL direction,
      // not re-evaluated on every tick. Re-evaluating on every tick causes the
      // button to flicker when LTP oscillates around avg price.
      //
      // Logic: at entry the user filled at avg_price. The entry buffer baked into
      // avg_price means a BUY fill is always slightly above raw LTP (and a SELL
      // fill slightly below). So at the very moment of entry the position is
      // always technically at a small "loss" vs raw LTP — meaning lossHoldSec
      // would always apply if we used live LTP. Instead we compare avg_price to
      // entry_price (the original order price) to decide the intent direction,
      // and simply use profitHoldSec as the required hold for all new positions
      // (the conservative, intended behaviour of anti-scalping).
      //
      // Once elapsedSec >= profitHoldSec the position is permanently unlocked
      // regardless of subsequent LTP movement.
      const profitHoldSec = sideSetting ? Number(sideSetting.profit_hold_sec) : 0;

      const elapsedSec   = Math.floor((Date.now() - new Date(p.entry_time).getTime()) / 1000);
      const isLocked     = (p.status === 'open' || p.status === 'active') && elapsedSec < profitHoldSec;
      const remainingSec = isLocked ? (profitHoldSec - elapsedSec) : 0;

      return {
        ...p,
        product_type,
        current_ltp: ltp,
        unrealised_pnl: (p.status === 'closed') ? 0 : unrealised,
        total_pnl,
        pnl_percent: parseFloat(pnl_percent.toFixed(2)),
        hold_lock_active: isLocked,
        remaining_hold_seconds: remainingSec,
        required_hold_seconds: profitHoldSec
      } as EnrichedPosition;
    });
  }, [rawPositions, marketQuotes, comexQuotes, inFlightConversions, segmentSettings]);

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
