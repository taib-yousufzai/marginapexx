-- ==============================================================================
-- POSITION MARGIN ADJUSTMENT MIGRATION
-- ==============================================================================
-- When an admin edits position avg_price or qty, the difference in position value
-- (avg_price * qty_total) must be reflected in the user's balance:
--   - Value increase → debit the difference (MARGIN_ADJ_DEBIT)
--   - Value decrease → credit the difference (MARGIN_ADJ_CREDIT)
-- ==============================================================================

-- 1. Drop and recreate the transactions type check constraint
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN (
    'DEPOSIT','WITHDRAWAL',
    'PNL_CREDIT','PNL_DEBIT',
    'BROKERAGE_DEBIT','BUFFER_FEE_DEBIT',
    'MARGIN_ADJ_CREDIT','MARGIN_ADJ_DEBIT'
  ));

-- 2. Update sync_profile_balance to treat MARGIN_ADJ_CREDIT as positive (adds to balance)
--    All other non-DEPOSIT/PNL_CREDIT types still subtract from balance.
CREATE OR REPLACE FUNCTION public.sync_profile_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_change numeric := 0;
  v_current_bal numeric;
  v_current_settle numeric;
  v_new_val numeric;
  v_parent_id uuid;
  v_commission numeric;
BEGIN
  -- Determine user_id and change amount
  IF (TG_OP = 'INSERT' AND NEW.status = 'APPROVED') THEN
    v_user_id := NEW.user_id;
    v_change := (CASE WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT') THEN NEW.amount ELSE -NEW.amount END);

    -- [REFERRAL LOGIC] If it's a deposit, check for parent_id and award 5%
    IF NEW.type = 'DEPOSIT' AND NEW.amount > 0 THEN
      SELECT parent_id INTO v_parent_id FROM public.profiles WHERE id = NEW.user_id;
      IF v_parent_id IS NOT NULL THEN
        v_commission := NEW.amount * 0.05;
        UPDATE public.profiles
        SET referral_balance = referral_balance + v_commission
        WHERE id = v_parent_id;
        INSERT INTO public.referral_earnings (referrer_id, referred_user_id, transaction_id, deposit_amount, commission_amount)
        VALUES (v_parent_id, NEW.user_id, NEW.id, NEW.amount, v_commission);
      END IF;
    END IF;

  ELSIF (TG_OP = 'UPDATE') THEN
    v_user_id := NEW.user_id;
    IF (OLD.status <> 'APPROVED' AND NEW.status = 'APPROVED') THEN
      v_change := (CASE WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT') THEN NEW.amount ELSE -NEW.amount END);

      IF NEW.type = 'DEPOSIT' AND NEW.amount > 0 THEN
        SELECT parent_id INTO v_parent_id FROM public.profiles WHERE id = NEW.user_id;
        IF v_parent_id IS NOT NULL THEN
          v_commission := NEW.amount * 0.05;
          UPDATE public.profiles
          SET referral_balance = referral_balance + v_commission
          WHERE id = v_parent_id;
          INSERT INTO public.referral_earnings (referrer_id, referred_user_id, transaction_id, deposit_amount, commission_amount)
          VALUES (v_parent_id, NEW.user_id, NEW.id, NEW.amount, v_commission);
        END IF;
      END IF;

    ELSIF (OLD.status = 'APPROVED' AND NEW.status <> 'APPROVED') THEN
      v_change := -(CASE WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT') THEN OLD.amount ELSE -OLD.amount END);
    END IF;
  ELSIF (TG_OP = 'DELETE' AND OLD.status = 'APPROVED') THEN
    v_user_id := OLD.user_id;
    v_change := -(CASE WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT') THEN OLD.amount ELSE -OLD.amount END);
  END IF;

  IF v_user_id IS NOT NULL AND v_change <> 0 THEN
    -- Lock and select current balance and settlement_amount
    SELECT COALESCE(balance, 0), COALESCE(settlement_amount, 0)
    INTO v_current_bal, v_current_settle
    FROM public.profiles
    WHERE id = v_user_id
    FOR UPDATE;

    IF FOUND THEN
      v_new_val := v_current_bal + v_change + v_current_settle;
      IF v_new_val < 0 THEN
        UPDATE public.profiles
        SET balance = 0,
            settlement_amount = v_new_val,
            updated_at = now()
        WHERE id = v_user_id;
      ELSE
        UPDATE public.profiles
        SET balance = v_new_val,
            settlement_amount = 0,
            updated_at = now()
        WHERE id = v_user_id;
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
