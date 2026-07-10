/**
 * useComexQuotes
 *
 * Fetches live COMEX / commodity futures prices via the internal
 * /api/market/comex proxy route (which proxies Yahoo Finance server-side).
 * No API key required.
 *
 * Supported symbols (Yahoo Finance format):
 *   'GC=F'  → Gold COMEX Futures (USD/oz)
 *   'SI=F'  → Silver COMEX Futures (USD/oz)
 *   'HG=F'  → Copper COMEX Futures (USD/lb)
 *   'CL=F'  → WTI Crude Oil Futures (USD/bbl)
 *   'NG=F'  → Natural Gas Futures
 *   'PL=F'  → Platinum Futures
 *   'PA=F'  → Palladium Futures
 *
 * Polls every `refreshInterval` ms (default 30 000ms).
 *
 * Usage:
 *   const { quotes } = useComexQuotes(['GC=F', 'SI=F', 'CL=F']);
 *   quotes['GC=F'].lastPrice // → 2356.80
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface ComexQuoteData {
  symbol: string;          // e.g. 'GC=F'
  contractSymbol: string;  // e.g. 'GCQ26' (active front-month contract from Yahoo)
  name: string;            // e.g. 'Gold Aug 25'
  lastPrice: number;
  change: number;       // absolute change
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number;        // prev close
  volume: number;
  currency: string;     // 'USD'
  bid?: number;
  ask?: number;
}

interface UseComexQuotesResult {
  quotes: Record<string, ComexQuoteData>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

let globalComexQuotesCache: Record<string, ComexQuoteData> = {};

export function useComexQuotes(
  symbols: string[],
  refreshInterval = 30_000,
): UseComexQuotesResult {
  const [quotes, setQuotes] = useState<Record<string, ComexQuoteData>>(globalComexQuotesCache);
  const [loading, setLoading] = useState(Object.keys(globalComexQuotesCache).length === 0);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const symbolsKey = symbols.join(',');

  const fetchQuotes = useCallback(async () => {
    if (symbols.length === 0) return;

    try {
      const res = await fetch(
        `/api/market/comex?symbols=${symbols.map(s => encodeURIComponent(s)).join(',')}`,
        { cache: 'no-store' },
      );



      if (!res.ok) {
        setError(`COMEX API error: ${res.status}`);
        return;
      }

      const data = await res.json() as {
        quotes: Record<string, ComexQuoteData>;
        error?: string;
      };

      if (data.error) {
        setError(data.error);
        return;
      }

      Object.assign(globalComexQuotesCache, data.quotes ?? {});
      setQuotes(prev => ({...prev, ...(data.quotes ?? {})}));
      setError(null);
    } catch {
      setError('Network error — check connection');
    } finally {
      setLoading(false);
    }
  }, [symbolsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;

    async function init() {
      await fetchQuotes();
      if (cancelled) return;
      intervalRef.current = setInterval(fetchQuotes, refreshInterval);
    }

    init();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchQuotes, refreshInterval]);

  return { quotes, loading, error, refresh: fetchQuotes };
}
