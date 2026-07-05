-- 1. Drop redundant triggers on orders that cause duplicate positions
DROP TRIGGER IF EXISTS trg_order_executed_insert ON public.orders;
DROP TRIGGER IF EXISTS trg_order_executed_update ON public.orders;

-- 2. Cleanup function to safely remove duplicate exit positions created by the trigger bug
DO $$
DECLARE
  v_dup_pos record;
BEGIN
  -- Find SELL open positions created from an exit order
  FOR v_dup_pos IN
    SELECT p.id as pos_id, o.id as order_id, o.user_id, o.symbol
    FROM public.positions p
    JOIN public.orders o ON o.symbol = p.symbol AND o.user_id = p.user_id AND o.is_exit = true
    WHERE p.status = 'open' 
      AND p.side = 'SELL' 
      AND p.created_at = o.created_at
  LOOP
    -- Delete the duplicate SELL position
    DELETE FROM public.positions WHERE id = v_dup_pos.pos_id;
    
    -- Close the original BUY position that should have been closed
    UPDATE public.positions
    SET status = 'closed', qty_open = 0, updated_at = now()
    WHERE user_id = v_dup_pos.user_id 
      AND symbol = v_dup_pos.symbol 
      AND side = 'BUY' 
      AND status = 'open';
  END LOOP;
END $$;
