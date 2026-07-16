import { useEffect, useMemo, useState } from 'react';
import { useGlobalBinanceQuotes, BinanceQuoteData } from '@/contexts/BinanceDataContext';

interface UseBinanceQuotesResult {
  quotes: Record<string, BinanceQuoteData>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useBinanceQuotes(
  symbols: string[],
  refreshInterval = 5000,
): UseBinanceQuotesResult {
  const { quotes, subscribe, unsubscribe } = useGlobalBinanceQuotes();
  const symbolsKey = symbols.join(',');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentSymbols = symbolsKey.split(',').filter(Boolean);
    if (currentSymbols.length === 0) {
      setLoading(false);
      return;
    }

    subscribe(currentSymbols);
    setLoading(false); // No longer loading since context manages it
    
    return () => {
      unsubscribe(currentSymbols);
    };
  }, [symbolsKey, subscribe, unsubscribe]);

  const localQuotes = useMemo(() => {
    const res: Record<string, BinanceQuoteData> = {};
    symbols.forEach(s => {
      if (quotes[s]) res[s] = quotes[s];
    });
    return res;
  }, [quotes, symbolsKey]);

  return { quotes: localQuotes, loading, error: null, refresh: () => {} };
}
