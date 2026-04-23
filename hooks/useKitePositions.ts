/**
 * useKitePositions
 *
 * Fetches the user's positions from Kite Connect via /api/kite/positions.
 * Polls every `refreshInterval` ms (default 5000ms = 5 seconds).
 *
 * Returns net positions (actual portfolio) and day positions (today's activity).
 *
 * Usage:
 *   const { netPositions, dayPositions, connected, loading } = useKitePositions();
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface KitePosition {
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  product: string;
  quantity: number;
  overnight_quantity: number;
  multiplier: number;
  average_price: number;
  close_price: number;
  last_price: number;
  value: number;
  pnl: number;
  m2m: number;
  unrealised: number;
  realised: number;
  buy_quantity: number;
  buy_price: number;
  buy_value: number;
  sell_quantity: number;
  sell_price: number;
  sell_value: number;
  day_buy_quantity: number;
  day_buy_price: number;
  day_buy_value: number;
  day_sell_quantity: number;
  day_sell_price: number;
  day_sell_value: number;
}

interface UseKitePositionsResult {
  netPositions: KitePosition[];
  dayPositions: KitePosition[];
  connected: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useKitePositions(refreshInterval = 5000): UseKitePositionsResult {
  const [netPositions, setNetPositions] = useState<KitePosition[]>([]);
  const [dayPositions, setDayPositions] = useState<KitePosition[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPositions = useCallback(async () => {
    try {
      const response = await fetch('/api/kite/positions', { cache: 'no-store' });

      if (response.status === 401 || response.status === 403) {
        setConnected(false);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const body = await response.json() as { error?: string };
        setError(body.error ?? 'Failed to fetch positions');
        setLoading(false);
        return;
      }

      const data = await response.json() as { net: KitePosition[]; day: KitePosition[] };

      setNetPositions(data.net ?? []);
      setDayPositions(data.day ?? []);
      setConnected(true);
      setError(null);
    } catch (err) {
      setError('Network error fetching positions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      // Step 1: restore session from DB if cookie is missing
      try {
        await fetch('/api/kite/restore', { method: 'POST' });
      } catch {
        // best-effort
      }

      if (cancelled) return;

      // Step 2: check whether a valid session exists
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

      // Step 3: session confirmed — fetch positions immediately then start polling
      await fetchPositions();

      if (cancelled) return;

      intervalRef.current = setInterval(fetchPositions, refreshInterval);
    }

    init();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchPositions, refreshInterval]);

  return { netPositions, dayPositions, connected, loading, error, refresh: fetchPositions };
}
