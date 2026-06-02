-- Add settlement_amount column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS settlement_amount numeric NOT NULL DEFAULT 0;

-- Redefine sync_profile_balance trigger function to support capping balance at 0 and routing negative balances to settlement_amount
CREATE OR REPLACE FUNCTION public.sync_profile_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id uuid;
  v_change numeric := 0;
  v_current_bal numeric;
  v_current_settle numeric;
  v_new_val numeric;
BEGIN
  -- Determine user_id and change amount
  IF (TG_OP = 'INSERT' AND NEW.status = 'APPROVED') THEN
    v_user_id := NEW.user_id;
    v_change := (CASE WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT') THEN NEW.amount ELSE -NEW.amount END);
  ELSIF (TG_OP = 'UPDATE') THEN
    v_user_id := NEW.user_id;
    IF (OLD.status <> 'APPROVED' AND NEW.status = 'APPROVED') THEN
      v_change := (CASE WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT') THEN NEW.amount ELSE -NEW.amount END);
    ELSIF (OLD.status = 'APPROVED' AND NEW.status <> 'APPROVED') THEN
      v_change := -(CASE WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT') THEN OLD.amount ELSE -OLD.amount END);
    END IF;
  ELSIF (TG_OP = 'DELETE' AND OLD.status = 'APPROVED') THEN
    v_user_id := OLD.user_id;
    v_change := -(CASE WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT') THEN OLD.amount ELSE -OLD.amount END);
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

-- One-time sync/recalculation for all profiles
DO $$
DECLARE
  r record;
  v_total numeric;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    SELECT COALESCE(SUM(CASE WHEN type IN ('DEPOSIT', 'PNL_CREDIT') THEN amount ELSE -amount END), 0)
    INTO v_total
    FROM public.transactions
    WHERE user_id = r.id AND status = 'APPROVED';

    IF v_total < 0 THEN
      UPDATE public.profiles
      SET balance = 0, settlement_amount = v_total
      WHERE id = r.id;
    ELSE
      UPDATE public.profiles
      SET balance = v_total, settlement_amount = 0
      WHERE id = r.id;
    END IF;
  END LOOP;
END;
$$;
