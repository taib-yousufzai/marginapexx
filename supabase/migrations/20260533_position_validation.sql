-- ─── 20260533_position_validation.sql ───
-- Add is_exit to orders
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS is_exit boolean NOT NULL DEFAULT false;

-- Drop and recreate place_order to support p_is_exit
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
  p_is_exit        boolean DEFAULT FALSE
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

  -- 2. Audit log
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
REVOKE ALL ON FUNCTION public.place_order(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_order(uuid, text, text, text, text, text, text, numeric, numeric, numeric, numeric, text, numeric, numeric, numeric, boolean) TO service_role;


-- ─── Helper function to parse option symbol ───
CREATE OR REPLACE FUNCTION public.parse_option_symbol(p_symbol text, OUT o_underlying text, OUT o_strike numeric, OUT o_option_type text)
AS $$
DECLARE
  v_clean text;
  v_match text[];
BEGIN
  -- Strip exchange prefix if present, e.g. "NFO:NIFTY2652826500CE" -> "NIFTY2652826500CE"
  IF position(':' in p_symbol) > 0 THEN
    v_clean := substring(p_symbol from position(':' in p_symbol) + 1);
  ELSE
    v_clean := p_symbol;
  END IF;
  v_clean := upper(trim(v_clean));
  
  -- Regex: ^([A-Z]+)(\d{2}[A-Z0-9]{3})(\d+(?:\.\d+)?)(CE|PE)$
  v_match := regexp_matches(v_clean, '^([A-Z]+)(\d{2}[A-Z0-9]{3})(\d+(?:\.\d+)?)(CE|PE)$');
  
  IF v_match IS NOT NULL AND array_length(v_match, 1) = 4 THEN
    o_underlying := v_match[1];
    o_strike := v_match[3]::numeric;
    o_option_type := v_match[4];
  ELSE
    o_underlying := NULL;
    o_strike := NULL;
    o_option_type := NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  o_underlying := NULL;
  o_strike := NULL;
  o_option_type := NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ─── Trigger Function to Handle Order Execution ───
CREATE OR REPLACE FUNCTION public.handle_order_execution()
RETURNS TRIGGER AS $$
DECLARE
  v_opt_underlying text;
  v_opt_strike numeric;
  v_opt_type text;
  v_is_option boolean := false;
  
  v_remaining_qty numeric;
  v_pos RECORD;
  v_closed_qty numeric;
  v_pnl numeric;
  v_pnl_type text;
  v_new_closed_id uuid;
BEGIN
  -- Only run for status = 'EXECUTED'
  IF NEW.status != 'EXECUTED' THEN
    RETURN NEW;
  END IF;

  -- Try parsing option details
  SELECT o_underlying, o_strike, o_option_type 
  INTO v_opt_underlying, v_opt_strike, v_opt_type
  FROM public.parse_option_symbol(NEW.symbol);

  IF v_opt_underlying IS NOT NULL AND v_opt_strike IS NOT NULL AND v_opt_type IS NOT NULL THEN
    v_is_option := true;
  END IF;

  IF v_is_option AND NEW.is_exit THEN
    v_remaining_qty := NEW.qty;
    
    -- Loop through open positions on the opposite side, matching by option key!
    FOR v_pos IN 
      SELECT p.*, opt.o_underlying, opt.o_strike, opt.o_option_type
      FROM public.positions p
      CROSS JOIN LATERAL public.parse_option_symbol(p.symbol) opt
      WHERE p.user_id = NEW.user_id
        AND p.status = 'open'
        AND p.qty_open > 0
        AND p.side = CASE WHEN NEW.side = 'BUY' THEN 'SELL' ELSE 'BUY' END
        AND opt.o_underlying = v_opt_underlying
        AND opt.o_strike = v_opt_strike
        AND opt.o_option_type = v_opt_type
      ORDER BY p.entry_time ASC
      FOR UPDATE
    LOOP
      IF v_remaining_qty <= 0 THEN
        EXIT;
      END IF;

      IF v_pos.qty_open > v_remaining_qty THEN
        -- PARTIAL EXIT of this position row
        v_closed_qty := v_remaining_qty;

        -- 1. Reduce the original position's qty_open and qty_total
        UPDATE public.positions
        SET 
          qty_open = qty_open - v_closed_qty,
          qty_total = qty_total - v_closed_qty,
          updated_at = now()
        WHERE id = v_pos.id;

        -- Calculate realized P&L for this closed part
        IF v_pos.side = 'BUY' THEN
          v_pnl := (NEW.fill_price - v_pos.entry_price) * v_closed_qty;
        ELSE
          v_pnl := (v_pos.entry_price - NEW.fill_price) * v_closed_qty;
        END IF;

        -- 2. Insert a new closed position representing the exited part
        INSERT INTO public.positions (
          user_id, symbol, side, status,
          qty_total, qty_open,
          avg_price, entry_price, exit_price, ltp,
          pnl, settlement, product_type, stop_loss, target,
          entry_time, exit_time, duration_seconds
        )
        VALUES (
          NEW.user_id, v_pos.symbol, v_pos.side, 'closed',
          v_closed_qty, 0,
          v_pos.entry_price, v_pos.entry_price, NEW.fill_price, NEW.ltp_at_entry,
          v_pnl, v_pos.settlement, v_pos.product_type, v_pos.stop_loss, v_pos.target,
          v_pos.entry_time, now(), EXTRACT(EPOCH FROM (now() - v_pos.entry_time))::integer
        )
        RETURNING id INTO v_new_closed_id;

        -- 3. Insert transaction
        v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
        INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
        VALUES (NEW.user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', v_new_closed_id::text);

        v_remaining_qty := 0;
      ELSE
        -- FULL EXIT of this position row
        v_closed_qty := v_pos.qty_open;

        -- Calculate P&L
        IF v_pos.side = 'BUY' THEN
          v_pnl := (NEW.fill_price - v_pos.entry_price) * v_closed_qty;
        ELSE
          v_pnl := (v_pos.entry_price - NEW.fill_price) * v_closed_qty;
        END IF;

        -- 1. Close the position
        UPDATE public.positions
        SET
          status = 'closed',
          qty_open = 0,
          exit_price = NEW.fill_price,
          exit_time = now(),
          pnl = v_pnl,
          ltp = NEW.ltp_at_entry,
          duration_seconds = EXTRACT(EPOCH FROM (now() - entry_time))::integer,
          updated_at = now()
        WHERE id = v_pos.id;

        -- 2. Insert transaction
        v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
        INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
        VALUES (NEW.user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', v_pos.id::text);

        v_remaining_qty := v_remaining_qty - v_closed_qty;
      END IF;
    END LOOP;

  ELSE
    -- NEW POSITION / ADD TO POSITION (or non-option, or normal entry)
    INSERT INTO public.positions (
      user_id, symbol, side, status,
      qty_total, qty_open,
      avg_price, entry_price, ltp,
      settlement, product_type, stop_loss, target
    )
    VALUES (
      NEW.user_id, NEW.symbol, NEW.side, 'open',
      NEW.qty, NEW.qty,
      NEW.fill_price, NEW.fill_price, NEW.ltp_at_entry,
      NEW.segment, NEW.product_type, NEW.stop_loss, NEW.target
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ─── Triggers ───
DROP TRIGGER IF EXISTS trg_order_executed_insert ON public.orders;
CREATE TRIGGER trg_order_executed_insert
  AFTER INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'EXECUTED')
  EXECUTE FUNCTION public.handle_order_execution();

DROP TRIGGER IF EXISTS trg_order_executed_update ON public.orders;
CREATE TRIGGER trg_order_executed_update
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'EXECUTED' AND OLD.status != 'EXECUTED')
  EXECUTE FUNCTION public.handle_order_execution();
