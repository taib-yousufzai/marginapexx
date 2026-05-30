import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

export interface ActivePosition {
  id: string;
  symbol: string;
  kite_instrument: string;
  side: 'BUY' | 'SELL';
  status: 'open' | 'closed';
  qty_open: number;
  qty_total: number;
  avg_price: number;
  product_type: string;
  // include other fields if needed, but these are primary
}

export function useActivePositions() {
  const [positions, setPositions] = useState<ActivePosition[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPositions = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }

      const res = await fetch('/api/positions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.positions) {
        setPositions(json.positions.filter((p: any) => p.status === 'open' || p.status === 'OPEN'));
      }
    } catch (err) {
      console.error('Failed to fetch positions:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  return { positions, loading, refreshPositions: fetchPositions };
}
