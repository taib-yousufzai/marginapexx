-- ==============================================================================
-- MIGRATION: Preserve settlement_amount across deposits
-- Date: 2026-06-24
-- ==============================================================================
--
-- Problem (before this fix):
--   When a user's balance went negative after liquidation, the deficit was
--   stored as settlement_amount (a negative number, e.g. -200).
--   The trigger then computed:
--     v_new_val = balance + change + settlement_amount
--   On the next deposit the settlement_amount was included in v_new_val,
--   and because v_new_val ≥ 0 the trigger set settlement_amount = 0 —
--   effectively recovering the debt from the deposit automatically.
--
-- Example (old behaviour):
--   balance = 0, settlement_amount = -200
--   User deposits ₹300
--   v_new_val = 0 + 300 + (-200) = 100
--   → balance = 100, settlement_amount = 0   ← debt silently cleared!
--
-- Required behaviour:
--   settlement_amount is a permanent record of the liquidation debt.
--   It must NEVER be reduced by deposits, withdrawals, PnL, or any
--   automatic transaction.  It may only be adjusted by an explicit admin
--   action (direct UPDATE on profiles.settlement_amount).
--
--   balance = 0, settlement_amount = -200
--   User deposits ₹300
--   → balance = 300, settlement_amount = -200  ← debt stays, balance grows normally
--
-- Mechanics of the fix:
--   Remove settlement_amount from the v_new_val calculation entirely.
--   The trigger now only ever touches balance:
--     • If balance + change ≥ 0  → balance = balance + change
--     • If balance + change < 0  → balance = 0, settlement_amount += the shortfall
--       (This last case should be rare post-liquidation because the liquidation
--        engine already zeroed balance before storing the deficit, but we keep
--        it as a safety net for other debit types.)
--
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sync_profile_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id       uuid;
  v_change        numeric := 0;
  v_current_bal   numeric;
  v_new_bal       numeric;
  v_parent_id     uuid;
  v_commission    numeric;
BEGIN
  -- ── Determine the user and the signed change amount ──────────────────────
  IF (TG_OP = 'INSERT' AND NEW.status = 'APPROVED') THEN
    v_user_id := NEW.user_id;
    v_change  := CASE
                   WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT')
                   THEN  NEW.amount
                   ELSE -NEW.amount
                 END;

    -- Referral commission on deposits
    IF NEW.type = 'DEPOSIT' AND NEW.amount > 0 THEN
      SELECT parent_id INTO v_parent_id FROM public.profiles WHERE id = NEW.user_id;
      IF v_parent_id IS NOT NULL THEN
        v_commission := NEW.amount * 0.05;
        UPDATE public.profiles
           SET referral_balance = referral_balance + v_commission
         WHERE id = v_parent_id;
        INSERT INTO public.referral_earnings
          (referrer_id, referred_user_id, transaction_id, deposit_amount, commission_amount)
        VALUES
          (v_parent_id, NEW.user_id, NEW.id, NEW.amount, v_commission);
      END IF;
    END IF;

  ELSIF (TG_OP = 'UPDATE') THEN
    v_user_id := NEW.user_id;
    IF OLD.status <> 'APPROVED' AND NEW.status = 'APPROVED' THEN
      v_change := CASE
                    WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT')
                    THEN  NEW.amount
                    ELSE -NEW.amount
                  END;

      IF NEW.type = 'DEPOSIT' AND NEW.amount > 0 THEN
        SELECT parent_id INTO v_parent_id FROM public.profiles WHERE id = NEW.user_id;
        IF v_parent_id IS NOT NULL THEN
          v_commission := NEW.amount * 0.05;
          UPDATE public.profiles
             SET referral_balance = referral_balance + v_commission
           WHERE id = v_parent_id;
          INSERT INTO public.referral_earnings
            (referrer_id, referred_user_id, transaction_id, deposit_amount, commission_amount)
          VALUES
            (v_parent_id, NEW.user_id, NEW.id, NEW.amount, v_commission);
        END IF;
      END IF;

    ELSIF OLD.status = 'APPROVED' AND NEW.status <> 'APPROVED' THEN
      -- Reversal: undo a previously approved transaction
      v_change := -( CASE
                       WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT')
                       THEN  OLD.amount
                       ELSE -OLD.amount
                     END );
    END IF;

  ELSIF (TG_OP = 'DELETE' AND OLD.status = 'APPROVED') THEN
    v_user_id := OLD.user_id;
    v_change  := -( CASE
                      WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT')
                      THEN  OLD.amount
                      ELSE -OLD.amount
                    END );
  END IF;

  IF v_user_id IS NULL OR v_change = 0 THEN
    RETURN NULL;
  END IF;

  -- ── Apply the change to balance ONLY — never touch settlement_amount ─────
  --
  -- settlement_amount records the liquidation debt and must persist until an
  -- admin explicitly clears it.  Deposits, withdrawals, and PnL credits/debits
  -- all go straight to balance without affecting the debt column.
  --
  -- Safety net: if a debit somehow drives balance below zero (e.g. a large
  -- WITHDRAWAL approved after balance was already near zero), we cap balance
  -- at 0 and accumulate the additional shortfall into settlement_amount.
  -- This should not happen in normal flow because the frontend validates
  -- withdrawal amounts against available balance.

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
    -- Normal case: balance stays non-negative, settlement_amount untouched
    UPDATE public.profiles
       SET balance    = v_new_bal,
           updated_at = now()
     WHERE id = v_user_id;
  ELSE
    -- Balance went negative — floor at 0, push the shortfall into settlement_amount
    -- (settlement_amount is already negative; make it more negative)
    UPDATE public.profiles
       SET balance          = 0,
           settlement_amount = COALESCE(settlement_amount, 0) + v_new_bal,
           updated_at        = now()
     WHERE id = v_user_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- Optional admin helper: clear (forgive) a user's settlement debt.
-- Call this when an admin decides to waive the outstanding amount.
--
-- Usage:
--   SELECT admin_clear_settlement_debt('<user_uuid>');
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_clear_settlement_debt(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.profiles
     SET settlement_amount = 0,
         updated_at        = now()
   WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_clear_settlement_debt(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_clear_settlement_debt(uuid) TO service_role;
