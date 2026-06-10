-- ==============================================================================
-- REFERRAL AND EARN SYSTEM MIGRATION
-- ==============================================================================

-- 1. Add referral_balance and referral_code to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS referral_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

-- Create an index on referral_code for fast lookups
CREATE INDEX IF NOT EXISTS profiles_referral_code_idx ON public.profiles(referral_code);

-- Generate referral codes for existing users who don't have one
-- We use a simple substr of their UUID to generate a unique-ish code
UPDATE public.profiles
SET referral_code = UPPER(SUBSTRING(REPLACE(id::text, '-', ''), 1, 8))
WHERE referral_code IS NULL;

-- 2. Create referral_earnings table
CREATE TABLE IF NOT EXISTS public.referral_earnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE CASCADE,
  deposit_amount numeric NOT NULL,
  commission_amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_earnings_referrer_id_idx ON public.referral_earnings(referrer_id);

-- Enable RLS
ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY;

-- Drop policy if exists
DROP POLICY IF EXISTS "Users can view their own referral earnings" ON public.referral_earnings;

CREATE POLICY "Users can view their own referral earnings"
  ON public.referral_earnings FOR SELECT
  USING (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "Service role manages referral_earnings" ON public.referral_earnings;
CREATE POLICY "Service role manages referral_earnings"
  ON public.referral_earnings FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- 3. Update the sync_profile_balance trigger function to issue 5% commissions
--    when a DEPOSIT is approved.
CREATE OR REPLACE FUNCTION public.sync_profile_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_id uuid;
  v_commission numeric;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.status = 'APPROVED') THEN
    UPDATE public.profiles
    SET balance = balance + (CASE WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT') THEN NEW.amount ELSE -NEW.amount END),
        updated_at = now()
    WHERE id = NEW.user_id;

    -- [REFERRAL LOGIC] If it's a deposit, check for parent_id and award 5%
    IF NEW.type = 'DEPOSIT' AND NEW.amount > 0 THEN
      SELECT parent_id INTO v_parent_id FROM public.profiles WHERE id = NEW.user_id;
      IF v_parent_id IS NOT NULL THEN
        v_commission := NEW.amount * 0.05;
        
        -- Add to referrer's balance
        UPDATE public.profiles
        SET referral_balance = referral_balance + v_commission
        WHERE id = v_parent_id;

        -- Record the earning
        INSERT INTO public.referral_earnings (referrer_id, referred_user_id, transaction_id, deposit_amount, commission_amount)
        VALUES (v_parent_id, NEW.user_id, NEW.id, NEW.amount, v_commission);
      END IF;
    END IF;

  ELSIF (TG_OP = 'UPDATE') THEN
    -- If status changed to APPROVED
    IF (OLD.status <> 'APPROVED' AND NEW.status = 'APPROVED') THEN
      UPDATE public.profiles
      SET balance = balance + (CASE WHEN NEW.type IN ('DEPOSIT', 'PNL_CREDIT') THEN NEW.amount ELSE -NEW.amount END),
          updated_at = now()
      WHERE id = NEW.user_id;

      -- [REFERRAL LOGIC] If it's a deposit, check for parent_id and award 5%
      IF NEW.type = 'DEPOSIT' AND NEW.amount > 0 THEN
        SELECT parent_id INTO v_parent_id FROM public.profiles WHERE id = NEW.user_id;
        IF v_parent_id IS NOT NULL THEN
          v_commission := NEW.amount * 0.05;
          
          -- Add to referrer's balance
          UPDATE public.profiles
          SET referral_balance = referral_balance + v_commission
          WHERE id = v_parent_id;

          -- Record the earning
          INSERT INTO public.referral_earnings (referrer_id, referred_user_id, transaction_id, deposit_amount, commission_amount)
          VALUES (v_parent_id, NEW.user_id, NEW.id, NEW.amount, v_commission);
        END IF;
      END IF;

    -- If an APPROVED transaction is deleted (rare, but for safety)
    ELSIF (OLD.status = 'APPROVED' AND NEW.status <> 'APPROVED') THEN
      UPDATE public.profiles
      SET balance = balance - (CASE WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT') THEN OLD.amount ELSE -OLD.amount END),
          updated_at = now()
      WHERE id = OLD.user_id;
    END IF;
  ELSIF (TG_OP = 'DELETE' AND OLD.status = 'APPROVED') THEN
    UPDATE public.profiles
    SET balance = balance - (CASE WHEN OLD.type IN ('DEPOSIT', 'PNL_CREDIT') THEN OLD.amount ELSE -OLD.amount END),
        updated_at = now()
    WHERE id = OLD.user_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Update handle_new_user to generate a referral code for new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    parent_id,
    active,
    balance,
    referral_code
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'broker_ref', '')), ''),
    true,
    0,
    -- Generate 8-char uppercase code from UUID
    UPPER(SUBSTRING(REPLACE(NEW.id::text, '-', ''), 1, 8))
  )
  ON CONFLICT (id) DO UPDATE SET
    parent_id = EXCLUDED.parent_id,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role      = COALESCE(public.profiles.role, EXCLUDED.role),
    active    = true;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log the error securely using Postgres RAISE (will show in Supabase Postgres logs)
    RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 5. RPC to claim referral earnings
CREATE OR REPLACE FUNCTION public.claim_referral_earnings(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ref_balance numeric;
BEGIN
  -- Lock the profile
  SELECT referral_balance INTO v_ref_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Profile not found');
  END IF;

  IF COALESCE(v_ref_balance, 0) <= 0 THEN
    RETURN jsonb_build_object('error', 'No referral balance to claim');
  END IF;

  -- Reset referral balance
  UPDATE public.profiles
  SET referral_balance = 0
  WHERE id = p_user_id;

  -- Insert a PNL_CREDIT transaction (which will trigger balance update)
  INSERT INTO public.transactions (user_id, type, amount, status, created_at)
  VALUES (p_user_id, 'PNL_CREDIT', v_ref_balance, 'APPROVED', now());

  RETURN jsonb_build_object('success', true, 'claimed_amount', v_ref_balance);
END;
$$;
