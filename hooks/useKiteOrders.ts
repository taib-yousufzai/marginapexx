/**
 * useKiteOrders
 *
 * Fetches today's orders from Kite Connect via /api/kite/orders.
 * Polls every `refreshInterval` ms (default 5000ms).
 *
 * Follows the same session-restore-first pattern as useKiteQuotes:
 *   restore cookie → check status → fetch → poll
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface KiteOrder {
  order_id: string;
  parent_order_id: string | null;
  exchange_order_id: string | null;
  placed_by: string;
  variety: string;
  status: string;
  status_message: string | null;
  status_message_raw: string | null;
  order_timestamp: string;
  exchange_update_timestamp: string | null;
  exchange_timestamp: string | null;
  modified: boolean;
  exchange: string;
  tradingsymbol: string;
  instrument_token: number;
  order_type: string;
  transaction_type: string;
  validity: string;
  product: string;
  quantity: number;
  disclosed_quantity: number;
  price: number;
  trigger_price: number;
  average_price: number;
  filled_quantity: number;
  pending_quantity: number;
  cancelled_quantity: number;
  market_protection: number;
  tag: string | null;
}

interface UseKiteOrdersResult {
  orders: KiteOrder[];
  connected: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useKiteOrders(refreshInterval = 5000): UseKiteOrdersResult {
  const [orders, setOrders] = useState<KiteOrder[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      const response = await fetch('/api/kite/orders', { cache: 'no-store' });

      if (response.status === 401 || response.status === 403) {
        setConnected(false);
        setLoading(false);
        return;
      }

      if (!response.ok) {
        const body = await response.json() as { error?: string };
        setError(body.error ?? 'Failed to fetch orders');
        setLoading(false);
        return;
      }

      const data = await response.json() as { orders: KiteOrder[] };
      setOrders(data.orders ?? []);
      setConnected(true);
      setError(null);
    } catch {
      setError('Network error fetching orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        await fetch('/api/kite/restore', { method: 'POST' });
      } catch { /* best-effort */ }

      if (cancelled) return;

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

      await fetchOrders();

      if (cancelled) return;

      intervalRef.current = setInterval(fetchOrders, refreshInterval);
    }

    init();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchOrders, refreshInterval]);

  return { orders, connected, loading, error, refresh: fetchOrders };
}
