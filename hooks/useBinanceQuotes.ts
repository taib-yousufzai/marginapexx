/**
 * useBinanceQuotes
 *
 * Fetches live crypto prices directly from Binance's public REST API
 * and enriches/updates them using a single shared WebSocket connection.
 */

import { useState, useEffect, useCallback } from 'react';

export interface BinanceQuoteData {
  symbol: string;       // e.g. 'BTCUSDT'
  lastPrice: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
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

// Singleton connection manager for Binance WebSockets
class BinanceWSManager {
  private ws: WebSocket | null = null;
  private listeners: Set<(data: any) => void> = new Set();
  private symbolRefCount: Map<string, number> = new Map();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private wsUrl = 'wss://stream.binance.com:9443/ws';
  private subscriptionId = 1;

  private connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    console.log('[BinanceWS] Connecting to:', this.wsUrl);
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      console.log('[BinanceWS] Connection established');
      // Resubscribe to all symbols
      const activeSymbols = Array.from(this.symbolRefCount.keys());
      if (activeSymbols.length > 0) {
        const params = activeSymbols.map(s => `${s.toLowerCase()}@ticker`);
        this.ws?.send(JSON.stringify({
          method: 'SUBSCRIBE',
          params,
          id: this.subscriptionId++,
        }));
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        // Combined stream / standard payload check
        const data = payload.data || payload;
        if (data && data.e === '24hrTicker') {
          for (const listener of this.listeners) {
            listener(data);
          }
        }
      } catch (err) {
        console.error('[BinanceWS] Parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.warn('[BinanceWS] Connection closed, scheduling reconnect...');
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.warn('[BinanceWS] Socket error:', err);
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
  }

  public subscribe(symbols: string[], listener: (data: any) => void) {
    this.listeners.add(listener);
    this.connect();

    const toSubscribe: string[] = [];
    for (const sym of symbols) {
      const count = this.symbolRefCount.get(sym) || 0;
      this.symbolRefCount.set(sym, count + 1);
      if (count === 0) {
        toSubscribe.push(`${sym.toLowerCase()}@ticker`);
      }
    }

    if (toSubscribe.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        method: 'SUBSCRIBE',
        params: toSubscribe,
        id: this.subscriptionId++,
      }));
    }
  }

  public unsubscribe(symbols: string[], listener: (data: any) => void) {
    const toUnsubscribe: string[] = [];
    for (const sym of symbols) {
      const count = this.symbolRefCount.get(sym) || 0;
      if (count <= 1) {
        this.symbolRefCount.delete(sym);
        toUnsubscribe.push(`${sym.toLowerCase()}@ticker`);
      } else {
        this.symbolRefCount.set(sym, count - 1);
      }
    }

    if (toUnsubscribe.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        method: 'UNSUBSCRIBE',
        params: toUnsubscribe,
        id: this.subscriptionId++,
      }));
    }

    if (this.symbolRefCount.size === 0) {
      this.listeners.delete(listener);
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    }
  }
}

const wsManager = new BinanceWSManager();

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
          bid: parseFloat(ticker.lastPrice) * 0.9995,
          ask: parseFloat(ticker.lastPrice) * 1.0005,
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
    const currentSymbols = symbolsKey.split(',').filter(Boolean);
    if (currentSymbols.length === 0) {
      setLoading(false);
      return;
    }

    // Populate cache instantly
    fetchQuotes();

    const onMessage = (data: any) => {
      const symbol = data.s;
      if (!currentSymbols.includes(symbol)) return;

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
        bid: parseFloat(data.c) * 0.9995,
        ask: parseFloat(data.c) * 1.0005,
      };

      setQuotes(prev => {
        const updated = { ...prev };
        updated[symbol] = quoteData;
        return updated;
      });
    };

    wsManager.subscribe(currentSymbols, onMessage);

    return () => {
      wsManager.unsubscribe(currentSymbols, onMessage);
    };
  }, [symbolsKey, fetchQuotes]);

  return { quotes, loading, error, refresh: fetchQuotes };
}
