-- ------------------------------------------
-- FILE: 20260614_separate_positions_per_order.sql
-- ------------------------------------------
-- Changes the position model so that each executed entry order creates its
-- own position row instead of accumulating into a single row.
--
-- Exit logic uses FIFO: oldest open position for the same
-- (user, symbol, side, product_type) is closed/reduced first.
--
-- place_order no longer blocks same-side entries for non-options symbols.
-- Options still enforce the strict directional constraint.
-- ------------------------------------------


-- ─── 1. Redefine place_order ───
-- Removes the same-side accumulation block for non-options instruments.
-- Options keep strict direction checking (no same-strike opposite positions).

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
  v_order_id     uuid;
  v_status       text;
  v_ord_strike   numeric;
  v_ord_opt_type text;
  v_pos          record;
  v_pos_strike   numeric;
  v_pos_opt_type text;
  v_total_open   numeric;
BEGIN
  -- ─── OPTIONS: strict direction + exit quantity validation ───
  SELECT * INTO v_ord_strike, v_ord_opt_type
  FROM public.parse_option_symbol(p_symbol);

  IF v_ord_strike IS NOT NULL AND v_ord_opt_type IS NOT NULL THEN
    FOR v_pos IN
      SELECT * FROM public.positions
      WHERE user_id = p_user_id
        AND status = 'open'
        AND qty_open > 0
        AND product_type = p_product_type
    LOOP
      SELECT * INTO v_pos_strike, v_pos_opt_type
      FROM public.parse_option_symbol(v_pos.symbol);

      IF v_pos_strike = v_ord_strike AND v_pos_opt_type = v_ord_opt_type THEN
        IF p_is_exit THEN
          IF v_pos.side = p_side THEN
            RAISE EXCEPTION 'No % position exists to exit',
              CASE WHEN v_pos.side = 'BUY' THEN 'SELL' ELSE 'BUY' END;
          END IF;
        ELSE
          -- Block entries in the opposite direction for options
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

    IF p_is_exit AND NOT FOUND THEN
      RAISE EXCEPTION 'No % position exists to exit',
        CASE WHEN p_side = 'BUY' THEN 'SELL' ELSE 'BUY' END;
    END IF;
  END IF;

  -- ─── NON-OPTIONS exit: validate enough open qty exists ───
  IF p_is_exit AND (v_ord_strike IS NULL OR v_ord_opt_type IS NULL) THEN
    SELECT COALESCE(SUM(qty_open), 0) INTO v_total_open
    FROM public.positions
    WHERE user_id = p_user_id
      AND symbol = p_symbol
      AND product_type = p_product_type
      AND status = 'open'
      AND qty_open > 0
      AND side != p_side;  -- opposite side positions are what we're closing

    IF v_total_open = 0 THEN
      RAISE EXCEPTION 'No open position exists to exit for %', p_symbol;
    END IF;

    IF p_qty > v_total_open THEN
      RAISE EXCEPTION 'Exit quantity (%) exceeds total open position quantity (%)',
        p_qty, v_total_open;
    END IF;
  END IF;

  -- ─── Determine order status ───
  IF p_order_type IN ('MARKET', 'SLM') THEN
    v_status := 'EXECUTED';
  ELSE
    v_status := 'PENDING';
  END IF;

  -- ─── Insert order ───
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

  IF v_status = 'EXECUTED' THEN
    PERFORM public.process_executed_position(v_order_id);
  END IF;

  INSERT INTO public.act_logs (
    type, user_id, target_user_id, symbol, qty, price, reason,
    original_price, margin_used, buffer, brokerage_value, brokerage_mode, trade_mode
  )
  VALUES (
    CASE WHEN v_status = 'EXECUTED' THEN 'ORDER_EXECUTION' ELSE 'ORDER_PLACED' END,
    p_user_id, p_user_id,
    p_symbol, p_qty, p_fill_price,
    p_order_type || ' ' || v_status || ' @ ' || COALESCE(p_trigger_price::text, 'no-trigger'),
    CASE WHEN v_status = 'EXECUTED' THEN p_fill_price ELSE NULL END,
    NULL,
    NULL,
    NULL,
    NULL,
    CASE WHEN v_status = 'EXECUTED' THEN lower(p_product_type) ELSE NULL END
  );

  RETURN v_order_id;
