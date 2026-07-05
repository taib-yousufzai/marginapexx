-- Step 1: Add breakdown columns
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS intraday_brokerage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carry_brokerage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gtt_brokerage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lots numeric DEFAULT 0;

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS entry_intraday_brokerage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entry_carry_brokerage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS entry_gtt_brokerage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exit_intraday_brokerage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exit_carry_brokerage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS exit_gtt_brokerage numeric DEFAULT 0;

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
  
  -- Brokerage local vars
  v_trading_mode text;
  v_comm_type text;
  v_comm_val numeric;
  v_carry_comm_type text;
  v_carry_comm_val numeric;
  v_gtt_comm_type text;
  v_gtt_comm_val numeric;

  v_raw_brokerage          numeric := 0;
  v_gtt_brokerage          numeric := 0;
  v_brokerage              numeric := 0;
  v_closed_entry_brokerage numeric := 0;
  v_closed_brokerage       numeric := 0;
  v_pos_found              boolean;
  v_has_traded             boolean;
  v_parent_id_text         text;

  v_lot_size               numeric;
  v_lots                   numeric;
  
  v_intraday_brokerage     numeric := 0;
  v_carry_brokerage        numeric := 0;
BEGIN
  -- Fetch the order
  SELECT o.*, ss.commission_type, ss.commission_value,
         ss.carry_commission_type, ss.carry_commission_value,
         ss.gtt_commission_type,   ss.gtt_commission_value
  INTO v_order
  FROM public.orders o
  LEFT JOIN public.segment_settings ss
         ON ss.user_id = o.user_id
        AND ss.segment  = o.segment
        AND ss.side     = o.side
  WHERE o.id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- Commission defaults
  v_comm_type       := COALESCE(v_order.commission_type,       'Per Crore');
  v_comm_val        := COALESCE(v_order.commission_value,      4500);
  v_carry_comm_type := COALESCE(v_order.carry_commission_type, v_comm_type);
  v_carry_comm_val  := COALESCE(v_order.carry_commission_value, v_comm_val);
  v_gtt_comm_type   := COALESCE(v_order.gtt_commission_type,   'Per Trade');
  v_gtt_comm_val    := COALESCE(v_order.gtt_commission_value,  10);

  -- ── Lot size resolution ──
  SELECT i.lot_size INTO v_lot_size
  FROM public.instruments i
  WHERE i.lot_size > 0
    AND (
      i.tradingsymbol = v_order.symbol
      OR (i.name IS NOT NULL AND v_order.symbol ILIKE i.name || '%')
    )
  ORDER BY length(i.tradingsymbol) DESC
  LIMIT 1;

  IF v_lot_size IS NULL OR v_lot_size <= 0 THEN
    SELECT ss.lot_size INTO v_lot_size
    FROM public.script_settings ss
    WHERE v_order.symbol ILIKE '%' || ss.symbol || '%'
    ORDER BY length(ss.symbol) DESC
    LIMIT 1;
  END IF;

  IF v_lot_size IS NULL OR v_lot_size <= 0 THEN
    IF    v_order.symbol ILIKE '%BANKNIFTY%' OR v_order.symbol ILIKE '%BANKEX%' THEN v_lot_size := 30;
    ELSIF v_order.symbol ILIKE '%FINNIFTY%'                                      THEN v_lot_size := 40;
    ELSIF v_order.symbol ILIKE '%MIDCPNIFTY%' OR v_order.symbol ILIKE '%MIDCAP%' THEN v_lot_size := 50;
    ELSIF v_order.symbol ILIKE '%SENSEX%'                                        THEN v_lot_size := 20;
    ELSIF v_order.symbol ILIKE '%NIFTY%'                                         THEN v_lot_size := 75;
    ELSIF v_order.symbol ILIKE '%GOLDM%'                                         THEN v_lot_size := 10;
    ELSIF v_order.symbol ILIKE '%GOLD%'                                          THEN v_lot_size := 100;
    ELSIF v_order.symbol ILIKE '%SILVERM%'                                       THEN v_lot_size := 5;
    ELSIF v_order.symbol ILIKE '%SILVER%'                                        THEN v_lot_size := 30;
    ELSIF v_order.symbol ILIKE '%CRUDEOILM%'                                     THEN v_lot_size := 10;
    ELSIF v_order.symbol ILIKE '%CRUDEOIL%'                                      THEN v_lot_size := 100;
    ELSIF v_order.symbol ILIKE '%NATGASMINI%'                                    THEN v_lot_size := 250;
    ELSIF v_order.symbol ILIKE '%NATURALGAS%'                                    THEN v_lot_size := 1250;
    ELSE  v_lot_size := 1;
    END IF;
  END IF;

  v_lots := COALESCE(NULLIF(v_order.lots, 0), v_order.qty / v_lot_size);

  -- ── Brokerage calculation ──
  IF v_order.product_type = 'CARRY' OR v_order.order_type = 'GTT' THEN
    IF    v_carry_comm_type = 'Per Crore' THEN v_raw_brokerage := (v_order.qty * v_order.fill_price * v_carry_comm_val) / 10000000;
    ELSIF v_carry_comm_type = 'Per Lot'   THEN v_raw_brokerage := v_lots * v_carry_comm_val;
    ELSIF v_carry_comm_type IN ('Per Trade', 'Flat') THEN v_raw_brokerage := v_carry_comm_val;
    ELSE  v_raw_brokerage := v_order.qty * v_order.fill_price * 0.001;
    END IF;
  ELSE
    IF    v_comm_type = 'Per Crore' THEN v_raw_brokerage := (v_order.qty * v_order.fill_price * v_comm_val) / 10000000;
    ELSIF v_comm_type = 'Per Lot'   THEN v_raw_brokerage := v_lots * v_comm_val;
    ELSIF v_comm_type IN ('Per Trade', 'Flat') THEN v_raw_brokerage := v_comm_val;
    ELSE  v_raw_brokerage := v_order.qty * v_order.fill_price * 0.001;
    END IF;
  END IF;

  IF v_order.order_type = 'GTT' THEN
    IF    v_gtt_comm_type = 'Per Crore' THEN v_gtt_brokerage := (v_order.qty * v_order.fill_price * v_gtt_comm_val) / 10000000;
    ELSIF v_gtt_comm_type = 'Per Lot'   THEN v_gtt_brokerage := v_lots * v_gtt_comm_val;
    ELSIF v_gtt_comm_type IN ('Per Trade', 'Flat') THEN v_gtt_brokerage := v_gtt_comm_val;
    END IF;
  END IF;

  v_brokerage := (v_raw_brokerage + v_gtt_brokerage) * 2;
  IF v_order.product_type = 'CARRY' OR v_order.order_type = 'GTT' THEN
    v_carry_brokerage := v_raw_brokerage * 2;
  ELSE
    v_intraday_brokerage := v_raw_brokerage * 2;
  END IF;
  v_gtt_brokerage := v_gtt_brokerage * 2;

  -- Save brokerage and lots to the order
  UPDATE public.orders
  SET brokerage = v_brokerage,
      intraday_brokerage = v_intraday_brokerage,
      carry_brokerage = v_carry_brokerage,
      gtt_brokerage = v_gtt_brokerage,
      lots = v_lots
  WHERE id = v_order.id;

  -- Debit user's balance immediately via transaction
  IF v_brokerage > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (v_order.user_id, 'BROKERAGE_DEBIT', v_brokerage, 'APPROVED', 'BKG_' || v_order.id::text);
  END IF;

  -- Debit buffer fee
  IF v_order.buffer_fee > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (v_order.user_id, 'BUFFER_FEE_DEBIT', v_order.buffer_fee, 'APPROVED', 'BUF_' || v_order.id::text);
  END IF;

  -- Lock and fetch active position
  SELECT * INTO v_pos
  FROM public.positions
  WHERE user_id = v_order.user_id 
    AND symbol = v_order.symbol 
    AND status = 'open' 
    AND product_type = v_order.product_type
  FOR UPDATE;

  v_pos_found := FOUND;

  IF v_order.is_exit THEN
    -- ─── EXIT ORDER LOGIC ───
    IF NOT v_pos_found THEN
      RAISE EXCEPTION 'No active position exists to exit';
    END IF;

    IF v_pos.side = v_order.side THEN
      RAISE EXCEPTION 'Invalid exit side: exit order side must be opposite of position side';
    END IF;

    IF v_order.qty > v_pos.qty_open THEN
      RAISE EXCEPTION 'Exit quantity cannot exceed current position quantity';
    END IF;

    -- Calculate realized P&L
    IF v_pos.side = 'BUY' THEN
      v_pnl := (v_order.fill_price - v_pos.entry_price) * v_order.qty;
    ELSE
      v_pnl := (v_pos.entry_price - v_order.fill_price) * v_order.qty;
    END IF;

    IF v_order.qty = v_pos.qty_open THEN
      -- FULL EXIT
      UPDATE public.positions
      SET
        status = 'closed',
        qty_open = 0,
        exit_price = v_order.fill_price,
        exit_time = now(),
        pnl = v_pnl,
        duration_seconds = EXTRACT(EPOCH FROM (now() - entry_time))::integer,
        exit_brokerage = exit_brokerage + v_brokerage,
        exit_intraday_brokerage = exit_intraday_brokerage + v_intraday_brokerage,
        exit_carry_brokerage = exit_carry_brokerage + v_carry_brokerage,
        exit_gtt_brokerage = exit_gtt_brokerage + v_gtt_brokerage,
        brokerage = brokerage + v_brokerage,
        updated_at = now()
      WHERE id = v_pos.id;

      -- Record PNL transaction
      v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
      INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
      VALUES (v_order.user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', v_pos.id::text);

    ELSE
      -- PARTIAL EXIT
      v_closed_entry_brokerage := (v_pos.entry_brokerage * v_order.qty) / v_pos.qty_open;
      v_closed_brokerage := (v_pos.brokerage * v_order.qty) / v_pos.qty_open;
      
      -- We must also scale the entry breakdown for the closed portion
      DECLARE
        v_closed_entry_intra numeric := (v_pos.entry_intraday_brokerage * v_order.qty) / v_pos.qty_open;
        v_closed_entry_carry numeric := (v_pos.entry_carry_brokerage * v_order.qty) / v_pos.qty_open;
        v_closed_entry_gtt   numeric := (v_pos.entry_gtt_brokerage * v_order.qty) / v_pos.qty_open;
      BEGIN
        UPDATE public.positions
        SET
          qty_open = qty_open - v_order.qty,
          qty_total = qty_total - v_order.qty,
          entry_brokerage = entry_brokerage - v_closed_entry_brokerage,
          entry_intraday_brokerage = entry_intraday_brokerage - v_closed_entry_intra,
          entry_carry_brokerage = entry_carry_brokerage - v_closed_entry_carry,
          entry_gtt_brokerage = entry_gtt_brokerage - v_closed_entry_gtt,
          brokerage = brokerage - v_closed_brokerage,
          updated_at = now()
        WHERE id = v_pos.id;

        INSERT INTO public.positions (
          user_id, symbol, side, status,
          qty_total, qty_open,
          avg_price, entry_price, ltp,
          settlement, product_type, exit_price, exit_time, pnl, duration_seconds, 
          entry_brokerage, exit_brokerage, brokerage,
          entry_intraday_brokerage, entry_carry_brokerage, entry_gtt_brokerage,
          exit_intraday_brokerage, exit_carry_brokerage, exit_gtt_brokerage,
          created_at, updated_at
        )
        VALUES (
          v_order.user_id, v_order.symbol, v_pos.side, 'closed',
          v_order.qty, 0,
          v_pos.avg_price, v_pos.entry_price, v_order.ltp_at_entry,
          v_order.segment, v_pos.product_type, v_order.fill_price, now(), v_pnl,
          EXTRACT(EPOCH FROM (now() - v_pos.entry_time))::integer, 
          v_closed_entry_brokerage, v_brokerage, v_closed_entry_brokerage + v_brokerage,
          v_closed_entry_intra, v_closed_entry_carry, v_closed_entry_gtt,
          v_intraday_brokerage, v_carry_brokerage, v_gtt_brokerage,
          now(), now()
        )
        RETURNING id INTO v_closed_pos_id;
      END;

      v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
      INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
      VALUES (v_order.user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', v_closed_pos_id::text);

    END IF;

  ELSE
    -- ─── ENTRY ORDER LOGIC ───
    IF v_pos_found THEN
      IF v_pos.side = v_order.side THEN
        v_new_avg_price := ((v_pos.avg_price * v_pos.qty_open) + (v_order.fill_price * v_order.qty)) / (v_pos.qty_open + v_order.qty);

        UPDATE public.positions
        SET
          qty_open = qty_open + v_order.qty,
          qty_total = qty_total + v_order.qty,
          avg_price = v_new_avg_price,
          entry_price = v_new_avg_price,
          entry_brokerage = entry_brokerage + v_brokerage,
          entry_intraday_brokerage = entry_intraday_brokerage + v_intraday_brokerage,
          entry_carry_brokerage = entry_carry_brokerage + v_carry_brokerage,
          entry_gtt_brokerage = entry_gtt_brokerage + v_gtt_brokerage,
          brokerage = brokerage + v_brokerage,
          updated_at = now()
        WHERE id = v_pos.id;
      ELSE
        RAISE EXCEPTION 'Cannot open opposite position while existing position is active';
      END IF;
    ELSE
      INSERT INTO public.positions (
        user_id, symbol, side, status,
        qty_total, qty_open,
        avg_price, entry_price, ltp,
        settlement, product_type, stop_loss, target, 
        entry_brokerage, exit_brokerage, brokerage,
        entry_intraday_brokerage, entry_carry_brokerage, entry_gtt_brokerage,
        created_at, updated_at
      )
      VALUES (
        v_order.user_id, v_order.symbol, v_order.side, 'open',
        v_order.qty, v_order.qty,
        v_order.fill_price, v_order.fill_price, v_order.ltp_at_entry,
        v_order.segment, v_order.product_type, v_order.stop_loss, v_order.target, 
        v_brokerage, 0, v_brokerage,
        v_intraday_brokerage, v_carry_brokerage, v_gtt_brokerage,
        now(), now()
      );
    END IF;
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
        (referrer_id, referred_id, amount, type, description)
      VALUES
        (v_parent_id_text::uuid, v_order.user_id, 200, 'FIRST_TRADE_BONUS', 'First trade bonus');
    END IF;
  END IF;

END;
$$;
