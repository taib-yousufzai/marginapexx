-- Trigger to keep profiles.balance in sync with approved transactions
-- This ensures that manual ledger updates and approved pay-ins/outs are reflected in the user's balance.

CREATE OR REPLACE FUNCTION public.sync_profile_balance()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'APPROVED') THEN
    UPDATE public.profiles
    SET balance = balance + (CASE WHEN NEW.type = 'DEPOSIT' THEN NEW.amount ELSE -NEW.amount END),
        updated_at = now()
    WHERE id = NEW.user_id;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- If status changed to APPROVED
    IF (OLD.status <> 'APPROVED' AND NEW.status = 'APPROVED') THEN
      UPDATE public.profiles
      SET balance = balance + (CASE WHEN NEW.type = 'DEPOSIT' THEN NEW.amount ELSE -NEW.amount END),
          updated_at = now()
      WHERE id = NEW.user_id;
    -- If an APPROVED transaction is deleted (rare, but for safety)
    ELSIF (OLD.status = 'APPROVED' AND NEW.status <> 'APPROVED') THEN
      UPDATE public.profiles
      SET balance = balance - (CASE WHEN OLD.type = 'DEPOSIT' THEN OLD.amount ELSE -OLD.amount END),
          updated_at = now()
      WHERE id = OLD.user_id;
    END IF;
  ELSIF (TG_OP = 'DELETE' AND OLD.status = 'APPROVED') THEN
    UPDATE public.profiles
    SET balance = balance - (CASE WHEN OLD.type = 'DEPOSIT' THEN OLD.amount ELSE -OLD.amount END),
        updated_at = now()
    WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS transactions_balance_sync ON public.transactions;
CREATE TRIGGER transactions_balance_sync
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_profile_balance();

-- Initial sync: Ensure all profiles have balance reflecting their approved transactions
-- WARNING: This assumes existing balance was 0 or incorrect. 
-- In a production environment, you'd calculate the sum and update once.
-- For this setup, we'll perform a one-time update.

UPDATE public.profiles p
SET balance = COALESCE((
  SELECT SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END)
  FROM public.transactions
  WHERE user_id = p.id AND status = 'APPROVED'
), 0);
