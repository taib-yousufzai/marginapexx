-- Add trading_mode and mode_locked_until columns to public.profiles table
alter table public.profiles
  add column if not exists trading_mode text not null default 'normal' check (trading_mode in ('normal', 'scalper')),
  add column if not exists mode_locked_until timestamptz default null;

-- Re-create calculate_position_margin to dynamically query settings from
-- the correct table (scalper_segment_settings vs segment_settings) based on active mode
CREATE OR REPLACE FUNCTION public.calculate_position_margin()
RETURNS trigger AS $$
DECLARE
  v_leverage numeric;
  v_parent_id uuid;
  v_trading_mode text;
BEGIN
  -- If position is closed or qty_open is 0, margin required is 0
  IF NEW.status = 'closed' OR NEW.qty_open = 0 THEN
    NEW.margin_required := 0;
  ELSE
    -- 1. Fetch user's active trading mode (default to normal if not found)
    SELECT trading_mode INTO v_trading_mode FROM public.profiles WHERE id = NEW.user_id;
    IF v_trading_mode IS NULL THEN
      v_trading_mode := 'normal';
    END IF;

    -- 2. Try to query the user's specific segment settings
    IF v_trading_mode = 'scalper' THEN
      SELECT 
        CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END INTO v_leverage
      FROM public.scalper_segment_settings
      WHERE user_id = NEW.user_id AND segment = NEW.settlement AND side = NEW.side;
    ELSE
      SELECT 
        CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END INTO v_leverage
      FROM public.segment_settings
      WHERE user_id = NEW.user_id AND segment = NEW.settlement AND side = NEW.side;
    END IF;

    -- 3. Fallback to parent broker's settings if not found
    IF v_leverage IS NULL THEN
      SELECT parent_id::uuid INTO v_parent_id FROM public.profiles WHERE id = NEW.user_id;
      IF v_parent_id IS NOT NULL THEN
        -- Query parent settings based on user's active mode
        IF v_trading_mode = 'scalper' THEN
          SELECT 
            CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END INTO v_leverage
          FROM public.scalper_segment_settings
          WHERE user_id = v_parent_id AND segment = NEW.settlement AND side = NEW.side;
        ELSE
          SELECT 
            CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END INTO v_leverage
          FROM public.segment_settings
          WHERE user_id = v_parent_id AND segment = NEW.settlement AND side = NEW.side;
        END IF;
      END IF;
    END IF;

    -- 4. Fallback to system defaults if still not found
    IF v_leverage IS NULL OR v_leverage <= 0 THEN
      IF NEW.settlement LIKE '%FOREX%' OR NEW.settlement LIKE '%CDS%' THEN
        v_leverage := CASE WHEN NEW.product_type = 'CARRY' THEN 10 ELSE 100 END;
      ELSIF NEW.settlement LIKE '%CRYPTO%' THEN
        v_leverage := CASE WHEN NEW.product_type = 'CARRY' THEN 1 ELSE 10 END;
      ELSE
        v_leverage := CASE WHEN NEW.product_type = 'CARRY' THEN 5 ELSE 50 END;
      END IF;
    END IF;

    -- 5. Calculate margin_required
    NEW.margin_required := (NEW.qty_open * NEW.entry_price) / v_leverage;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
