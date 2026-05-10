/**
 * useBinanceQuotes
 *
 * Fetches live crypto prices directly from Binance's public REST API.
 * No API key required for market data endpoints.
 *
 * Polls every `refreshInterval` ms (default 5000ms).
 * Falls back gracefully on network errors — keeps last known prices.
 *
 * Usage:
 *   const { quotes } = useBinanceQuotes(['BTCUSDT', 'ETHUSDT']);
 *   quotes['BTCUSDT'].lastPrice // → 62340.21
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface BinanceQuoteData {
  symbol: string;       // e.g. 'BTCUSDT'
  lastPrice: number;
  change: number;       // absolute change
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number;        // prev close
  volume: number;       // base asset volume
  quoteVolume: number;  // USDT volume
  bid: number;
  ask: number;
}

interface UseBinanceQuotesResult {
  quotes: Record<string, BinanceQuoteData>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const BINANCE_API = 'https://api.binance.com/api/v3/ticker/24hr';

export function useBinanceQuotes(
  symbols: string[],
  refreshInterval = 5000,
): UseBinanceQuotesResult {
  const [quotes, setQuotes] = useState<Record<string, BinanceQuoteData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const symbolsKey = symbols.join(',');

  const fetchQuotes = useCallback(async () => {
    if (symbols.length === 0) return;

    try {
      // Binance supports bulk fetch: ?symbols=["BTCUSDT","ETHUSDT"]
      const symbolsParam = encodeURIComponent(JSON.stringify(symbols));
      const res = await fetch(`${BINANCE_API}?symbols=${symbolsParam}`, {
        cache: 'no-store',
      });

      if (!res.ok) {
        setError(`Binance API error: ${res.status}`);
        return;
      }

      const data = await res.json() as Array<{
        symbol: string;
        lastPrice: string;
        priceChange: string;
        priceChangePercent: string;
        openPrice: string;
        highPrice: string;
        lowPrice: string;
        prevClosePrice: string;
        volume: string;
        quoteVolume: string;
        bidPrice: string;
        askPrice: string;
      }>;

      const mapped: Record<string, BinanceQuoteData> = {};
      for (const ticker of data) {
        mapped[ticker.symbol] = {
          symbol: ticker.symbol,
          lastPrice: parseFloat(ticker.lastPrice),
          change: parseFloat(ticker.priceChange),
          changePercent: parseFloat(ticker.priceChangePercent),
          open: parseFloat(ticker.openPrice),
          high: parseFloat(ticker.highPrice),
          low: parseFloat(ticker.lowPrice),
          close: parseFloat(ticker.prevClosePrice),
          volume: parseFloat(ticker.volume),
          quoteVolume: parseFloat(ticker.quoteVolume),
          bid: parseFloat(ticker.bidPrice),
          ask: parseFloat(ticker.askPrice),
        };
      }

      setQuotes(mapped);
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
