/**
 * useOrderEntry
 * 
 * Manages the state and logic for placing an order through the MarginApex platform.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL-M' | 'GTT';
export type ProductType = 'INTRADAY' | 'CARRY';

export interface OrderEntryState {
  symbol: string;
  kite_instrument: string;
  segment: string;
  side: OrderSide;
  qty: number;
  lots: number;
  order_type: OrderType;
  product_type: ProductType;
  client_price: number;
}

export function useOrderEntry() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeOrder = useCallback(async (state: OrderEntryState) => {
    setLoading(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (!token) {
        throw new Error('You must be logged in to place an order.');
      }

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(state)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to place order');
      }

      return { success: true, order: result };
    } catch (err: any) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    placeOrder,
    loading,
    error,
    setError
  };
}
