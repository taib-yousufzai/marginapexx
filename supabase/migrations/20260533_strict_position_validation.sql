-- ─── 1. Add is_exit column to orders table ───
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_exit boolean DEFAULT false;

-- ─── 2. Create parse_option_symbol utility function ───
DROP FUNCTION IF EXISTS public.parse_option_symbol(text);
CREATE OR REPLACE FUNCTION public.parse_option_symbol(
  p_symbol text,
  OUT strike numeric,
  OUT opt_type text
)
AS $$
BEGIN
  IF p_symbol ~ '(\d+(?:\.\d+)?)(CE|PE)$' THEN
    strike := (substring(p_symbol from '(\d+(?:\.\d+)?)(?:CE|PE)$'))::numeric;
    opt_type := substring(p_symbol from '(?:CE|PE)$');
  ELSE
    strike := NULL;
    opt_type := NULL;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ─── 3. Create process_executed_position helper ───
-- Handles position creation, accumulation, and partial/full exit split logic atomically.
CREATE OR REPLACE FUNCTION public.process_executed_position(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
  v_pos record;
  v_closed_pos_id uuid;
  v_pnl numeric;
  v_pnl_type text;
  v_new_avg_price numeric;
BEGIN
  -- Fetch the order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_order.status != 'EXECUTED' THEN
    -- Only process executed orders
    RETURN;
  END IF;

  -- Lock and fetch active position for this user and symbol
  SELECT * INTO v_pos
  FROM public.positions
  WHERE user_id = v_order.user_id AND symbol = v_order.symbol AND status = 'open'
  FOR UPDATE;

  IF v_order.is_exit THEN
    -- ─── EXIT ORDER LOGIC ───
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No active position exists to exit';
    END IF;

    IF v_pos.side = v_order.side THEN
      RAISE EXCEPTION 'Invalid exit side: exit order side must be opposite of position side';
    END IF;

    IF v_order.qty > v_pos.qty_open THEN
      RAISE EXCEPTION 'Exit quantity cannot exceed current position quantity';
    END IF;

    -- Calculate realized P&L (BUY = exit - entry, SELL = entry - exit)
    IF v_pos.side = 'BUY' THEN
      v_pnl := (v_order.fill_price - v_pos.entry_price) * v_order.qty;
    ELSE
      v_pnl := (v_pos.entry_price - v_order.fill_price) * v_order.qty;
    END IF;

    IF v_order.qty = v_pos.qty_open THEN
      -- FULL EXIT: Close active position row
      UPDATE public.positions
      SET
        status = 'closed',
        qty_open = 0,
        exit_price = v_order.fill_price,
        exit_time = now(),
        pnl = v_pnl,
        duration_seconds = EXTRACT(EPOCH FROM (now() - entry_time))::integer,
        updated_at = now()
      WHERE id = v_pos.id;

      -- Record PNL transaction
      v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
      INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
      VALUES (v_order.user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', v_pos.id::text);

    ELSE
      -- PARTIAL EXIT: Split position
      -- 1. Reduce quantity of the active open position
      UPDATE public.positions
      SET
        qty_open = qty_open - v_order.qty,
        qty_total = qty_total - v_order.qty,
        updated_at = now()
      WHERE id = v_pos.id;

      -- 2. Create a new CLOSED position representing the exited portion
      INSERT INTO public.positions (
        user_id, symbol, side, status,
        qty_total, qty_open,
        avg_price, entry_price, ltp,
        settlement, product_type, exit_price, exit_time, pnl, duration_seconds, created_at, updated_at
      )
      VALUES (
        v_order.user_id, v_order.symbol, v_pos.side, 'closed',
        v_order.qty, 0,
        v_pos.avg_price, v_pos.entry_price, v_order.ltp_at_entry,
        v_order.segment, v_order.product_type, v_order.fill_price, now(), v_pnl,
        EXTRACT(EPOCH FROM (now() - v_pos.entry_time))::integer, now(), now()
      )
      RETURNING id INTO v_closed_pos_id;

      -- 3. Record PNL transaction for the closed portion
      v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
      INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
      VALUES (v_order.user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', v_closed_pos_id::text);

    END IF;

  ELSE
    -- ─── ENTRY ORDER LOGIC ───
    IF FOUND THEN
      -- If same side, accumulate quantity & compute weighted average price
      IF v_pos.side = v_order.side THEN
        v_new_avg_price := ((v_pos.avg_price * v_pos.qty_open) + (v_order.fill_price * v_order.qty)) / (v_pos.qty_open + v_order.qty);

        UPDATE public.positions
        SET
          qty_open = qty_open + v_order.qty,
          qty_total = qty_total + v_order.qty,
          avg_price = v_new_avg_price,
          entry_price = v_new_avg_price,
          updated_at = now()
        WHERE id = v_pos.id;
      ELSE
        -- Defensive fallback — pre-execution validation should prevent this
        RAISE EXCEPTION 'Cannot open opposite position while existing position is active';
      END IF;
    ELSE
      -- Insert a brand new open position
      INSERT INTO public.positions (
        user_id, symbol, side, status,
        qty_total, qty_open,
        avg_price, entry_price, ltp,
        settlement, product_type, stop_loss, target, created_at, updated_at
      )
      VALUES (
        v_order.user_id, v_order.symbol, v_order.side, 'open',
        v_order.qty, v_order.qty,
        v_order.fill_price, v_order.fill_price, v_order.ltp_at_entry,
        v_order.segment, v_order.product_type, v_order.stop_loss, v_order.target, now(), now()
      );
    END IF;
  END IF;
END;
$$;


-- ─── 4. Redefine place_order with strict options validations ───
-- Drop the old 15-parameter function first
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
  p_target         numeric DEFAULT NULL,
  p_is_exit        boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order_id uuid;
  v_status   text;
  v_ord_strike numeric;
  v_ord_opt_type text;
  v_pos record;
  v_pos_strike numeric;
  v_pos_opt_type text;
BEGIN
  -- ─── STRICT OPTIONS DIRECTION AND QUANTITY VALIDATION ───
  SELECT * INTO v_ord_strike, v_ord_opt_type FROM public.parse_option_symbol(p_symbol);

  IF v_ord_strike IS NOT NULL AND v_ord_opt_type IS NOT NULL THEN
    -- Symbol is an options contract. Find active positions for the same contract
    FOR v_pos IN 
      SELECT * FROM public.positions 
      WHERE user_id = p_user_id AND status = 'open' AND qty_open > 0
    LOOP
      SELECT * INTO v_pos_strike, v_pos_opt_type FROM public.parse_option_symbol(v_pos.symbol);
      
      IF v_pos_strike = v_ord_strike AND v_pos_opt_type = v_ord_opt_type THEN
        -- Matching strike & option type found!
        
        IF p_is_exit THEN
          -- Exit validation
          IF v_pos.side = p_side THEN
            RAISE EXCEPTION 'No % position exists to exit', CASE WHEN v_pos.side = 'BUY' THEN 'SELL' ELSE 'BUY' END;
          END IF;
          
          IF p_qty > v_pos.qty_open THEN
            RAISE EXCEPTION 'Exit quantity cannot exceed current position quantity';
          END IF;
        
        ELSE
          -- Entry validation (Strict opposite block)
          IF v_pos.side != p_side THEN
            IF v_pos.side = 'BUY' THEN
              RAISE EXCEPTION 'Cannot open SELL position while BUY position is active';
            ELSE
              RAISE EXCEPTION 'Cannot open BUY position while SELL position is active';
            END IF;
          END IF;
        
        END IF;
        
      END IF;
    END LOOP;
    
    -- If it's explicitly marked as exit, but no active position was found:
    IF p_is_exit AND NOT FOUND THEN
      RAISE EXCEPTION 'No % position exists to exit', CASE WHEN p_side = 'BUY' THEN 'SELL' ELSE 'BUY' END;
    END IF;
  END IF;

  -- ─── EXECUTE ORDER CREATION ───
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
    trigger_price, stop_loss, target, is_exit
  )
  VALUES (
    p_user_id, p_symbol, p_kite_inst, p_segment,
    p_side, v_status, p_qty, p_lots,
    p_fill_price, p_fill_price, p_ltp,
    p_order_type, p_product_type, p_info,
    p_trigger_price, p_stop_loss, p_target, p_is_exit
  )
  RETURNING id INTO v_order_id;

  -- 2. Run positioning logic ONLY if EXECUTED immediately
  IF v_status = 'EXECUTED' THEN
    PERFORM public.process_executed_position(v_order_id);
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


-- ─── 5. Re-grant permissions for place_order function ───
REVOKE ALL ON FUNCTION public.place_order(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric, boolean) TO service_role;
