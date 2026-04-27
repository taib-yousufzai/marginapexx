-- ─── place_order() ────────────────────────────────────────────────────────────
-- Atomically inserts an order row, opens/updates a position, and writes
-- an audit log entry. Called server-side after all validation is done.
--
-- Returns: the new order UUID

CREATE OR REPLACE FUNCTION public.place_order(
  p_user_id        uuid,
  p_symbol         text,
  p_kite_inst      text,    -- Kite quote key e.g. "NSE:RELIANCE"
  p_segment        text,
  p_side           text,    -- 'BUY' | 'SELL'
  p_order_type     text,    -- 'MARKET' | 'LIMIT' | 'SLM' | 'GTT'
  p_product_type   text,    -- 'INTRADAY' | 'CARRY'
  p_qty            numeric,
  p_lots           numeric,
  p_ltp            numeric,   -- raw Kite LTP (server-fetched)
  p_fill_price     numeric,   -- ltp ± buffer (server-computed)
  p_info           text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  -- 1. Insert order record
  INSERT INTO public.orders (
    user_id, symbol, kite_instrument, segment,
    side, status, qty, lots,
    price, fill_price, ltp_at_entry,
    order_type, product_type, info
  )
  VALUES (
    p_user_id, p_symbol, p_kite_inst, p_segment,
    p_side, 'EXECUTED', p_qty, p_lots,
    p_fill_price, p_fill_price, p_ltp,
    p_order_type, p_product_type, p_info
  )
  RETURNING id INTO v_order_id;

  -- 2. Open a new position for this order
  INSERT INTO public.positions (
    user_id, symbol, side, status,
    qty_total, qty_open,
    avg_price, entry_price, ltp
  )
  VALUES (
    p_user_id, p_symbol, p_side, 'open',
    p_qty, p_qty,
    p_fill_price, p_fill_price, p_ltp
  );

  -- 3. Audit log
  INSERT INTO public.act_logs (
    type, user_id, target_user_id, symbol, qty, price
  )
  VALUES (
    'ORDER_EXECUTION', p_user_id, p_user_id,
    p_symbol, p_qty, p_fill_price
  );

  RETURN v_order_id;
END;
$$;


-- ─── close_position() ─────────────────────────────────────────────────────────
-- Closes an open position, computes realised P&L, writes a PNL transaction,
-- records the exit order, and logs to act_logs.
--
-- Returns: realised P&L (positive = profit, negative = loss)

CREATE OR REPLACE FUNCTION public.close_position(
  p_position_id   uuid,
  p_user_id       uuid,       -- must match position owner (server enforces)
  p_ltp           numeric,    -- raw Kite LTP at close
  p_exit_price    numeric,    -- ltp ± exit_buffer (server-computed)
  p_closed_by     text DEFAULT 'USER'   -- 'USER' | 'BROKER' | 'AUTO_SQOFF'
)
RETURNS numeric               -- realised P&L
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

  -- 2. Record exit order
  INSERT INTO public.orders (
    user_id, symbol, segment, side, status,
    qty, price, fill_price, ltp_at_entry,
    order_type, product_type, info
  )
  VALUES (
    p_user_id, v_pos.symbol, v_pos.settlement, 
    CASE WHEN v_pos.side = 'BUY' THEN 'SELL' ELSE 'BUY' END,
    'EXECUTED',
    v_pos.qty_open, p_exit_price, p_exit_price, p_ltp,
    'MARKET', 'INTRADAY',
    'Exit - ' || p_closed_by
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

  -- 4. Audit log
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


-- Grant execute to service role only
REVOKE ALL ON FUNCTION public.place_order FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_position FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order  TO service_role;
GRANT EXECUTE ON FUNCTION public.close_position TO service_role;