END;
$$;


-- ─── 2. Redefine process_executed_position ───
-- Entry orders always create a new position row (one row per order).
-- Exit orders use FIFO: oldest open position for matching side is reduced first.

CREATE OR REPLACE FUNCTION public.process_executed_position(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order               record;
  v_pos                 record;
  v_closed_pos_id       uuid;
  v_pnl                 numeric;
  v_pnl_type            text;
  v_rem_exit_qty        numeric;

  -- Brokerage vars
  v_trading_mode        text;
  v_comm_type           text;
  v_comm_val            numeric;
  v_carry_comm_type     text;
  v_carry_comm_val      numeric;
  v_gtt_comm_type       text;
  v_gtt_comm_val        numeric;
  v_raw_brokerage       numeric := 0;
  v_gtt_brokerage       numeric := 0;
  v_brokerage           numeric := 0;
  v_lot_size            numeric;
  v_lots                numeric;

  -- Per-position exit brokerage split
  v_exit_qty_for_pos    numeric;
  v_exit_brokerage_for_pos numeric;
  v_pos_pnl             numeric;
BEGIN
  -- ─── Fetch order ───
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_order.status != 'EXECUTED' THEN
    RETURN;
  END IF;

  -- ─── Calculate brokerage ───
  SELECT trading_mode INTO v_trading_mode
  FROM public.profiles WHERE id = v_order.user_id;

  IF v_trading_mode = 'scalper' THEN
    SELECT commission_type, commission_value,
           carry_commission_type, carry_commission_value,
           gtt_commission_type, gtt_commission_value
    INTO   v_comm_type, v_comm_val,
           v_carry_comm_type, v_carry_comm_val,
           v_gtt_comm_type, v_gtt_comm_val
    FROM   public.scalper_segment_settings
    WHERE  user_id = v_order.user_id
      AND  segment  = v_order.segment
      AND  side     = v_order.side;
  ELSE
    SELECT commission_type, commission_value,
           carry_commission_type, carry_commission_value,
           gtt_commission_type, gtt_commission_value
    INTO   v_comm_type, v_comm_val,
           v_carry_comm_type, v_carry_comm_val,
           v_gtt_comm_type, v_gtt_comm_val
    FROM   public.segment_settings
    WHERE  user_id = v_order.user_id
      AND  segment  = v_order.segment
      AND  side     = v_order.side;
  END IF;

  -- Defaults
  IF v_comm_type IS NULL THEN
    v_comm_type := 'Per Crore';
    v_comm_val  := CASE
      WHEN v_order.segment = 'FOREX'  THEN 2000
      WHEN v_order.segment = 'CRYPTO' THEN 1000
      ELSE 4500 END;
  END IF;
  IF v_carry_comm_type IS NULL THEN
    v_carry_comm_type := 'Per Crore';
    v_carry_comm_val  := CASE
      WHEN v_order.segment = 'FOREX'  THEN 2000
      WHEN v_order.segment = 'CRYPTO' THEN 1000
      ELSE 4500 END;
  END IF;
  IF v_gtt_comm_type IS NULL THEN
    v_gtt_comm_type := 'Per Trade';
    v_gtt_comm_val  := 10;
  END IF;

  -- Lot size
  SELECT lot_size INTO v_lot_size
  FROM public.script_settings
  WHERE v_order.symbol ILIKE '%' || symbol || '%'
  LIMIT 1;

  IF v_lot_size IS NULL OR v_lot_size <= 0 THEN
    IF    v_order.symbol LIKE '%BANKNIFTY%' OR v_order.symbol LIKE '%BANKEX%' THEN v_lot_size := 15;
    ELSIF v_order.symbol LIKE '%FINNIFTY%'                                     THEN v_lot_size := 40;
    ELSIF v_order.symbol LIKE '%MIDCP%' OR v_order.symbol LIKE '%MIDCAP%'     THEN v_lot_size := 75;
    ELSIF v_order.symbol LIKE '%SENSEX%'                                       THEN v_lot_size := 10;
    ELSIF v_order.symbol LIKE '%NIFTY%'                                        THEN v_lot_size := 25;
    ELSE                                                                             v_lot_size := 1;
    END IF;
  END IF;

  v_lots := COALESCE(NULLIF(v_order.lots, 0), v_order.qty / v_lot_size);

  -- Commission calculation
  IF v_order.product_type = 'CARRY' THEN
    CASE v_carry_comm_type
      WHEN 'Per Crore' THEN v_raw_brokerage := (v_order.qty * v_order.fill_price * v_carry_comm_val) / 10000000;
      WHEN 'Per Lot'   THEN v_raw_brokerage := v_lots * v_carry_comm_val;
      WHEN 'Per Trade' THEN v_raw_brokerage := v_carry_comm_val;
      ELSE                  v_raw_brokerage := v_order.qty * v_order.fill_price * 0.001;
    END CASE;
  ELSE
    CASE v_comm_type
      WHEN 'Per Crore' THEN v_raw_brokerage := (v_order.qty * v_order.fill_price * v_comm_val) / 10000000;
      WHEN 'Per Lot'   THEN v_raw_brokerage := v_lots * v_comm_val;
      WHEN 'Per Trade' THEN v_raw_brokerage := v_comm_val;
      ELSE                  v_raw_brokerage := v_order.qty * v_order.fill_price * 0.001;
    END CASE;
  END IF;

  IF v_order.order_type = 'GTT' THEN
    CASE v_gtt_comm_type
      WHEN 'Per Crore' THEN v_gtt_brokerage := (v_order.qty * v_order.fill_price * v_gtt_comm_val) / 10000000;
      WHEN 'Per Lot'   THEN v_gtt_brokerage := v_lots * v_gtt_comm_val;
      WHEN 'Per Trade' THEN v_gtt_brokerage := v_gtt_comm_val;
      ELSE                  v_gtt_brokerage := 0;
    END CASE;
  END IF;

  v_brokerage := v_raw_brokerage + v_gtt_brokerage;

  UPDATE public.orders
  SET brokerage = v_brokerage, lots = v_lots
  WHERE id = v_order.id;

  IF v_brokerage > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (v_order.user_id, 'BROKERAGE_DEBIT', v_brokerage, 'APPROVED', 'BKG_' || v_order.id::text);
  END IF;

  IF v_order.buffer_fee > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (v_order.user_id, 'BUFFER_FEE_DEBIT', v_order.buffer_fee, 'APPROVED', 'BUF_' || v_order.id::text);
  END IF;

  -- ═══════════════════════════════════════════════════════════════
  -- EXIT ORDER: close oldest open positions first (FIFO)
  -- ═══════════════════════════════════════════════════════════════
  IF v_order.is_exit THEN

    v_rem_exit_qty := v_order.qty;

    FOR v_pos IN
      SELECT * FROM public.positions
      WHERE user_id    = v_order.user_id
        AND symbol      = v_order.symbol
        AND product_type = v_order.product_type
        AND status      = 'open'
        AND qty_open    > 0
        AND side        != v_order.side   -- opposite side to the exit order
      ORDER BY entry_time ASC             -- FIFO
      FOR UPDATE
    LOOP
      EXIT WHEN v_rem_exit_qty <= 0;

      -- How much of this position to close
      v_exit_qty_for_pos := LEAST(v_rem_exit_qty, v_pos.qty_open);

      -- P&L for the portion being closed
      IF v_pos.side = 'BUY' THEN
        v_pos_pnl := (v_order.fill_price - v_pos.entry_price) * v_exit_qty_for_pos;
      ELSE
        v_pos_pnl := (v_pos.entry_price - v_order.fill_price) * v_exit_qty_for_pos;
      END IF;

      -- Proportional exit brokerage for this position's share
      v_exit_brokerage_for_pos := v_brokerage * (v_exit_qty_for_pos / v_order.qty);

      IF v_exit_qty_for_pos >= v_pos.qty_open THEN
        -- Full close of this position row
        UPDATE public.positions
        SET
          status           = 'closed',
          qty_open         = 0,
          exit_price       = v_order.fill_price,
          exit_time        = now(),
          pnl              = v_pos_pnl,
          duration_seconds = EXTRACT(EPOCH FROM (now() - entry_time))::integer,
          exit_brokerage   = exit_brokerage + v_exit_brokerage_for_pos,
          brokerage        = brokerage + v_exit_brokerage_for_pos,
          updated_at       = now()
        WHERE id = v_pos.id;

        v_pnl_type := CASE WHEN v_pos_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
        INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
        VALUES (v_order.user_id, v_pnl_type, ABS(v_pos_pnl), 'APPROVED', v_pos.id::text);

      ELSE
        -- Partial close: split the position row
        -- 1. Shrink the open position
        UPDATE public.positions
        SET
          qty_open   = qty_open - v_exit_qty_for_pos,
          qty_total  = qty_total - v_exit_qty_for_pos,
          updated_at = now()
        WHERE id = v_pos.id;

        -- 2. Create a closed row for the exited portion
        INSERT INTO public.positions (
          user_id, symbol, side, status,
          qty_total, qty_open,
          avg_price, entry_price, ltp,
          settlement, product_type,
          exit_price, exit_time, pnl, duration_seconds,
          entry_brokerage, exit_brokerage, brokerage,
          created_at, updated_at
        )
        VALUES (
          v_order.user_id, v_order.symbol, v_pos.side, 'closed',
          v_exit_qty_for_pos, 0,
          v_pos.avg_price, v_pos.entry_price, v_order.ltp_at_entry,
          v_order.segment, v_pos.product_type,
          v_order.fill_price, now(), v_pos_pnl,
          EXTRACT(EPOCH FROM (now() - v_pos.entry_time))::integer,
          0, v_exit_brokerage_for_pos, v_exit_brokerage_for_pos,
          now(), now()
        )
        RETURNING id INTO v_closed_pos_id;

        v_pnl_type := CASE WHEN v_pos_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
        INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
        VALUES (v_order.user_id, v_pnl_type, ABS(v_pos_pnl), 'APPROVED', v_closed_pos_id::text);
      END IF;

      v_rem_exit_qty := v_rem_exit_qty - v_exit_qty_for_pos;
    END LOOP;

  -- ═══════════════════════════════════════════════════════════════
  -- ENTRY ORDER: always create a new position row
  -- ═══════════════════════════════════════════════════════════════
  ELSE

    INSERT INTO public.positions (
      user_id, symbol, side, status,
      qty_total, qty_open,
      avg_price, entry_price, ltp,
      settlement, product_type, stop_loss, target,
      entry_brokerage, exit_brokerage, brokerage,
      created_at, updated_at
    )
    VALUES (
      v_order.user_id, v_order.symbol, v_order.side, 'open',
      v_order.qty, v_order.qty,
      v_order.fill_price, v_order.fill_price, v_order.ltp_at_entry,
      v_order.segment, v_order.product_type, v_order.stop_loss, v_order.target,
      v_brokerage, 0, v_brokerage,
      now(), now()
    );

  END IF;

END;
$$;


-- ─── 3. Re-grant permissions ───
REVOKE EXECUTE ON FUNCTION public.place_order(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric, boolean, numeric) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.place_order(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric, boolean, numeric) TO service_role;
