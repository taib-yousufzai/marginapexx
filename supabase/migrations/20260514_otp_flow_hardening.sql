
-- ── 1. otp_verifications table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.otp_verifications (
  email       text        PRIMARY KEY,
  otp_hash    text        NOT NULL,
  full_name   text        NOT NULL,
  broker_ref  text,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Allow the created_at column to be updated on upsert (for rate-limit refresh)
ALTER TABLE public.otp_verifications
  ALTER COLUMN created_at SET DEFAULT now();

-- ── 2. RLS — service role bypasses RLS automatically in Postgres; enabling RLS
--    here only blocks anon/authenticated roles from reading OTP hashes directly.
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- Drop the old policy (if name changed) and recreate cleanly
DROP POLICY IF EXISTS "Service role manages otp_verifications" ON public.otp_verifications;

-- Block ALL direct access from anon/authenticated JWT roles.
-- API routes use the service-role key which bypasses RLS entirely in Postgres.
-- No explicit USING/WITH CHECK needed — absence of a matching policy = denied.

-- ── 3. Auto-cleanup function ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.otp_verifications WHERE expires_at < now();
END;
$$;

-- ── 4. handle_new_user trigger (broker_ref → parent_id) ──────────────────────
-- Drops and recreates to ensure it is always in sync with the current schema.

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

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
    active
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    -- broker_ref in user_metadata must be a UUID (the broker's profile id)
    NULLIF(TRIM(NEW.raw_user_meta_data->>'broker_ref'), ''),
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    parent_id = EXCLUDED.parent_id,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role      = COALESCE(public.profiles.role, EXCLUDED.role),
    active    = true;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();