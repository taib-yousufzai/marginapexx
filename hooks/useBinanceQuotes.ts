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

let globalBinanceQuotesCache: Record<string, BinanceQuoteData> = {};

export function useBinanceQuotes(
  symbols: string[],
  refreshInterval = 5000,
): UseBinanceQuotesResult {
  const [quotes, setQuotes] = useState<Record<string, BinanceQuoteData>>(globalBinanceQuotesCache);
  const [loading, setLoading] = useState(Object.keys(globalBinanceQuotesCache).length === 0);
  const [error, setError] = useState<string | null>(null);
  const symbolsKey = symbols.join(',');

  // Initial REST fetch for instant data on page load
  const fetchQuotes = useCallback(async () => {
    if (symbols.length === 0) return;

    try {
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

      Object.assign(globalBinanceQuotesCache, mapped);
      setQuotes(prev => ({...prev, ...mapped}));
      setError(null);
    } catch {
      setError('REST fetch failed');
    } finally {
      setLoading(false);
    }
  }, [symbolsKey]);

  // Real-time WebSocket connection
  useEffect(() => {
    if (symbols.length === 0) {
      setLoading(false);
      return;
    }

    // Do REST lookup first to populate cache immediately
    fetchQuotes();

    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    function connect() {
      if (isCancelled) return;

      const streams = symbols.map(s => `${s.toLowerCase()}@ticker`).join('/');
      const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (isCancelled) return;
        setError(null);
      };

      ws.onmessage = (event) => {
        if (isCancelled) return;
        try {
          const payload = JSON.parse(event.data);
          const data = payload.data;
          if (!data || data.e !== '24hrTicker') return;

          const symbol = data.s;
          const quoteData: BinanceQuoteData = {
            symbol,
            lastPrice: parseFloat(data.c),
            change: parseFloat(data.p),
            changePercent: parseFloat(data.P),
            open: parseFloat(data.o),
            high: parseFloat(data.h),
            low: parseFloat(data.l),
            close: parseFloat(data.x),
            volume: parseFloat(data.v),
            quoteVolume: parseFloat(data.q),
            bid: parseFloat(data.b),
            ask: parseFloat(data.a),
          };

          setQuotes(prev => {
            const updated = { ...prev };
            updated[symbol] = quoteData;
            return updated;
          });
        } catch (err) {
          console.error('[Binance WS] Parse error:', err);
        }
      };

      ws.onerror = () => {
        setError('Binance WebSocket error');
      };

      ws.onclose = () => {
        if (isCancelled) return;
        reconnectTimeout = setTimeout(connect, 3000); // Reconnect in 3s
      };
    }

    connect();

    return () => {
      isCancelled = true;
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, [symbolsKey, fetchQuotes]);

  return { quotes, loading, error, refresh: fetchQuotes };
}
