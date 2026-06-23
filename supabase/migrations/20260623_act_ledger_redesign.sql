-- ------------------------------------------
-- FILE: 20260623_act_ledger_redesign.sql
-- ACT Ledger Redesign: new columns + edit_act_log RPC
-- ------------------------------------------

-- 1. Extend act_logs with 6 trade detail columns + 3 edit audit columns
ALTER TABLE public.act_logs
  ADD COLUMN IF NOT EXISTS original_price   NUMERIC,
  ADD COLUMN IF NOT EXISTS margin_used      NUMERIC,
  ADD COLUMN IF NOT EXISTS buffer           NUMERIC,
  ADD COLUMN IF NOT EXISTS brokerage_value  NUMERIC,
  ADD COLUMN IF NOT EXISTS brokerage_mode   TEXT CHECK (brokerage_mode IN ('per_crore', 'per_lot')),
  ADD COLUMN IF NOT EXISTS trade_mode       TEXT CHECK (trade_mode IN ('carry', 'intraday')),
  ADD COLUMN IF NOT EXISTS edited_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edit_remark      TEXT;

-- 2. Extend pay_requests with reference_id for reconciliation linking
ALTER TABLE public.pay_requests
  ADD COLUMN IF NOT EXISTS reference_id UUID NULL;

-- 3. Preserve all existing types (from 20260622_account_templates.sql) — no new types added here
ALTER TABLE public.act_logs DROP CONSTRAINT IF EXISTS act_logs_type_check;
ALTER TABLE public.act_logs ADD CONSTRAINT act_logs_type_check
  CHECK (type IN (
    'ORDER_EXECUTION',
    'AUTO_SQUARE_OFF',
    'ORDER_CANCEL',
    'LOGIN',
    'LOGOUT',
    'ORDER_PLACED',
    'PAY_APPROVE',
    'PAY_REJECT',
    'PAY_DELETE',
    'POSITION_EDIT',
    'POSITION_DELETE',
    'ADMIN_ACTION',
    'TEMPLATE_APPLY'
  ));

-- 4. edit_act_log RPC — atomic update + optional reconciliation insert
CREATE OR REPLACE FUNCTION public.edit_act_log(
  p_id             UUID,
  p_admin_id       UUID,
  p_symbol         TEXT,
  p_qty            NUMERIC,
  p_price          NUMERIC,
  p_edit_remark    TEXT,
  p_original_price NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_log        act_logs%ROWTYPE;
  v_price_diff NUMERIC;
  v_recon_id   UUID;
  v_recon_type TEXT;
  v_recon_amt  NUMERIC;
BEGIN
  -- Lock the row for update; return 404 if not found
  SELECT * INTO v_log
  FROM public.act_logs
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Not found', 'code', 404);
  END IF;

  -- Require a target user for reconciliation to be possible
  IF v_log.target_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Target user not found', 'code', 422);
  END IF;

  -- Update the log entry with new values and audit fields
  UPDATE public.act_logs
  SET
    symbol      = p_symbol,
    qty         = p_qty,
    price       = p_price,
    edited_by   = p_admin_id,
    edited_at   = now(),
    edit_remark = p_edit_remark
  WHERE id = p_id;

  -- Compute price difference against the original execution price
  v_price_diff := p_price - p_original_price;

  IF v_price_diff <> 0 THEN
    v_recon_id   := gen_random_uuid();
    v_recon_type := CASE WHEN v_price_diff > 0 THEN 'WITHDRAWAL' ELSE 'DEPOSIT' END;
    v_recon_amt  := abs(v_price_diff) * p_qty;

    INSERT INTO public.pay_requests (id, user_id, type, amount, status, reference_id)
    VALUES (v_recon_id, v_log.target_user_id, v_recon_type, v_recon_amt, 'PENDING', p_id);

    RETURN jsonb_build_object('code', 200, 'reconciliation_id', v_recon_id);
  END IF;

  RETURN jsonb_build_object('code', 200);
END;
$$;
