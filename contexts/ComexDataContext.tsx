'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';

export interface ComexQuoteData {
  symbol: string;
  contractSymbol: string;
  name: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  currency: string;
  bid?: number;
  ask?: number;
}

type ComexDataContextType = {
  quotes: Record<string, ComexQuoteData>;
  subscribe: (symbols: string[]) => void;
  unsubscribe: (symbols: string[]) => void;
};

const ComexDataContext = createContext<ComexDataContextType>({
  quotes: {},
  subscribe: () => {},
  unsubscribe: () => {},
});

export const ComexDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [quotes, setQuotes] = useState<Record<string, ComexQuoteData>>({});
  const activeSymbolsRef = useRef<Set<string>>(new Set());
  const errorRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchQuotes = async () => {
      const symbols = Array.from(activeSymbolsRef.current);
      if (symbols.length === 0) return;

      try {
        const res = await fetch(
          `/api/market/comex?symbols=${symbols.map(s => encodeURIComponent(s)).join(',')}`,
          { cache: 'no-store' }
        );

        if (!res.ok) {
          errorRef.current = `COMEX API error: ${res.status}`;
          return;
        }

        const data = await res.json() as {
          quotes: Record<string, ComexQuoteData>;
          error?: string;
        };

        if (data.error) {
          errorRef.current = data.error;
          return;
        }

        setQuotes(prev => ({ ...prev, ...(data.quotes ?? {}) }));
        errorRef.current = null;
      } catch {
        errorRef.current = 'Network error';
      }
    };

    // Initial delay so we don't spam instantly on mount if symbols are being added
    const initialTimeout = setTimeout(fetchQuotes, 100);
    const interval = setInterval(fetchQuotes, 30_000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, []); // Note: the interval just polls `activeSymbolsRef.current`

  const subscribe = useCallback((symbols: string[]) => {
    const validSymbols = symbols.filter(Boolean);
    validSymbols.forEach(s => activeSymbolsRef.current.add(s));
  }, []);

  const unsubscribe = useCallback((symbols: string[]) => {
    // Comex is HTTP polling so we don't strictly need to unsubscribe immediately,
    // but we can leave the ref counting out of Comex for simplicity. It just keeps polling.
  }, []);

  return (
    <ComexDataContext.Provider value={{ quotes, subscribe, unsubscribe }}>
      {children}
    </ComexDataContext.Provider>
  );
};

export const useGlobalComexQuotes = () => useContext(ComexDataContext);
