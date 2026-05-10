/**
 * useKiteQuotes
 *
 * Fetches live prices from Kite Connect via /api/kite/quotes.
 * Polls every `refreshInterval` ms (default 5000ms = 5 seconds).
 *
 * On mount, checks /api/kite/status first (which also triggers session
 * restore from DB). Only starts polling quotes once the session is confirmed.
 *
 * Returns a map of instrument key → { lastPrice, change, changePercent, ohlc }
 * Falls back gracefully if Kite is not connected (returns empty map).
 *
 * Usage:
 *   const { quotes, connected, loading } = useKiteQuotes([
 *     'NSE:NIFTY 50', 'BSE:SENSEX', 'NSE:BANKNIFTY'
 *   ]);
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { kiteRestore, kiteStatus } from '@/lib/kiteClient';
import { useStore } from '@/lib/store';

export interface QuoteData {
  lastPrice: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  bid: number;
  ask: number;
}

interface UseKiteQuotesResult {
  quotes: Record<string, QuoteData>;
  connected: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useKiteQuotes(
  instruments: string[],
  refreshInterval = 5000,
): UseKiteQuotesResult {
  const globalQuotes = useStore((state) => state.quotes);
  const updateGlobalQuotes = useStore((state) => state.updateQuotes);
  
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const instrumentsKey = instruments.join(',');

  const fetchQuotes = useCallback(async () => {
    if (instruments.length === 0) {
      setLoading(false);
      return;
    }

    try {
      let response: Response;
      
      // Use POST if we have many instruments to avoid URL length limits
      if (instruments.length > 50) {
        response = await fetch('/api/kite/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruments }),
          cache: 'no-store',
        });
      } else {
        const params = new URLSearchParams();
        instruments.forEach(inst => params.append('instruments', inst));
        response = await fetch(`/api/kite/quotes?${params.toString()}`, {
          cache: 'no-store',
        });
      }

      if (response.status === 401 || response.status === 403) {
        console.warn('[useKiteQuotes] Session expired or unauthorized');
        setConnected(false);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const body = await response.json() as { error?: string };
        setError(body.error ?? 'Failed to fetch quotes');
        setLoading(false);
        return;
      }

      const data = await response.json() as {
        data: Record<string, {
          last_price: number;
          net_change: number;
          ohlc: { open: number; high: number; low: number; close: number };
          volume: number;
        }>;
      };

      const mapped: Record<string, QuoteData> = {};
      const returnedData = data.data || {};
      
      const returnedKeys = Object.keys(returnedData);
      if (returnedKeys.length > 0) {
        console.log(`[useKiteQuotes] Received ${returnedKeys.length} quotes. Sample key: ${returnedKeys[0]}`);
      }

      for (const [key, quote] of Object.entries(returnedData)) {
        if (!quote) continue;

        const close = quote.ohlc?.close || 0;
        const changePercent = close > 0
          ? ((quote.last_price - close) / close) * 100
          : 0;

        const quoteData: QuoteData = {
          lastPrice: quote.last_price,
          change: quote.net_change,
          changePercent: parseFloat(changePercent.toFixed(2)),
          open: quote.ohlc?.open || 0,
          high: quote.ohlc?.high || 0,
          low: quote.ohlc?.low || 0,
          close: close,
          volume: quote.volume || 0,
          bid: (quote as any).depth?.buy?.[0]?.price || quote.last_price,
          ask: (quote as any).depth?.sell?.[0]?.price || quote.last_price,
        };

        mapped[key] = quoteData;
        
        // Also map by tradingsymbol as a fallback if the key is different
        if ((quote as any).tradingsymbol) {
          mapped[(quote as any).tradingsymbol] = quoteData;
        }
      }

      updateGlobalQuotes(mapped);
      setConnected(true);
      setError(null);
    } catch (err) {
      console.error('[useKiteQuotes] Error:', err);
      setError('Network error fetching quotes');
    } finally {
      setLoading(false);
    }
  }, [instrumentsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;

    async function init() {
      await kiteRestore();
      if (cancelled) return;

      try {
        const status = await kiteStatus();
        setConnected(status.connected);
      } catch {
        setConnected(false);
      }

      if (cancelled) return;

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

  // Filter global quotes to only include requested instruments
  const filteredQuotes = instruments.reduce((acc, symbol) => {
    if (globalQuotes[symbol]) acc[symbol] = globalQuotes[symbol];
    return acc;
  }, {} as Record<string, QuoteData>);

  return { quotes: filteredQuotes, connected, loading, error, refresh: fetchQuotes };
}
