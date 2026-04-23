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

export interface QuoteData {
  lastPrice: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [connected, setConnected] = useState(false);
  // Start in loading=true so the UI shows a spinner, not "No live data",
  // while we check the session status on mount.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const instrumentsKey = instruments.join(',');

  const fetchQuotes = useCallback(async () => {
    if (instruments.length === 0) return;

    try {
      const params = new URLSearchParams();
      instruments.forEach(inst => params.append('instruments', inst));

      const response = await fetch(`/api/kite/quotes?${params.toString()}`, {
        cache: 'no-store',
      });

      if (response.status === 401 || response.status === 403) {
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
      for (const [key, quote] of Object.entries(data.data)) {
        const changePercent = quote.ohlc.close > 0
          ? ((quote.last_price - quote.ohlc.close) / quote.ohlc.close) * 100
          : 0;

        mapped[key] = {
          lastPrice: quote.last_price,
          change: quote.net_change,
          changePercent: parseFloat(changePercent.toFixed(2)),
          open: quote.ohlc.open,
          high: quote.ohlc.high,
          low: quote.ohlc.low,
          close: quote.ohlc.close,
          volume: quote.volume,
        };
      }

      setQuotes(mapped);
      setConnected(true);
      setError(null);
    } catch (err) {
      setError('Network error fetching quotes');
    } finally {
      setLoading(false);
    }
  }, [instrumentsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Step 1: restore session from DB if cookie is missing (same as KiteConnectButton)
      try {
        await fetch('/api/kite/restore', { method: 'POST' });
      } catch {
        // best-effort
      }

      if (cancelled) return;

      // Step 2: check whether a valid session exists before polling quotes
      try {
        const res = await fetch('/api/kite/status', { cache: 'no-store' });
        const status = await res.json() as { connected: boolean };
        if (!status.connected) {
          setConnected(false);
          setLoading(false);
          return;
        }
      } catch {
        setConnected(false);
        setLoading(false);
        return;
      }

      if (cancelled) return;

      // Step 3: session confirmed — fetch quotes immediately then start polling
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

  return { quotes, connected, loading, error, refresh: fetchQuotes };
}
