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

  -- Duration
  v_duration_sec := EXTRACT(EPOCH FROM (now() - v_pos.entry_time))::integer;

  -- 1. Close the position
  UPDATE public.positions
  SET
    status           = 'closed',
    exit_price       = p_exit_price,
    exit_time        = now(),
    ltp              = p_ltp,
    pnl              = v_pnl,
    qty_open         = 0,
    duration_seconds = v_duration_sec,
    updated_at       = now()
  WHERE id = p_position_id;

  -- 2. Record exit order using the position's product_type
  INSERT INTO public.orders (
    user_id, symbol, segment, side, status,
    qty, price, fill_price, ltp_at_entry,
    order_type, product_type, info, is_exit, brokerage
  )
  VALUES (
    p_user_id, v_pos.symbol, v_pos.settlement, 
    CASE WHEN v_pos.side = 'BUY' THEN 'SELL' ELSE 'BUY' END,
    'EXECUTED',
    v_pos.qty_open, p_exit_price, p_exit_price, p_ltp,
    'MARKET', v_pos.product_type,
    'Exit - ' || p_closed_by,
    true, p_brokerage
  );

  -- 3. P&L settlement transaction
  v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;

  INSERT INTO public.transactions (
    user_id, type, amount, status, ref_id
  )
  VALUES (
    p_user_id, v_pnl_type, ABS(v_pnl), 'APPROVED',
    p_position_id::text
  );

  -- 4. Brokerage transaction
  -- Use BROKERAGE_DEBIT (consistent with process_executed_position and admin PATCH sync logic)
  IF p_brokerage > 0 THEN
    INSERT INTO public.transactions (
      user_id, type, amount, status, ref_id
    )
    VALUES (
      p_user_id, 'BROKERAGE_DEBIT', p_brokerage, 'APPROVED',
      p_position_id::text
    );
  END IF;

  -- 5. Audit log
  INSERT INTO public.act_logs (
    type, user_id, target_user_id, symbol, qty, price, reason
  )
  VALUES (
    CASE WHEN p_closed_by = 'AUTO_SQOFF' THEN 'AUTO_SQUARE_OFF' ELSE 'ORDER_EXECUTION' END,
    p_user_id, p_user_id,
    v_pos.symbol, v_pos.qty_open, p_exit_price,
    p_closed_by
  );

  RETURN v_pnl;
END;
$$;
