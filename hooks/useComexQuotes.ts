import { useEffect, useMemo, useState } from 'react';
import { useGlobalComexQuotes, ComexQuoteData } from '@/contexts/ComexDataContext';

interface UseComexQuotesResult {
  quotes: Record<string, ComexQuoteData>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useComexQuotes(
  symbols: string[],
  refreshInterval = 30_000,
): UseComexQuotesResult {
  const { quotes, subscribe, unsubscribe } = useGlobalComexQuotes();
  const symbolsKey = symbols.join(',');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentSymbols = symbolsKey.split(',').filter(Boolean);
    if (currentSymbols.length === 0) {
      setLoading(false);
      return;
    }

    subscribe(currentSymbols);
    setLoading(false);
    
    return () => {
      unsubscribe(currentSymbols);
    };
  }, [symbolsKey, subscribe, unsubscribe]);

  const localQuotes = useMemo(() => {
    const res: Record<string, ComexQuoteData> = {};
    symbols.forEach(s => {
      if (quotes[s]) res[s] = quotes[s];
    });
    return res;
  }, [quotes, symbolsKey]);

  return { quotes: localQuotes, loading, error: null, refresh: () => {} };
}
