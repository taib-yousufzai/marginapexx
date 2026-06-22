import { useState, useEffect, useRef } from 'react';

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

// Share single WebSocket connection across all hook instances (singleton manager)
class MarketWSManager {
  private ws: WebSocket | null = null;
  private listeners: Set<(type: string, data: any) => void> = new Set();
  private symbolRefCount: Map<string, number> = new Map();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private wsUrl: string;

  constructor() {
    let url = process.env.NEXT_PUBLIC_TICKER_WS_URL;
    if (url && url.includes('vercel.app')) {
      url = '';
    }
    if (!url && process.env.NEXT_PUBLIC_TICKER_URL) {
      const tickerUrl = process.env.NEXT_PUBLIC_TICKER_URL;
      if (!tickerUrl.includes('vercel.app')) {
        url = tickerUrl.replace(/^http/, 'ws');
      }
    }
    if (!url && typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // In development, the ticker daemon runs on port 8080.
      // If we are on localhost, connect directly to port 8080. Otherwise connect to Railway production url as a safe fallback.
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        url = `${protocol}//localhost:8080`;
      } else {
        url = `wss://marginapexx-production.up.railway.app`;
      }
    }
    this.wsUrl = url || 'ws://localhost:8080';
  }

  private connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    console.log('[MarketWS] Connecting to:', this.wsUrl);
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      console.log('[MarketWS] Connection established');
      // Resubscribe to all symbols that currently have refCount > 0
      const activeSymbols = Array.from(this.symbolRefCount.keys());
      if (activeSymbols.length > 0) {
        this.ws?.send(JSON.stringify({
          action: 'subscribe',
          symbols: activeSymbols,
        }));
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'quotes') {
          // Initial quotes dump
          this.notifyListeners('quotes', payload.data);
        } else if (payload.type === 'update') {
          // Real-time single tick update
          this.notifyListeners('update', { symbol: payload.symbol, quote: payload.data });
        }
      } catch (err) {
        console.error('[MarketWS] Parse error:', err);
      }
    };

    this.ws.onclose = () => {
      console.warn('[MarketWS] Connection closed, scheduling reconnect...');
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.warn('[MarketWS] Socket error:', err);
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
  }

  private notifyListeners(type: string, data: any) {
    for (const listener of this.listeners) {
      listener(type, data);
    }
  }

  public subscribe(symbols: string[], listener: (type: string, data: any) => void) {
    this.listeners.add(listener);
    this.connect();

    const toSubscribe: string[] = [];
    for (const sym of symbols) {
      const count = this.symbolRefCount.get(sym) || 0;
      this.symbolRefCount.set(sym, count + 1);
      if (count === 0) {
        toSubscribe.push(sym);
      }
    }

    if (toSubscribe.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        symbols: toSubscribe,
      }));
    }
  }

  public unsubscribe(symbols: string[], listener: (type: string, data: any) => void) {
    const toUnsubscribe: string[] = [];
    for (const sym of symbols) {
      const count = this.symbolRefCount.get(sym) || 0;
      if (count <= 1) {
        this.symbolRefCount.delete(sym);
        toUnsubscribe.push(sym);
      } else {
        this.symbolRefCount.set(sym, count - 1);
      }
    }

    if (toUnsubscribe.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'unsubscribe',
        symbols: toUnsubscribe,
      }));
    }

    // Clean up listener if no active subscriptions remain
    if (this.symbolRefCount.size === 0) {
      this.listeners.delete(listener);
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    }
  }
}

const wsManager = new MarketWSManager();

export function useMarketQuotes(symbols: string[]) {
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const symbolsKey = symbols.join(',');
  const pendingUpdatesRef = useRef<Record<string, QuoteData>>({});

  useEffect(() => {
    const currentSymbols = symbolsKey.split(',').filter(Boolean);
    if (currentSymbols.length === 0) return;

    // Fetch initial REST snapshot to avoid empty values if WS doesn't push immediately
    const fetchInitialQuotes = async () => {
      try {
        let baseUrl = process.env.NEXT_PUBLIC_TICKER_URL;
        if (!baseUrl) {
          if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
            baseUrl = 'https://marginapexx-production.up.railway.app';
          } else {
            baseUrl = 'http://localhost:8080';
          }
        }
        
        const res = await fetch(`${baseUrl}/quotes?symbols=${currentSymbols.join(',')}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data && Object.keys(json.data).length > 0) {
            onMessage('quotes', json.data);
          }
        }
      } catch (err) {
        console.warn('[MarketQuotes] Initial fetch failed:', err);
      }
    };
    fetchInitialQuotes();

    const onMessage = (type: string, data: any) => {
      if (type === 'quotes') {
        const mapped: Record<string, QuoteData> = {};
        for (const [key, quote] of Object.entries(data)) {
          const q = quote as any;
          const close = q.ohlc?.close || q.close || 0;
          const changePercent = close > 0 ? ((q.last_price - close) / close) * 100 : 0;
          
          const quoteData: QuoteData = {
            lastPrice: q.last_price,
            change: q.last_price - close,
            changePercent: parseFloat(changePercent.toFixed(2)),
            open: q.ohlc?.open || q.open || 0,
            high: q.ohlc?.high || q.high || 0,
            low: q.ohlc?.low || q.low || 0,
            close: close,
            volume: q.volume || 0,
            // Guard against null/undefined/0 from stale Redis cache entries
            bid: (q.bid != null && q.bid > 0) ? q.bid : q.last_price * 0.9995,
            ask: (q.ask != null && q.ask > 0) ? q.ask : q.last_price * 1.0005,
          };
          mapped[key] = quoteData;
        }
        setQuotes(prev => ({ ...prev, ...mapped }));
      } else if (type === 'update') {
        const { symbol, quote } = data;
        if (!currentSymbols.includes(symbol)) return;

        const q = quote as any;
        const close = q.ohlc?.close || q.close || 0;
        const changePercent = close > 0 ? ((q.last_price - close) / close) * 100 : 0;

        const quoteData: QuoteData = {
          lastPrice: q.last_price,
          change: q.last_price - close,
          changePercent: parseFloat(changePercent.toFixed(2)),
          open: q.ohlc?.open || q.open || 0,
          high: q.ohlc?.high || q.high || 0,
          low: q.ohlc?.low || q.low || 0,
          close: close,
          volume: q.volume || 0,
          // Guard against null/undefined/0 from stale Redis cache entries
          bid: (q.bid != null && q.bid > 0) ? q.bid : q.last_price * 0.9995,
          ask: (q.ask != null && q.ask > 0) ? q.ask : q.last_price * 1.0005,
        };

        pendingUpdatesRef.current[symbol] = quoteData;
      }
    };

    wsManager.subscribe(currentSymbols, onMessage);

    // Throttle rendering state updates to 250ms
    const flushInterval = setInterval(() => {
      const pending = pendingUpdatesRef.current;
      if (Object.keys(pending).length > 0) {
        setQuotes(prev => ({
          ...prev,
          ...pending,
        }));
        pendingUpdatesRef.current = {};
      }
    }, 250);

    return () => {
      clearInterval(flushInterval);
      wsManager.unsubscribe(currentSymbols, onMessage);
    };
  }, [symbolsKey]);

  return { quotes };
}
