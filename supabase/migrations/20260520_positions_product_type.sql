-- Add product_type column to positions table
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS product_type text
    CHECK (product_type IN ('INTRADAY', 'CARRY'))
    DEFAULT 'INTRADAY';

-- Drop and recreate place_order to save product_type into positions
DROP FUNCTION IF EXISTS public.place_order(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric);

CREATE OR REPLACE FUNCTION public.place_order(
  p_user_id        uuid,
  p_symbol         text,
  p_kite_inst      text,
  p_segment        text,
  p_side           text,
  p_order_type     text,
  p_product_type   text,
  p_qty            numeric,
  p_lots           numeric,
  p_ltp            numeric,
  p_fill_price     numeric,
  p_info           text DEFAULT NULL,
  p_trigger_price  numeric DEFAULT NULL,
  p_stop_loss      numeric DEFAULT NULL,
  p_target         numeric DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_status   text;
BEGIN
  -- Determine status: MARKET/SLM execute immediately, LIMIT/SL/GTT are PENDING
  IF p_order_type IN ('MARKET', 'SLM') THEN
    v_status := 'EXECUTED';
  ELSE
    v_status := 'PENDING';
  END IF;

  -- 1. Insert order record
  INSERT INTO public.orders (
    user_id, symbol, kite_instrument, segment,
    side, status, qty, lots,
    price, fill_price, ltp_at_entry,
    order_type, product_type, info,
    trigger_price, stop_loss, target
  )
  VALUES (
    p_user_id, p_symbol, p_kite_inst, p_segment,
    p_side, v_status, p_qty, p_lots,
    p_fill_price, p_fill_price, p_ltp,
    p_order_type, p_product_type, p_info,
    p_trigger_price, p_stop_loss, p_target
  )
  RETURNING id INTO v_order_id;

  -- 2. Open a position ONLY if EXECUTED
  IF v_status = 'EXECUTED' THEN
    INSERT INTO public.positions (
      user_id, symbol, side, status,
      qty_total, qty_open,
      avg_price, entry_price, ltp,
      settlement, product_type, stop_loss, target
    )
    VALUES (
      p_user_id, p_symbol, p_side, 'open',
      p_qty, p_qty,
      p_fill_price, p_fill_price, p_ltp,
      p_segment, p_product_type, p_stop_loss, p_target
    );
  END IF;

  -- 3. Audit log
  INSERT INTO public.act_logs (
    type, user_id, target_user_id, symbol, qty, price, reason
  )
  VALUES (
    CASE WHEN v_status = 'EXECUTED' THEN 'ORDER_EXECUTION' ELSE 'ORDER_PLACED' END,
    p_user_id, p_user_id,
    p_symbol, p_qty, p_fill_price,
    p_order_type || ' ' || v_status || ' @ ' || COALESCE(p_trigger_price::text, 'no-trigger')
  );

  RETURN v_order_id;
END;
$$;

-- Redefine grants
REVOKE ALL ON FUNCTION public.place_order(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric) TO service_role;
