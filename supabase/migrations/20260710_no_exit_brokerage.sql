-- ==============================================================================
-- MIGRATION: No Brokerage on Exit
-- Date: 2026-07-10
-- Description: Brokerage is already charged 2x (entry + exit) when opening a
--              position. This migration ensures no additional brokerage is charged
--              when closing a position (via auto-netting or manual close).
-- ==============================================================================

-- 1. Update process_executed_position to skip brokerage on exit orders
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
  
  -- Brokerage local vars
  v_trading_mode text;
  v_comm_type text;
  v_comm_val numeric;
  v_carry_comm_type text;
  v_carry_comm_val numeric;
  v_gtt_comm_type text;
  v_gtt_comm_val numeric;
  
  v_raw_brokerage numeric := 0;
  v_gtt_brokerage numeric := 0;
  v_brokerage numeric := 0;
  v_closed_entry_brokerage numeric;
  v_closed_brokerage numeric;
  v_lots integer := 1;
  v_lot_size integer;
  
  v_opposite_pos_found boolean := false;
  v_linked_pos_id uuid := NULL;
  
  v_remaining_qty integer;
  v_close_qty integer;
  v_chunk_brokerage numeric;
  
  -- Referral / First Trade Bonus vars
  v_has_traded boolean;
  v_parent_id_text text;
