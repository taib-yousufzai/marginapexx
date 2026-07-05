-- 1. Add closed_by column to positions table to track user vs manual/system closures
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS closed_by TEXT DEFAULT 'USER_ACTION';

-- 2. Update close_position RPC to persist p_closed_by parameter
CREATE OR REPLACE FUNCTION public.close_position(
  p_position_id   uuid,
  p_user_id       uuid,
  p_ltp           numeric,
  p_exit_price    numeric,
  p_closed_by     text DEFAULT 'USER_ACTION',
  p_brokerage     numeric DEFAULT 0
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pos          record;
  v_pnl          numeric;
  v_pnl_type     text;
  v_duration_sec integer;
  v_closed_margin numeric;
BEGIN
  -- Fetch & lock the position
  SELECT * INTO v_pos
  FROM public.positions
  WHERE id = p_position_id AND user_id = p_user_id AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Position not found or already closed';
  END IF;

  -- Compute P&L
  IF v_pos.side = 'BUY' THEN
    v_pnl := (p_exit_price - v_pos.entry_price) * v_pos.qty_open;
  ELSE
    v_pnl := (v_pos.entry_price - p_exit_price) * v_pos.qty_open;
  END IF;
  v_duration_sec := EXTRACT(EPOCH FROM (now() - v_pos.entry_time))::integer;

  -- Compute proportional margin to return
  -- (If full exit, return full locked margin. If partial, return proportional).
  v_closed_margin := (v_pos.locked_margin * v_pos.qty_open) / v_pos.qty_total;

  -- Update position row
  UPDATE public.positions
  SET
    status = 'closed',
    exit_price = p_exit_price,
    exit_time = now(),
    pnl = v_pnl,
    duration_seconds = v_duration_sec,
    updated_at = now(),
    -- The caller passes p_brokerage for exit, but we don't charge it for now if they paid 2x entry. 
    -- We just append it to track if needed.
    exit_brokerage = exit_brokerage + p_brokerage,
    brokerage = brokerage + p_brokerage,
    locked_margin = 0, -- unlock margin
    closed_by = p_closed_by -- Store who closed the position
  WHERE id = p_position_id;

  -- Record PNL transaction
  v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
  
  INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
  VALUES (p_user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', p_position_id::text);

  -- Record Exit Brokerage transaction (if any, typically 0 since charged upfront)
  IF p_brokerage > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (p_user_id, 'BROKERAGE_DEBIT', p_brokerage, 'APPROVED', 'BKG_EXIT_' || p_position_id::text);
  END IF;

  RETURN v_pnl;
END;
$$;
