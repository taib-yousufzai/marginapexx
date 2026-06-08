import { useMarketQuotes, QuoteData } from './useMarketQuotes';

export type { QuoteData };

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
  const { quotes } = useMarketQuotes(instruments);
  const hasQuotes = Object.keys(quotes).length > 0;

  return {
    quotes,
    connected: true,
    loading: instruments.length > 0 ? !hasQuotes : false,
    error: null,
    refresh: () => {}, // Live WebSocket updates eliminate manual refresh needs
  };
}

