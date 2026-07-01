-- ==============================================================================
-- MIGRATION: Immediate Margin Deduction
-- Date: 2026-07-01
-- ==============================================================================

-- 1. Add MARGIN_DEBIT to transactions type check
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check 
  CHECK (type IN (
    'DEPOSIT','WITHDRAWAL',
    'PNL_CREDIT','PNL_DEBIT',
    'BROKERAGE_DEBIT','BUFFER_FEE_DEBIT',
    'MARGIN_ADJ_CREDIT','MARGIN_ADJ_DEBIT',
    'LIQUIDATION_DEBIT',
    'MARGIN_DEBIT'
  ));

-- 2. Update sync_profile_balance to handle MARGIN_CREDIT as a positive change
CREATE OR REPLACE FUNCTION public.sync_profile_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id       uuid;
  v_change        numeric := 0;
  v_current_bal   numeric;
  v_new_bal       numeric;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'APPROVED') THEN
    v_user_id := NEW.user_id;
    v_change  := CASE
                   WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT', 'MARGIN_CREDIT')
                   THEN  NEW.amount
                   ELSE -NEW.amount
                 END;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_user_id := NEW.user_id;
    IF OLD.status <> 'APPROVED' AND NEW.status = 'APPROVED' THEN
      v_change := CASE
                    WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT', 'MARGIN_CREDIT')
                    THEN  NEW.amount
                    ELSE -NEW.amount
                  END;
    ELSIF OLD.status = 'APPROVED' AND NEW.status <> 'APPROVED' THEN
      v_change := -( CASE
                       WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT', 'MARGIN_CREDIT')
                       THEN  OLD.amount
                       ELSE -OLD.amount
                     END );
    END IF;

  ELSIF (TG_OP = 'DELETE' AND OLD.status = 'APPROVED') THEN
    v_user_id := OLD.user_id;
    v_change  := -( CASE
                      WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT', 'MARGIN_CREDIT')
                      THEN  OLD.amount
                      ELSE -OLD.amount
                    END );
  END IF;

  IF v_user_id IS NULL OR v_change = 0 THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(balance, 0)
    INTO v_current_bal
    FROM public.profiles
   WHERE id = v_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_new_bal := v_current_bal + v_change;

  IF v_new_bal >= 0 THEN
    UPDATE public.profiles
       SET balance    = v_new_bal,
           updated_at = now()
     WHERE id = v_user_id;
  ELSE
    UPDATE public.profiles
       SET balance          = 0,
           settlement_amount = COALESCE(settlement_amount, 0) + v_new_bal,
           updated_at        = now()
     WHERE id = v_user_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Modify calculate_position_margin to deduct margin immediately via a transaction
