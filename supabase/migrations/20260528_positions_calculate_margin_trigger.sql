-- Database trigger for real-time margin_required calculation on positions table.
-- Automatically computes NEW.margin_required on insert and update based on leverage.

CREATE OR REPLACE FUNCTION public.calculate_position_margin()
RETURNS trigger AS $$
DECLARE
  v_leverage numeric;
  v_parent_id uuid;
BEGIN
  -- If position is closed or qty_open is 0, margin required is 0
  IF NEW.status = 'closed' OR NEW.qty_open = 0 THEN
    NEW.margin_required := 0;
  ELSE
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

    -- 4. Calculate margin_required
    NEW.margin_required := (NEW.qty_open * NEW.entry_price) / v_leverage;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger to avoid conflicts
DROP TRIGGER IF EXISTS positions_calculate_margin ON public.positions;

CREATE TRIGGER positions_calculate_margin
  BEFORE INSERT OR UPDATE OF status, qty_open, entry_price, product_type, settlement, side ON public.positions
  FOR EACH ROW EXECUTE PROCEDURE public.calculate_position_margin();
