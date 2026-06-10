-- ------------------------------------------
-- FILE: 20260614_add_buffer_fee.sql
-- ------------------------------------------

-- 1. Add buffer_fee column to public.orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buffer_fee numeric NOT NULL DEFAULT 0;

-- 2. Update public.transactions type check constraint to include BUFFER_FEE_DEBIT
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check 
  CHECK (type IN ('DEPOSIT','WITHDRAWAL','PNL_CREDIT','PNL_DEBIT','BROKERAGE_DEBIT','BUFFER_FEE_DEBIT'));

-- 3. Redefine place_order to accept and insert p_buffer_fee
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
  p_is_exit        boolean DEFAULT false,
  p_buffer_fee     numeric DEFAULT 0
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
    -- Symbol is an options contract. Find active positions for the same contract and product_type
    FOR v_pos IN 
      SELECT * FROM public.positions 
      WHERE user_id = p_user_id AND status = 'open' AND qty_open > 0 AND product_type = p_product_type
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
    trigger_price, stop_loss, target, is_exit, buffer_fee
  )
  VALUES (
    p_user_id, p_symbol, p_kite_inst, p_segment,
    p_side, v_status, p_qty, p_lots,
    p_fill_price, p_fill_price, p_ltp,
    p_order_type, p_product_type, p_info,
    p_trigger_price, p_stop_loss, p_target, p_is_exit, p_buffer_fee
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

-- 4. Redefine process_executed_position to debit buffer_fee
CREATE OR REPLACE FUNCTION public.process_executed_position(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order    record;
  v_pos      record;
  v_rem_qty  numeric;
  v_new_qty  numeric;
  v_pnl      numeric;
  v_pnl_type text;
  v_raw_brokerage numeric;
  v_brokerage numeric;
  v_comm_val numeric;
  v_duration_sec integer;
BEGIN
  -- Fetch the order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status <> 'EXECUTED' THEN
    RAISE EXCEPTION 'Order must be EXECUTED to process positioning';
  END IF;

  -- Compute and debit brokerage
  SELECT COALESCE(commission_value, 0) INTO v_comm_val
  FROM segment_settings
  WHERE segment_name = v_order.segment;

  -- Formula: (qty * price * commission_value) / 10000000 (1 crore)
  v_raw_brokerage := (v_order.qty * v_order.fill_price * v_comm_val) / 10000000;
  -- Round up to next integer, unless 0
  IF v_raw_brokerage > 0 THEN
    v_brokerage := CEIL(v_raw_brokerage);
  ELSE
    v_brokerage := 0;
  END IF;

  -- Save calculated brokerage back to order
  UPDATE public.orders
  SET brokerage = v_brokerage
  WHERE id = v_order.id;

  -- Debit user's balance immediately via transaction
  IF v_brokerage > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (v_order.user_id, 'BROKERAGE_DEBIT', v_brokerage, 'APPROVED', 'BRK_' || v_order.id::text);
  END IF;

  -- Debit buffer fee
  IF v_order.buffer_fee > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (v_order.user_id, 'BUFFER_FEE_DEBIT', v_order.buffer_fee, 'APPROVED', 'BUF_' || v_order.id::text);
  END IF;

  -- Determine if there is an open position for this symbol and product_type
  SELECT * INTO v_pos
  FROM public.positions
  WHERE user_id = v_order.user_id
    AND symbol = v_order.symbol
    AND product_type = v_order.product_type
    AND status = 'open'
    AND qty_open > 0
  FOR UPDATE; -- lock the row

  IF FOUND THEN
    -- A position exists
    IF v_pos.side = v_order.side THEN
      -- ADDING TO POSITION
      v_new_qty := v_pos.qty_open + v_order.qty;
      UPDATE public.positions
      SET 
        qty_open = v_new_qty,
        qty_total = qty_total + v_order.qty,
        -- Wait! We should average the fill prices!
        avg_price = ((v_pos.avg_price * v_pos.qty_open) + (v_order.fill_price * v_order.qty)) / v_new_qty,
        entry_price = ((v_pos.entry_price * v_pos.qty_open) + (v_order.fill_price * v_order.qty)) / v_new_qty,
        updated_at = now()
      WHERE id = v_pos.id;

    ELSE
      -- REDUCING OR REVERSING POSITION (Exit)
      IF v_order.qty <= v_pos.qty_open THEN
        -- Partial or full exit
        v_rem_qty := v_pos.qty_open - v_order.qty;

        -- PNL for the exited portion
        IF v_pos.side = 'BUY' THEN
          v_pnl := (v_order.fill_price - v_pos.entry_price) * v_order.qty;
        ELSE
          v_pnl := (v_pos.entry_price - v_order.fill_price) * v_order.qty;
        END IF;

        IF v_rem_qty = 0 THEN
          -- Full close
          v_duration_sec := EXTRACT(EPOCH FROM (now() - v_pos.entry_time))::integer;
          UPDATE public.positions
          SET 
            qty_open = 0,
            status = 'closed',
            exit_price = v_order.fill_price,
            exit_time = now(),
            pnl = v_pos.pnl + v_pnl, -- add cumulative
            duration_seconds = v_duration_sec,
            updated_at = now()
          WHERE id = v_pos.id;
        ELSE
          -- Partial close
          UPDATE public.positions
          SET 
            qty_open = v_rem_qty,
            pnl = v_pos.pnl + v_pnl,
            updated_at = now()
          WHERE id = v_pos.id;
        END IF;

        -- Record PNL transaction
        v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
        INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
        VALUES (v_order.user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', v_pos.id::text);

      ELSE
        -- Exiting MORE than current position (Reverse)
        -- 1. Close current position fully
        IF v_pos.side = 'BUY' THEN
          v_pnl := (v_order.fill_price - v_pos.entry_price) * v_pos.qty_open;
        ELSE
          v_pnl := (v_pos.entry_price - v_order.fill_price) * v_pos.qty_open;
        END IF;
        
        v_duration_sec := EXTRACT(EPOCH FROM (now() - v_pos.entry_time))::integer;

        UPDATE public.positions
        SET 
          qty_open = 0,
          status = 'closed',
          exit_price = v_order.fill_price,
          exit_time = now(),
          pnl = v_pos.pnl + v_pnl,
          duration_seconds = v_duration_sec,
          updated_at = now()
        WHERE id = v_pos.id;

        -- Record PNL transaction
        v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
        INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
        VALUES (v_order.user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', v_pos.id::text);

        -- 2. Create new position for the remainder
        v_rem_qty := v_order.qty - v_pos.qty_open;
        
        INSERT INTO public.positions (
          user_id, symbol, segment, settlement,
          side, qty_open, qty_total, avg_price, entry_price, 
          ltp, status, product_type
        )
        VALUES (
          v_order.user_id, v_order.symbol, v_order.segment, v_order.segment,
          v_order.side, v_rem_qty, v_rem_qty, v_order.fill_price, v_order.fill_price,
          v_order.ltp_at_entry, 'open', v_order.product_type
        );

      END IF;
    END IF;

  ELSE
    -- No position exists, create a new one
    INSERT INTO public.positions (
      user_id, symbol, segment, settlement,
      side, qty_open, qty_total, avg_price, entry_price, 
      ltp, status, product_type
    )
    VALUES (
      v_order.user_id, v_order.symbol, v_order.segment, v_order.segment,
      v_order.side, v_order.qty, v_order.qty, v_order.fill_price, v_order.fill_price,
      v_order.ltp_at_entry, 'open', v_order.product_type
    );
  END IF;

END;
$$;

-- 5. Re-grant permissions
REVOKE EXECUTE ON FUNCTION public.place_order(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric, boolean, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric, boolean, numeric) TO service_role;
