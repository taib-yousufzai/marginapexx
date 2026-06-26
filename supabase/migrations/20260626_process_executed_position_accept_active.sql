-- ==============================================================================
-- MIGRATION: process_executed_position accepts status = 'active'
-- Date: 2026-06-26
-- ==============================================================================
-- Just like close_position was updated, process_executed_position also needs to
-- accept positions with status 'active' when processing exit orders.
-- Otherwise, clicking the "Exit" button (which places an exit order and calls this)
-- results in "No active position exists to exit" because the position is 'active', not 'open'.
-- ==============================================================================

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
  -- FIXED: Check for both 'open' and 'active' status
  SELECT * INTO v_pos
  FROM public.positions
  WHERE user_id = v_order.user_id
    AND symbol = v_order.symbol
    AND product_type = v_order.product_type
    AND status IN ('open', 'active')
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
    -- wait... what if it's an exit order and no position exists?
    IF v_order.is_exit THEN
        RAISE EXCEPTION 'No active position exists to exit';
    END IF;

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
