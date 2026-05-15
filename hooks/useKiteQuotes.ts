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
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [connected, setConnected] = useState(false);
  // Start in loading=true so the UI shows a spinner, not "No live data",
  // while we check the session status on mount.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const instrumentsKey = instruments.join(',');

  const doFetch = useCallback(async (): Promise<boolean> => {
    if (instruments.length === 0) {
      setLoading(false);
      return true;
    }

    let response: Response;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      // Use POST if we have many instruments to avoid URL length limits
      if (instruments.length > 50) {
        response = await fetch('/api/kite/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruments }),
          cache: 'no-store',
          signal: controller.signal,
        });
      } else {
        const params = new URLSearchParams();
        instruments.forEach(inst => params.append('instruments', inst));
        response = await fetch(`/api/kite/quotes?${params.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
      }
    } catch (err) {
      clearTimeout(timeoutId);
      // AbortError = timeout, ignore silently
      if (err instanceof Error && err.name === 'AbortError') return true;
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // Signal to the caller that the token was rejected
    if (response.status === 401 || response.status === 403) {
      setConnected(false);
      return false; // token invalid
    }

    if (!response.ok) {
      const body = await response.json() as { error?: string };
      setError(body.error ?? 'Failed to fetch quotes');
      return true; // not a token issue, don't retry
    }

    const data = await response.json() as {
      data: Record<string, {
        last_price: number;
        net_change: number;
        ohlc: { open: number; high: number; low: number; close: number };
        volume: number;
        depth?: {
          buy: { price: number; quantity: number; orders: number }[];
          sell: { price: number; quantity: number; orders: number }[];
        };
        tradingsymbol?: string;
        instrument_token?: number;
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
        bid: quote.depth?.buy?.[0]?.price || quote.last_price,
        ask: quote.depth?.sell?.[0]?.price || quote.last_price,
      };
      
      mapped[key] = quoteData;

      // Extract symbol from key (e.g., 'NSE:NIFTY 50' -> 'NIFTY 50')
      const symbolPart = key.includes(':') ? key.split(':')[1] : key;
      mapped[symbolPart] = quoteData;

      // Also map by tradingsymbol from response if it exists
      if (quote.tradingsymbol) {
        mapped[quote.tradingsymbol] = quoteData;
      }
      
      // Map by instrument_token as a last resort
      if (quote.instrument_token) {
        mapped[String(quote.instrument_token)] = quoteData;
      }
    }

    setQuotes(mapped);
    setConnected(true);
    setError(null);
    return true;
  }, [instrumentsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * fetchQuotes — the public refresh function and the polling target.
   * If the server rejects the token (401/403 from Kite), it calls
   * kiteRestore() to pull the latest token from Supabase (written by
   * the GitHub Action cron) into the browser cookie, then retries once.
   */
  const fetchQuotes = useCallback(async () => {
    try {
      const ok = await doFetch();
      if (!ok) {
        // Token was rejected — attempt to restore from DB then retry
        console.warn('[useKiteQuotes] Token rejected, running kiteRestore() and retrying...');
        await kiteRestore();
        await doFetch(); // one retry with the fresh cookie
      }
    } catch (err) {
      // Silently ignore AbortError (timeout) - it's expected behavior
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      console.error('[useKiteQuotes] Error:', err);
      setError('Network error fetching quotes');
    } finally {
      setLoading(false);
    }
  }, [doFetch]);  

  useEffect(() => {
    let cancelled = false;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      if (cancelled) return;
      await fetchQuotes();
      if (!cancelled) {
        timerId = setTimeout(poll, refreshInterval);
      }
    }

    async function init() {
      if (cancelled) return;

      try {
        const status = await kiteStatus();
        setConnected(status.connected);
      } catch {
        setConnected(false);
      }

      if (cancelled) return;
      poll(); // Start the recursive polling chain
    }

    init();

    return () => {
      cancelled = true;
      if (timerId) clearTimeout(timerId);
      if (intervalRef.current) clearInterval(intervalRef.current); // Cleanup old interval ref if any
    };
  }, [fetchQuotes, refreshInterval]);

  return { quotes, connected, loading, error, refresh: fetchQuotes };
}
