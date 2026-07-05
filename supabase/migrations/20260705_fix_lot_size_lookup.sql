-- ==============================================================================
-- MIGRATION: Fix lot size lookup in process_executed_position
-- Date: 2026-07-05
-- ==============================================================================
-- 1. Add lot_size column to instruments (populated by sync-instruments cron)
-- 2. Update process_executed_position to read lot_size from instruments table
--    Priority: instruments.lot_size → script_settings.lot_size → hardcoded fallback
--    Hardcoded fallbacks updated to current NSE values (Jul 2026).
-- ==============================================================================

-- Step 1: Add lot_size to instruments table
ALTER TABLE public.instruments
  ADD COLUMN IF NOT EXISTS lot_size integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_instruments_name_lot
  ON public.instruments (name) WHERE lot_size > 0;

-- Step 2: Replace process_executed_position with updated lot size lookup
-- This is a CREATE OR REPLACE so it's safe to re-run.

CREATE OR REPLACE FUNCTION public.process_executed_position(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order                  record;
  v_pos                    record;
  v_comm_type              text;
  v_comm_val               numeric;
  v_carry_comm_type        text;
  v_carry_comm_val         numeric;
  v_gtt_comm_type          text;
  v_gtt_comm_val           numeric;
  v_raw_brokerage          numeric := 0;
  v_gtt_brokerage          numeric := 0;
  v_brokerage              numeric := 0;
  v_closed_entry_brokerage numeric := 0;
  v_pos_found              boolean;
  v_lot_size               numeric;
  v_lots                   numeric;
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

  -- ── Lot size resolution (priority: instruments → script_settings → fallback) ──
  -- 1. Try instruments table (populated by sync-instruments cron from Zerodha CSV)
  SELECT i.lot_size INTO v_lot_size
  FROM public.instruments i
  WHERE i.lot_size > 0
    AND (
      i.tradingsymbol = v_order.symbol
      OR (i.name IS NOT NULL AND v_order.symbol ILIKE i.name || '%')
    )
  ORDER BY length(i.tradingsymbol) DESC
  LIMIT 1;

  -- 2. Fall back to script_settings (admin overrides)
  IF v_lot_size IS NULL OR v_lot_size <= 0 THEN
    SELECT ss.lot_size INTO v_lot_size
    FROM public.script_settings ss
    WHERE v_order.symbol ILIKE '%' || ss.symbol || '%'
    ORDER BY length(ss.symbol) DESC
    LIMIT 1;
  END IF;

  -- 3. Hardcoded fallback — current NSE/MCX lot sizes as of Jul 2026
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

  -- Lots = from order if set, otherwise derived from qty / lot_size
  v_lots := COALESCE(NULLIF(v_order.lots, 0), v_order.qty / v_lot_size);

  -- ── Brokerage calculation ─────────────────────────────────────────────────
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

  -- ×2 for entry + exit legs
  v_brokerage := (v_raw_brokerage + v_gtt_brokerage) * 2;

  -- Save computed lots and brokerage back to the order row
  UPDATE public.orders
  SET brokerage = v_brokerage,
      lots      = v_lots
  WHERE id = p_order_id;

  -- ── Position upsert ───────────────────────────────────────────────────────
  SELECT id INTO v_pos_found
  FROM public.positions
  WHERE user_id = v_order.user_id
    AND symbol   = v_order.symbol
    AND side     = v_order.side
    AND status   = 'open'
  LIMIT 1;

  IF FOUND THEN
    -- Update existing open position
    UPDATE public.positions
    SET qty_open  = qty_open + v_order.qty,
        qty_total = qty_total + v_order.qty,
        ltp       = v_order.fill_price,
        brokerage = brokerage + v_brokerage,
        updated_at = now()
    WHERE user_id = v_order.user_id
      AND symbol   = v_order.symbol
      AND side     = v_order.side
      AND status   = 'open';
  ELSE
    -- Open new position
    INSERT INTO public.positions (
      user_id, symbol, side, status,
      qty_total, qty_open, avg_price, entry_price, ltp,
      settlement, product_type, brokerage, entry_time
    )
    VALUES (
      v_order.user_id, v_order.symbol, v_order.side, 'open',
      v_order.qty, v_order.qty, v_order.fill_price, v_order.fill_price, v_order.fill_price,
      v_order.segment, v_order.product_type, v_brokerage, now()
    );
  END IF;

  -- ── Brokerage debit transaction ───────────────────────────────────────────
  IF v_brokerage > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (v_order.user_id, 'BROKERAGE_DEBIT', v_brokerage, 'APPROVED', p_order_id::text);
  END IF;

END;
$$;