BEGIN
  -- Fetch the order details
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND status = 'EXECUTED';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- ─── CALCULATE BROKERAGE (but defer charging until we know if entry or exit) ───
  SELECT trading_mode INTO v_trading_mode
  FROM public.profiles
  WHERE id = v_order.user_id;

  IF v_trading_mode = 'scalper' THEN
    SELECT commission_type, commission_value, carry_commission_type, carry_commission_value, gtt_commission_type, gtt_commission_value 
    INTO v_comm_type, v_comm_val, v_carry_comm_type, v_carry_comm_val, v_gtt_comm_type, v_gtt_comm_val
    FROM public.scalper_segment_settings
    WHERE user_id = v_order.user_id AND segment = v_order.segment AND side = v_order.side;
  ELSE
    SELECT commission_type, commission_value, carry_commission_type, carry_commission_value, gtt_commission_type, gtt_commission_value 
    INTO v_comm_type, v_comm_val, v_carry_comm_type, v_carry_comm_val, v_gtt_comm_type, v_gtt_comm_val
    FROM public.segment_settings
    WHERE user_id = v_order.user_id AND segment = v_order.segment AND side = v_order.side;
  END IF;

  -- Defaults fallback
  IF v_comm_type IS NULL THEN
    v_comm_type := 'Per Crore';
    v_comm_val := CASE WHEN v_order.segment = 'FOREX' THEN 2000 WHEN v_order.segment = 'CRYPTO' THEN 1000 ELSE 4500 END;
  END IF;

  IF v_carry_comm_type IS NULL THEN
    v_carry_comm_type := 'Per Crore';
    v_carry_comm_val := CASE WHEN v_order.segment = 'FOREX' THEN 2000 WHEN v_order.segment = 'CRYPTO' THEN 1000 ELSE 4500 END;
  END IF;

  IF v_gtt_comm_type IS NULL THEN
    v_gtt_comm_type := 'Per Trade';
    v_gtt_comm_val := 10;
  END IF;

  -- Fetch lot size from instruments table using kite_instrument (tradingsymbol) or symbol
  SELECT lot_size INTO v_lot_size 
  FROM public.instruments 
  WHERE tradingsymbol = v_order.kite_instrument 
     OR tradingsymbol = v_order.symbol
  LIMIT 1;

  -- Fallback: match by underlying name prefix (populated by sync-instruments cron)
  IF v_lot_size IS NULL OR v_lot_size <= 0 THEN
    SELECT i.lot_size INTO v_lot_size
    FROM public.instruments i
    WHERE i.lot_size > 0
      AND v_order.symbol ILIKE i.name || '%'
    ORDER BY length(i.name) DESC
    LIMIT 1;
  END IF;

  -- Fallback: script_settings admin overrides
  IF v_lot_size IS NULL OR v_lot_size <= 0 THEN
    SELECT lot_size INTO v_lot_size FROM public.script_settings WHERE v_order.symbol ILIKE '%' || symbol || '%' ORDER BY length(symbol) DESC LIMIT 1;
  END IF;

  -- Last resort: hardcoded values (current as of Jul 2026 — update when NSE revises)
  IF v_lot_size IS NULL OR v_lot_size <= 0 THEN
    IF v_order.symbol ILIKE '%BANKNIFTY%' OR v_order.symbol ILIKE '%BANKEX%' THEN
      v_lot_size := 30;
    ELSIF v_order.symbol ILIKE '%FINNIFTY%' THEN
      v_lot_size := 40;
    ELSIF v_order.symbol ILIKE '%MIDCP%' OR v_order.symbol ILIKE '%MIDCAP%' THEN
      v_lot_size := 75;
    ELSIF v_order.symbol ILIKE '%SENSEX%' THEN
      v_lot_size := 20;
    ELSIF v_order.symbol ILIKE '%NIFTY%' THEN
      v_lot_size := 75;
    ELSIF v_order.symbol ILIKE '%GOLDM%' THEN
      v_lot_size := 10;
    ELSIF v_order.symbol ILIKE '%GOLD%' THEN
      v_lot_size := 100;
    ELSIF v_order.symbol ILIKE '%SILVERM%' THEN
      v_lot_size := 5;
    ELSIF v_order.symbol ILIKE '%SILVER%' THEN
      v_lot_size := 30;
    ELSIF v_order.symbol ILIKE '%CRUDEOIL%' THEN
      v_lot_size := 100;
    ELSIF v_order.symbol ILIKE '%NATURALGAS%' THEN
      v_lot_size := 1250;
    ELSE
      v_lot_size := 1;
    END IF;
  END IF;

  v_lots := COALESCE(NULLIF(v_order.lots, 0), GREATEST(1, CEIL(v_order.qty::numeric / NULLIF(v_lot_size, 0)::numeric)))::numeric;

  -- 1. Intraday Commission (ALWAYS applied)
  IF v_comm_type = 'Per Crore' THEN
    v_raw_brokerage := (v_order.qty * v_order.fill_price * v_comm_val) / 10000000;
  ELSIF v_comm_type = 'Per Lot' THEN
    v_raw_brokerage := v_lots * v_comm_val;
  ELSIF v_comm_type = 'Per Trade' THEN
    v_raw_brokerage := v_comm_val;
  ELSE
    v_raw_brokerage := (v_order.qty * v_order.fill_price * 0.001); -- 0.1% fallback
  END IF;

  -- 3. GTT Commission (only if GTT order, stacked on top)
  IF v_order.order_type = 'GTT' THEN
    IF v_gtt_comm_type = 'Per Crore' THEN
      v_gtt_brokerage := (v_order.qty * v_order.fill_price * v_gtt_comm_val) / 10000000;
    ELSIF v_gtt_comm_type = 'Per Lot' THEN
      v_gtt_brokerage := v_lots * v_gtt_comm_val;
    ELSIF v_gtt_comm_type = 'Per Trade' THEN
      v_gtt_brokerage := v_gtt_comm_val;
    ELSE
      v_gtt_brokerage := 0;
    END IF;
  END IF;

  v_brokerage := (v_raw_brokerage + v_gtt_brokerage) * 2;

  -- Save brokerage and lots to the order (always record for audit)
  UPDATE public.orders
  SET brokerage = v_brokerage,
      lots = v_lots
  WHERE id = v_order.id;

  -- Debit buffer fee (always applies regardless of entry/exit)
  IF v_order.buffer_fee > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (v_order.user_id, 'BUFFER_FEE_DEBIT', v_order.buffer_fee, 'APPROVED', 'BUF_' || v_order.id::text);
  END IF;

  -- Attempt to parse info column as UUID if present
  IF v_order.info IS NOT NULL THEN
    BEGIN
      v_linked_pos_id := v_order.info::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_linked_pos_id := NULL;
    END;
  END IF;

  -- INTELLIGENT AUTO-NETTING FOR EXITS (LOOP):
  v_remaining_qty := v_order.qty;

  FOR v_pos IN
    SELECT * 
    FROM public.positions
    WHERE user_id = v_order.user_id 
      AND symbol = v_order.symbol 
      AND status = 'open' 
      AND product_type = v_order.product_type
      AND side != v_order.side
      AND (v_linked_pos_id IS NULL OR id = v_linked_pos_id)
    ORDER BY entry_time ASC
    FOR UPDATE
  LOOP
    IF v_remaining_qty <= 0 THEN
      EXIT;
    END IF;

    v_opposite_pos_found := true;
    v_close_qty := LEAST(v_remaining_qty, v_pos.qty_open);
    -- EXIT: No additional brokerage — already charged 2x at entry
    v_chunk_brokerage := 0;

    -- Calculate realized P&L (BUY = exit - entry, SELL = entry - exit)
    IF v_pos.side = 'BUY' THEN
      v_pnl := (v_order.fill_price - v_pos.entry_price) * v_close_qty;
    ELSE
      v_pnl := (v_pos.entry_price - v_order.fill_price) * v_close_qty;
    END IF;

    IF v_close_qty = v_pos.qty_open THEN
      -- FULL EXIT: Close active position row (no exit brokerage added)
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
      -- Calculate proportional entry brokerage for the closed portion
      v_closed_entry_brokerage := (v_pos.entry_brokerage * v_close_qty) / v_pos.qty_open;
      v_closed_brokerage := (v_pos.brokerage * v_close_qty) / v_pos.qty_open;

      -- 1. Reduce quantity, entry brokerage and total brokerage of the active open position
      UPDATE public.positions
      SET
        qty_open = qty_open - v_close_qty,
        qty_total = qty_total - v_close_qty,
        entry_brokerage = entry_brokerage - v_closed_entry_brokerage,
        brokerage = brokerage - v_closed_brokerage,
        updated_at = now()
      WHERE id = v_pos.id;

      -- 2. Create a new CLOSED position representing the exited portion (entry brokerage only, no exit brokerage)
      INSERT INTO public.positions (
        user_id, symbol, side, status,
        qty_total, qty_open,
        avg_price, entry_price, ltp,
        settlement, product_type, exit_price, exit_time, pnl, duration_seconds, 
        entry_brokerage, exit_brokerage, brokerage, created_at, updated_at
      )
      VALUES (
        v_order.user_id, v_order.symbol, v_pos.side, 'closed',
        v_close_qty, 0,
        v_pos.avg_price, v_pos.entry_price, v_order.ltp_at_entry,
        v_order.segment, v_pos.product_type, v_order.fill_price, now(), v_pnl,
        EXTRACT(EPOCH FROM (now() - v_pos.entry_time))::integer, 
        v_closed_entry_brokerage, 0, v_closed_entry_brokerage, now(), now()
      )
      RETURNING id INTO v_closed_pos_id;

      -- 3. Record PNL transaction for the closed portion
      v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
      INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
      VALUES (v_order.user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', v_closed_pos_id::text);
    END IF;

    v_remaining_qty := v_remaining_qty - v_close_qty;
  END LOOP;

  -- ─── BROKERAGE DEBIT: Only charge for ENTRY orders, not exits ───
  IF NOT v_opposite_pos_found OR v_remaining_qty > 0 THEN

    -- Only charge brokerage for the entry portion
    IF v_remaining_qty < v_order.qty THEN
      -- Mixed order: some qty closed opposite positions, some is new entry
      -- Only charge brokerage proportional to the new entry qty
      v_brokerage := (v_brokerage * v_remaining_qty) / v_order.qty;
    END IF;

    IF v_brokerage > 0 THEN
      INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
      VALUES (v_order.user_id, 'BROKERAGE_DEBIT', v_brokerage, 'APPROVED', 'BKG_' || v_order.id::text);
    END IF;

    -- ─── ENTRY ORDER LOGIC (No opposite position found, or remaining qty > 0) ───
    v_chunk_brokerage := v_brokerage;
    INSERT INTO public.positions (
      user_id, symbol, side, status,
      qty_total, qty_open,
      avg_price, entry_price, ltp,
      settlement, product_type, stop_loss, target, 
      entry_brokerage, exit_brokerage, brokerage, created_at, updated_at
    )
    VALUES (
      v_order.user_id, v_order.symbol, v_order.side, 'open',
      v_remaining_qty, v_remaining_qty,
      v_order.fill_price, v_order.fill_price, v_order.ltp_at_entry,
      v_order.segment, v_order.product_type, v_order.stop_loss, v_order.target, 
      v_chunk_brokerage, 0, v_chunk_brokerage, now(), now()
    );
  ELSE
    -- Pure exit order — set order brokerage to 0 since already paid at entry
    UPDATE public.orders SET brokerage = 0 WHERE id = v_order.id;
  END IF;

  -- ─── FIRST TRADE BONUS LOGIC ───
  SELECT has_traded, parent_id INTO v_has_traded, v_parent_id_text
  FROM public.profiles WHERE id = v_order.user_id;

  IF NOT v_has_traded THEN
    UPDATE public.profiles SET has_traded = TRUE WHERE id = v_order.user_id;
    IF v_parent_id_text IS NOT NULL THEN
      UPDATE public.profiles
         SET referral_balance = referral_balance + 200
       WHERE id = v_parent_id_text::uuid;
      INSERT INTO public.referral_earnings
        (referrer_id, referred_user_id, transaction_id, commission_amount, earning_type)
      VALUES
        (v_parent_id_text::uuid, v_order.user_id, v_order.id, 200, 'FIRST_TRADE_BONUS');
    END IF;
  END IF;

END;
$$;

-- 2. Update close_position to NOT charge brokerage on exit (already paid at entry)
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
    exit_price = p_exit_price,
    exit_time = now(),
    pnl = v_pnl,
    duration_seconds = v_duration_sec,
    updated_at = now(),
    locked_margin = 0
  WHERE id = p_position_id;

  -- Record PNL transaction
  v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
  
  INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
  VALUES (p_user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', p_position_id::text);

  -- Only charge carry brokerage if explicitly passed (for CARRY positions at exit)
  IF p_brokerage > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (p_user_id, 'BROKERAGE_DEBIT', p_brokerage, 'APPROVED', 'BKG_EXIT_' || p_position_id::text);
  END IF;

  RETURN v_pnl;
END;
$$;
