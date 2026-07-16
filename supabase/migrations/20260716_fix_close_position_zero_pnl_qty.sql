-- Fix close_position to set qty_open = 0 and handle exactly zero PNL gracefully.
-- Also ensures closed_by is properly updated.

CREATE OR REPLACE FUNCTION public.close_position(
  p_position_id   uuid,
  p_user_id       uuid,
  p_ltp           numeric,
  p_exit_price    numeric,
  p_closed_by     text DEFAULT 'USER',
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

  -- Update position row — no exit brokerage added
  UPDATE public.positions
  SET
    status = 'closed',
    qty_open = 0,
    exit_price = p_exit_price,
    exit_time = now(),
    pnl = v_pnl,
    duration_seconds = v_duration_sec,
    closed_by = p_closed_by,
    updated_at = now()
  WHERE id = p_position_id;

  -- Record PNL transaction only if non-zero to avoid check constraint violations
  IF v_pnl <> 0 THEN
    v_pnl_type := CASE WHEN v_pnl > 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
    
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (p_user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', p_position_id::text);
  END IF;

  -- Only charge carry brokerage if explicitly passed (for CARRY positions at exit)
  IF p_brokerage > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (p_user_id, 'BROKERAGE_DEBIT', p_brokerage, 'APPROVED', 'BKG_EXIT_' || p_position_id::text);
  END IF;

  RETURN v_pnl;
END;
$$;