-- This must be an AFTER trigger if we want to insert into transactions with the new position ID.
-- However, we only have BEFORE trigger right now. We will create an AFTER INSERT trigger for the MARGIN_DEBIT.
CREATE OR REPLACE FUNCTION public.position_insert_margin_debit()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.locked_margin > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (NEW.user_id, 'MARGIN_DEBIT', NEW.locked_margin, 'APPROVED', 'MRG_' || NEW.id::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS positions_margin_debit ON public.positions;
CREATE TRIGGER positions_margin_debit
  AFTER INSERT ON public.positions
  FOR EACH ROW EXECUTE PROCEDURE public.position_insert_margin_debit();

-- 4. Modify close_position to credit proportional margin back
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
  v_closed_margin numeric;
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

  -- Compute proportional margin to return
  -- (If full exit, return full locked margin. If partial, return proportional).
  v_closed_margin := (v_pos.locked_margin * v_pos.qty_open) / v_pos.qty_total;

  -- Update position row
  UPDATE public.positions
  SET
    status = 'closed',
    exit_price = p_exit_price,
    exit_time = now(),
    pnl = v_pnl,
    duration_seconds = v_duration_sec,
    updated_at = now(),
    -- The caller passes p_brokerage for exit, but we don't charge it for now if they paid 2x entry. 
    -- We just append it to track if needed.
    exit_brokerage = exit_brokerage + p_brokerage,
    brokerage = brokerage + p_brokerage,
    locked_margin = 0 -- unlock margin
  WHERE id = p_position_id;

  -- Record PNL transaction
  v_pnl_type := CASE WHEN v_pnl >= 0 THEN 'PNL_CREDIT' ELSE 'PNL_DEBIT' END;
  
  INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
  VALUES (p_user_id, v_pnl_type, ABS(v_pnl), 'APPROVED', p_position_id::text);

  -- Record Exit Brokerage transaction (if any, typically 0 since charged upfront)
  IF p_brokerage > 0 THEN
    INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
    VALUES (p_user_id, 'BROKERAGE_DEBIT', p_brokerage, 'APPROVED', 'BKG_EXIT_' || p_position_id::text);
  END IF;

  RETURN v_pnl;
END;
$$;

-- 5. Fix calculate_position_margin to charge additional margin on Add More
CREATE OR REPLACE FUNCTION public.calculate_position_margin()
RETURNS trigger AS $$
DECLARE
  v_leverage      numeric;
  v_leverage_type text;
  v_parent_id     uuid;
  v_trading_mode  text;
  v_lot_size      numeric := 1;
  v_lots          numeric;
  v_computed_margin numeric;
  v_settings_table  text;
BEGIN
  IF NEW.status = 'closed' OR NEW.qty_open = 0 THEN
    NEW.margin_required := 0;
    RETURN NEW;
  END IF;

  SELECT trading_mode INTO v_trading_mode FROM public.profiles WHERE id = NEW.user_id;
  IF v_trading_mode = 'scalper' THEN v_settings_table := 'scalper_segment_settings'; ELSE v_settings_table := 'segment_settings'; END IF;

  IF v_settings_table = 'scalper_segment_settings' THEN
    SELECT CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END, CASE WHEN NEW.product_type = 'CARRY' THEN holding_type ELSE intraday_type END INTO v_leverage, v_leverage_type FROM public.scalper_segment_settings WHERE user_id = NEW.user_id AND segment = NEW.settlement AND side = NEW.side;
  ELSE
    SELECT CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END, CASE WHEN NEW.product_type = 'CARRY' THEN holding_type ELSE intraday_type END INTO v_leverage, v_leverage_type FROM public.segment_settings WHERE user_id = NEW.user_id AND segment = NEW.settlement AND side = NEW.side;
  END IF;

  IF v_leverage IS NULL THEN
    SELECT parent_id::uuid INTO v_parent_id FROM public.profiles WHERE id = NEW.user_id;
    IF v_parent_id IS NOT NULL THEN
      IF v_settings_table = 'scalper_segment_settings' THEN
        SELECT CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END, CASE WHEN NEW.product_type = 'CARRY' THEN holding_type ELSE intraday_type END INTO v_leverage, v_leverage_type FROM public.scalper_segment_settings WHERE user_id = v_parent_id AND segment = NEW.settlement AND side = NEW.side;
      ELSE
        SELECT CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END, CASE WHEN NEW.product_type = 'CARRY' THEN holding_type ELSE intraday_type END INTO v_leverage, v_leverage_type FROM public.segment_settings WHERE user_id = v_parent_id AND segment = NEW.settlement AND side = NEW.side;
      END IF;
    END IF;
  END IF;

  IF v_leverage IS NULL OR v_leverage <= 0 THEN
    v_leverage_type := 'Multiplier';
    IF NEW.settlement LIKE '%FOREX%' OR NEW.settlement LIKE '%CDS%' THEN v_leverage := CASE WHEN NEW.product_type = 'CARRY' THEN 10 ELSE 100 END; ELSIF NEW.settlement LIKE '%CRYPTO%' THEN v_leverage := CASE WHEN NEW.product_type = 'CARRY' THEN 1 ELSE 10 END; ELSE v_leverage := CASE WHEN NEW.product_type = 'CARRY' THEN 5 ELSE 50 END; END IF;
  END IF;

  IF v_leverage_type IS NULL OR v_leverage_type = '' THEN v_leverage_type := 'Multiplier'; END IF;

  IF v_leverage_type = '%' THEN
    v_computed_margin := (NEW.qty_open * NEW.entry_price) * (v_leverage / 100.0);
  ELSIF v_leverage_type = 'Fixed' THEN
    SELECT lot_size INTO v_lot_size FROM public.script_settings WHERE NEW.symbol LIKE '%' || symbol || '%' ORDER BY length(symbol) DESC LIMIT 1;
    IF v_lot_size IS NULL OR v_lot_size <= 0 THEN
      IF NEW.symbol LIKE '%BANKNIFTY%' OR NEW.symbol LIKE '%BANKEX%' THEN v_lot_size := 15; ELSIF NEW.symbol LIKE '%FINNIFTY%' THEN v_lot_size := 25; ELSIF NEW.symbol LIKE '%MIDCP%' OR NEW.symbol LIKE '%MIDCAP%' THEN v_lot_size := 50; ELSIF NEW.symbol LIKE '%SENSEX%' THEN v_lot_size := 10; ELSIF NEW.symbol LIKE '%NIFTY%' THEN v_lot_size := 25; ELSIF NEW.symbol LIKE '%GOLDM%' THEN v_lot_size := 10; ELSIF NEW.symbol LIKE '%GOLD%' THEN v_lot_size := 100; ELSIF NEW.symbol LIKE '%SILVERM%' THEN v_lot_size := 5; ELSIF NEW.symbol LIKE '%SILVER%' THEN v_lot_size := 30; ELSIF NEW.symbol LIKE '%CRUDEOILM%' THEN v_lot_size := 10; ELSIF NEW.symbol LIKE '%CRUDEOIL%' THEN v_lot_size := 100; ELSIF NEW.symbol LIKE '%NATGASMINI%' THEN v_lot_size := 250; ELSIF NEW.symbol LIKE '%NATURALGAS%' THEN v_lot_size := 1250; ELSE v_lot_size := 1; END IF;
    END IF;
    v_lots := NEW.qty_open / v_lot_size;
    v_computed_margin := v_lots * v_leverage;
  ELSE
    v_computed_margin := (NEW.qty_open * NEW.entry_price) / v_leverage;
  END IF;

  NEW.margin_required := v_computed_margin;

  IF TG_OP = 'INSERT' THEN
    NEW.locked_margin := v_computed_margin;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.qty_open > OLD.qty_open THEN
      DECLARE
        v_margin_diff numeric;
      BEGIN
        v_margin_diff := v_computed_margin - OLD.locked_margin;
        IF v_margin_diff > 0 THEN
          INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
          VALUES (NEW.user_id, 'MARGIN_DEBIT', v_margin_diff, 'APPROVED', 'MRG_ADD_' || NEW.id::text);
          NEW.locked_margin := v_computed_margin;
        END IF;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
