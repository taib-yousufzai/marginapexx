-- ==============================================================================
-- MIGRATION: Fix close_position accounting & locked_margin reset on close
-- Date: 2026-06-24
-- ==============================================================================
--
-- Changes:
--   1. close_position() RPC: change brokerage transaction type from 'BROKERAGE'
--      to 'BROKERAGE_DEBIT' so all close paths (user, admin, auto-liquidation,
--      SL/TP/EOD) produce a consistent transaction type that:
--        a) is handled correctly by sync_profile_balance (already debits on all
--           non-DEPOSIT/PNL_CREDIT/MARGIN_ADJ_CREDIT types, so behaviour is
--           unchanged — this is a naming consistency fix)
--        b) is found by the admin PATCH brokerage-sync query (which filters on
--           type = 'BROKERAGE_DEBIT')
--
--   2. calculate_position_margin trigger: reset locked_margin = 0 when a
--      position is closed (status = 'closed' or qty_open = 0).
--      Previously, locked_margin was preserved forever.  This caused the
--      account-level liquidation / free-margin formulas to keep counting
--      closed positions' locked margin, producing an artificially low
--      free-margin reading.
--
-- ==============================================================================

-- ── 1. Update close_position() RPC ──────────────────────────────────────────

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
  --    The calculate_position_margin trigger will fire and reset
  --    both margin_required and locked_margin to 0 on this UPDATE.
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
  --    Use BROKERAGE_DEBIT (consistent with process_executed_position and
  --    admin PATCH sync logic — was incorrectly 'BROKERAGE' before this fix)
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
    CASE
      WHEN p_closed_by = 'AUTO_SQOFF'       THEN 'AUTO_SQUARE_OFF'
      WHEN p_closed_by = 'AUTO_LIQUIDATION' THEN 'AUTO_SQUARE_OFF'
      WHEN p_closed_by = 'ADMIN'            THEN 'ADMIN_SQUARE_OFF'
      WHEN p_closed_by = 'ADMIN_SQOFF_ALL'  THEN 'ADMIN_SQUARE_OFF'
      ELSE 'ORDER_EXECUTION'
    END,
    p_user_id, p_user_id,
    v_pos.symbol, v_pos.qty_open, p_exit_price,
    p_closed_by
  );

  RETURN v_pnl;
END;
$$;


-- ── 2. Update calculate_position_margin to reset locked_margin on close ──────
--
-- Previously: locked_margin was only set on INSERT and never changed.
--             After a position was closed, locked_margin remained > 0,
--             causing the liquidation / free-margin engine to count closed
--             positions against the user's available capital.
--
-- Now: locked_margin is set to 0 when status = 'closed' OR qty_open = 0,
--      matching the same condition that zeros out margin_required.

CREATE OR REPLACE FUNCTION public.calculate_position_margin()
RETURNS trigger AS $$
DECLARE
  v_leverage numeric;
  v_parent_id uuid;
  v_computed_margin numeric;
BEGIN
  -- If position is closed or qty_open is 0, zero out ALL margin columns
  IF NEW.status = 'closed' OR NEW.qty_open = 0 THEN
    NEW.margin_required := 0;
    -- Also reset locked_margin so closed positions no longer count
    -- against free-margin calculations in the risk/liquidation engine.
    NEW.locked_margin := 0;
    RETURN NEW;
  END IF;

  -- 1. Try to query the user's specific segment settings
  SELECT
    CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END INTO v_leverage
  FROM public.segment_settings
  WHERE user_id = NEW.user_id AND segment = NEW.settlement AND side = NEW.side;

  -- 2. Fallback to parent broker's settings if not found
  IF v_leverage IS NULL THEN
    SELECT parent_id::uuid INTO v_parent_id FROM public.profiles WHERE id = NEW.user_id;
    IF v_parent_id IS NOT NULL THEN
      SELECT
        CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END INTO v_leverage
      FROM public.segment_settings
      WHERE user_id = v_parent_id AND segment = NEW.settlement AND side = NEW.side;
    END IF;
  END IF;

  -- 3. Fallback to system defaults if still not found
  IF v_leverage IS NULL OR v_leverage <= 0 THEN
    IF NEW.settlement LIKE '%FOREX%' OR NEW.settlement LIKE '%CDS%' THEN
      v_leverage := CASE WHEN NEW.product_type = 'CARRY' THEN 10 ELSE 100 END;
    ELSIF NEW.settlement LIKE '%CRYPTO%' THEN
      v_leverage := CASE WHEN NEW.product_type = 'CARRY' THEN 1 ELSE 10 END;
    ELSE
      v_leverage := CASE WHEN NEW.product_type = 'CARRY' THEN 5 ELSE 50 END;
    END IF;
  END IF;

  -- 4. Calculate margin
  v_computed_margin := (NEW.qty_open * NEW.entry_price) / v_leverage;

  -- margin_required: always recalculated (dynamic, for backward compat)
  NEW.margin_required := v_computed_margin;

  -- locked_margin: ONLY set on INSERT (frozen at entry time).
  -- On UPDATE of an open position, locked_margin retains its original value.
  IF TG_OP = 'INSERT' THEN
    NEW.locked_margin := v_computed_margin;
  END IF;
  -- If TG_OP = 'UPDATE' and position is still open, locked_margin stays unchanged.

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger (unchanged events)
DROP TRIGGER IF EXISTS positions_calculate_margin ON public.positions;

CREATE TRIGGER positions_calculate_margin
  BEFORE INSERT OR UPDATE OF status, qty_open, entry_price, product_type, settlement, side ON public.positions
  FOR EACH ROW EXECUTE PROCEDURE public.calculate_position_margin();

-- ── 3. Backfill: zero locked_margin for all already-closed positions ─────────
UPDATE public.positions
SET locked_margin = 0
WHERE status = 'closed' AND locked_margin > 0;

-- ── 4. Ensure ADMIN_SQUARE_OFF and ADMIN_CANCEL_ALL are valid act_log types ──
-- act_logs.type is a free-text column (no constraint), so no ALTER needed.
-- This comment is here for documentation purposes.
-- Valid new type values introduced by this fix:
--   'ADMIN_SQUARE_OFF'  — single position admin sqoff
--   'ADMIN_SQUARE_OFF_ALL' — (written inline in route; acts as subtype of AUTO_SQUARE_OFF)
--   'ADMIN_CANCEL_ALL'  — cancel all pending orders

-- Done.
