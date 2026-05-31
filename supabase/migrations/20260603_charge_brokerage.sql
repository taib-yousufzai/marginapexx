-- 1. Add brokerage column to public.orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS brokerage numeric NOT NULL DEFAULT 0;

-- 2. Update public.transactions type check constraint
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (type IN ('DEPOSIT','WITHDRAWAL','PNL_CREDIT','PNL_DEBIT','BROKERAGE_DEBIT'));

-- 3. Redefine sync_profile_balance trigger function to support PNL_CREDIT and DEPOSIT as positive additions, and others as subtractions
CREATE OR REPLACE FUNCTION public.sync_profile_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'APPROVED') THEN
    UPDATE public.profiles
    SET balance = balance + (CASE WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT') THEN NEW.amount ELSE -NEW.amount END),
        updated_at = now()
    WHERE id = NEW.user_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- If status changed to APPROVED
    IF (OLD.status <> 'APPROVED' AND NEW.status = 'APPROVED') THEN
      UPDATE public.profiles
      SET balance = balance + (CASE WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT') THEN NEW.amount ELSE -NEW.amount END),
          updated_at = now()
      WHERE id = NEW.user_id;
    -- If an APPROVED transaction is deleted
    ELSIF (OLD.status = 'APPROVED' AND NEW.status <> 'APPROVED') THEN
      UPDATE public.profiles
      SET balance = balance - (CASE WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT') THEN OLD.amount ELSE -OLD.amount END),
          updated_at = now()
      WHERE id = OLD.user_id;
    END IF;
  ELSIF (TG_OP = 'DELETE' AND OLD.status = 'APPROVED') THEN
    UPDATE public.profiles
    SET balance = balance - (CASE WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT') THEN OLD.amount ELSE -OLD.amount END),
        updated_at = now()
    WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Redefine process_executed_position to charge brokerage on entry and split on partial exits
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
  v_raw_brokerage numeric := 0;
  v_brokerage numeric := 0;
  v_closed_brokerage numeric := 0;
BEGIN
  -- Fetch the order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_order.status != 'EXECUTED' THEN
    RETURN;
  END IF;

  -- Lock and fetch active position
  SELECT * INTO v_pos
  FROM public.positions
  WHERE user_id = v_order.user_id 
    AND symbol = v_order.symbol 
    AND status = 'open' 
    AND product_type = v_order.product_type
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
      -- Calculate proportional brokerage for the closed portion
      v_closed_brokerage := (v_pos.brokerage * v_order.qty) / v_pos.qty_open;

      -- 1. Reduce quantity and brokerage of the active open position
      UPDATE public.positions
      SET
        qty_open = qty_open - v_order.qty,
        qty_total = qty_total - v_order.qty,
        brokerage = brokerage - v_closed_brokerage,
        updated_at = now()
      WHERE id = v_pos.id;

      -- 2. Create a new CLOSED position representing the exited portion
      INSERT INTO public.positions (
        user_id, symbol, side, status,
        qty_total, qty_open,
        avg_price, entry_price, ltp,
        settlement, product_type, exit_price, exit_time, pnl, duration_seconds, brokerage, created_at, updated_at
      )
      VALUES (
        v_order.user_id, v_order.symbol, v_pos.side, 'closed',
        v_order.qty, 0,
        v_pos.avg_price, v_pos.entry_price, v_order.ltp_at_entry,
        v_order.segment, v_pos.product_type, v_order.fill_price, now(), v_pnl,
        EXTRACT(EPOCH FROM (now() - v_pos.entry_time))::integer, v_closed_brokerage, now(), now()
      )
      RETURNING id INTO v_closed_pos_id;

      -- 3. Record PNL transaction for the closed portion
      v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
      INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
      VALUES (v_order.user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', v_closed_pos_id::text);

    END IF;

  ELSE
    -- ─── ENTRY ORDER LOGIC ───
    -- A. Calculate entry & exit brokerage upfront
    SELECT trading_mode INTO v_trading_mode
    FROM public.profiles
    WHERE id = v_order.user_id;

    IF v_trading_mode = 'scalper' THEN
      SELECT commission_type, commission_value INTO v_comm_type, v_comm_val
      FROM public.scalper_segment_settings
      WHERE user_id = v_order.user_id AND segment = v_order.segment AND side = v_order.side;
    ELSE
      SELECT commission_type, commission_value INTO v_comm_type, v_comm_val
      FROM public.segment_settings
      WHERE user_id = v_order.user_id AND segment = v_order.segment AND side = v_order.side;
    END IF;

    -- Defaults fallback
    IF v_comm_type IS NULL THEN
      v_comm_type := 'Per Crore';
      v_comm_val := CASE WHEN v_order.segment = 'FOREX' THEN 2000 WHEN v_order.segment = 'CRYPTO' THEN 1000 ELSE 4500 END;
    END IF;

    IF v_comm_type = 'Per Crore' THEN
      v_raw_brokerage := (v_order.qty * v_order.fill_price * v_comm_val) / 10000000;
    ELSIF v_comm_type = 'Per Lot' THEN
      v_raw_brokerage := COALESCE(v_order.lots, 0) * v_comm_val;
    ELSIF v_comm_type = 'Per Trade' THEN
      v_raw_brokerage := v_comm_val;
    ELSE
      v_raw_brokerage := (v_order.qty * v_order.fill_price * 0.001); -- 0.1% fallback
    END IF;

    v_brokerage := v_raw_brokerage * 2; -- Charge both entry & exit upfront

    -- B. Save brokerage to the order
    UPDATE public.orders
    SET brokerage = v_brokerage
    WHERE id = v_order.id;

    -- C. Debit user's balance immediately via transaction
    IF v_brokerage > 0 THEN
      INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
      VALUES (v_order.user_id, 'BROKERAGE_DEBIT', v_brokerage, 'APPROVED', 'BKG_' || v_order.id::text);
    END IF;

    -- D. Accumulate/create position
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
          brokerage = brokerage + v_brokerage,
          updated_at = now()
        WHERE id = v_pos.id;
      ELSE
        RAISE EXCEPTION 'Cannot open opposite position while existing position is active';
      END IF;
    ELSE
      -- Insert a brand new open position
      INSERT INTO public.positions (
        user_id, symbol, side, status,
        qty_total, qty_open,
        avg_price, entry_price, ltp,
        settlement, product_type, stop_loss, target, brokerage, created_at, updated_at
      )
      VALUES (
        v_order.user_id, v_order.symbol, v_order.side, 'open',
        v_order.qty, v_order.qty,
        v_order.fill_price, v_order.fill_price, v_order.ltp_at_entry,
        v_order.segment, v_order.product_type, v_order.stop_loss, v_order.target, v_brokerage, now(), now()
      );
    END IF;
  END IF;
END;
$$;
