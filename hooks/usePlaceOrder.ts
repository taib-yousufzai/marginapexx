/**
 * usePlaceOrder
 *
 * Calls POST /api/orders with the user's Supabase Bearer token.
 * Returns a `place` function, loading state, and last error.
 */

'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { PlaceOrderRequest, PlaceOrderResponse } from '@/lib/types/order';

interface UsePlaceOrderResult {
  place: (req: PlaceOrderRequest) => Promise<PlaceOrderResponse>;
  loading: boolean;
  error: string | null;
}

export function usePlaceOrder(): UsePlaceOrderResult {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const place = useCallback(async (req: PlaceOrderRequest): Promise<PlaceOrderResponse> => {
    setLoading(true);
    setError(null);

    // Attach Supabase Bearer token
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? '';

    try {
      const res = await fetch('/api/orders', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(req),
      });

      const data = await res.json() as PlaceOrderResponse & { error?: string };

      if (!res.ok) {
        const msg = data.error ?? 'Order failed. Please try again.';
        setError(msg);
        throw new Error(msg);
      }

      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  return { place, loading, error };
}
