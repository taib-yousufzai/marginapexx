-- ==============================================================================
-- MIGRATION: Liquidation, Margin Freezing & Settlement Records
-- Date: 2026-06-24
-- ==============================================================================
-- Changes:
--   1. Add locked_margin column to positions (frozen at trade entry)
--   2. Create settlement_records table for audit trail
--   3. Modify calculate_position_margin trigger to freeze locked_margin on INSERT
--   4. Add LIQUIDATION_DEBIT to transactions type constraint
-- ==============================================================================

-- ── 1. Add locked_margin column ─────────────────────────────────────────────
-- locked_margin is set ONCE at position entry and never recalculated.
-- margin_required continues to exist for backward compatibility / admin views.
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS locked_margin numeric NOT NULL DEFAULT 0;

-- Backfill: set locked_margin to current margin_required for all existing open positions
UPDATE public.positions
SET locked_margin = COALESCE(margin_required, 0)
WHERE status = 'open' AND locked_margin = 0 AND margin_required > 0;

-- ── 2. Create settlement_records table ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.settlement_records (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  settlement_amount   numeric     NOT NULL,
  liquidation_event   text        NOT NULL DEFAULT 'AUTO_LIQUIDATION',
  previous_balance    numeric     NOT NULL DEFAULT 0,
  final_loss          numeric     NOT NULL DEFAULT 0,
  positions_closed    integer     NOT NULL DEFAULT 0,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settlement_records_user_id_idx ON public.settlement_records(user_id);
CREATE INDEX IF NOT EXISTS settlement_records_created_at_idx ON public.settlement_records(created_at DESC);

ALTER TABLE public.settlement_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages all settlement_records"
  ON public.settlement_records FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 3. Update transactions type constraint ──────────────────────────────────
-- Add LIQUIDATION_DEBIT for tracking liquidation-specific balance impacts
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN (
    'DEPOSIT','WITHDRAWAL',
    'PNL_CREDIT','PNL_DEBIT',
    'BROKERAGE_DEBIT','BUFFER_FEE_DEBIT',
    'MARGIN_ADJ_CREDIT','MARGIN_ADJ_DEBIT',
    'LIQUIDATION_DEBIT'
  ));

-- ── 4. Modify calculate_position_margin trigger ─────────────────────────────
-- Key change: locked_margin is set on INSERT only, never updated afterward.
-- margin_required continues to be recalculated dynamically for backward compat.
CREATE OR REPLACE FUNCTION public.calculate_position_margin()
RETURNS trigger AS $$
DECLARE
  v_leverage numeric;
  v_parent_id uuid;
  v_computed_margin numeric;
BEGIN
  -- If position is closed or qty_open is 0, margin required is 0
  IF NEW.status = 'closed' OR NEW.qty_open = 0 THEN
    NEW.margin_required := 0;
    -- Do NOT reset locked_margin — it preserves the historical entry margin
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

    -- 4. Calculate margin
    v_computed_margin := (NEW.qty_open * NEW.entry_price) / v_leverage;
    
    -- margin_required: always recalculated (dynamic, for backward compat)
    NEW.margin_required := v_computed_margin;
    
    -- locked_margin: ONLY set on INSERT (frozen at entry time)
    -- On UPDATE, locked_margin retains its original value
    IF TG_OP = 'INSERT' THEN
      NEW.locked_margin := v_computed_margin;
    END IF;
    -- If TG_OP = 'UPDATE', locked_margin is NOT modified — it stays frozen.
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger (same events as before)
DROP TRIGGER IF EXISTS positions_calculate_margin ON public.positions;

CREATE TRIGGER positions_calculate_margin
  BEFORE INSERT OR UPDATE OF status, qty_open, entry_price, product_type, settlement, side ON public.positions
  FOR EACH ROW EXECUTE PROCEDURE public.calculate_position_margin();

-- ── 5. Update sync_profile_balance to handle LIQUIDATION_DEBIT ──────────────
-- LIQUIDATION_DEBIT subtracts from balance (same as other debits)
-- The existing logic already handles this because the CASE statement 
-- treats anything not in ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT') as a debit.
-- No changes needed to sync_profile_balance — it already works correctly.
