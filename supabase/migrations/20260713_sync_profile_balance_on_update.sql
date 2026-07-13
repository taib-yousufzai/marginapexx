-- ==============================================================================
-- MIGRATION: Sync Profile Balance On Update
-- Date: 2026-07-13
-- Description: Update sync_profile_balance trigger function to correctly recalculate
--              and adjust the user's wallet balance when an already APPROVED transaction
--              is updated (e.g. changing trade P&L or brokerage during admin edit).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.sync_profile_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id       uuid;
  v_change        numeric := 0;
  v_current_bal   numeric;
  v_new_bal       numeric;
BEGIN
  -- Skip margin transactions so they don't affect profiles.balance
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.type IN ('MARGIN_DEBIT', 'MARGIN_CREDIT') THEN
      RETURN NEW;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.type IN ('MARGIN_DEBIT', 'MARGIN_CREDIT') THEN
      RETURN OLD;
    END IF;
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.status = 'APPROVED') THEN
    v_user_id := NEW.user_id;
    v_change  := CASE
                   WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT')
                   THEN  NEW.amount
                   ELSE -NEW.amount
                 END;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_user_id := NEW.user_id;
    IF OLD.status <> 'APPROVED' AND NEW.status = 'APPROVED' THEN
      v_change := CASE
                    WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT')
                    THEN  NEW.amount
                    ELSE -NEW.amount
                  END;
    ELSIF OLD.status = 'APPROVED' AND NEW.status <> 'APPROVED' THEN
      v_change := -( CASE
                       WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT')
                       THEN  OLD.amount
                       ELSE -OLD.amount
                     END );
    ELSIF OLD.status = 'APPROVED' AND NEW.status = 'APPROVED' THEN
      v_change := (CASE
                     WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT')
                     THEN  NEW.amount
                     ELSE -NEW.amount
                   END) - (CASE
                             WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT')
                             THEN  OLD.amount
                             ELSE -OLD.amount
                           END);
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
