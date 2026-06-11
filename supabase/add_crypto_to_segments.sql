-- ==============================================================================
-- FILE: add_crypto_to_segments.sql
-- PURPOSE: 
--   1. Grant CRYPTO + all standard segments to existing profiles that have no
--      segments assigned (NULL or empty array).
--   2. Add CRYPTO to profiles that have some segments but are missing it.
--   3. Update handle_new_user trigger so new registrations always start with
--      the full default segment list.
-- ==============================================================================

-- ── 1. Grant ALL default segments to users who have no segments at all ─────────
UPDATE public.profiles
SET segments = ARRAY[
  'INDEX-FUT', 'INDEX-OPT', 'STOCK-FUT', 'STOCK-OPT',
  'NSE-EQ', 'MCX-FUT', 'MCX-OPT', 'CRYPTO', 'FOREX', 'COMEX'
]
WHERE segments IS NULL
   OR array_length(segments, 1) IS NULL  -- handles empty array {}
   OR array_length(segments, 1) = 0;

-- ── 2. Add CRYPTO to profiles that have segments but are missing CRYPTO ────────
-- Idempotent: safe to run multiple times
UPDATE public.profiles
SET segments = array_append(segments, 'CRYPTO')
WHERE NOT ('CRYPTO' = ANY(segments))
  AND segments IS NOT NULL
  AND array_length(segments, 1) > 0;

-- ── 3. Update handle_new_user trigger to include default segments ──────────────
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
    referral_code,
    segments
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    -- Only set parent_id if broker_ref is a valid non-empty value
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'broker_ref', '')), ''),
    true,
    0,
    -- Generate 8-char uppercase referral code from UUID
    UPPER(SUBSTRING(REPLACE(NEW.id::text, '-', ''), 1, 8)),
    -- Grant all standard segments by default
    ARRAY['INDEX-FUT', 'INDEX-OPT', 'STOCK-FUT', 'STOCK-OPT',
          'NSE-EQ', 'MCX-FUT', 'MCX-OPT', 'CRYPTO', 'FOREX', 'COMEX']
  )
  ON CONFLICT (id) DO UPDATE SET
    parent_id    = EXCLUDED.parent_id,
    full_name    = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role         = COALESCE(public.profiles.role, EXCLUDED.role),
    active       = true,
    -- Only set segments if the existing row has none
    segments     = CASE
                     WHEN public.profiles.segments IS NULL
                       OR array_length(public.profiles.segments, 1) IS NULL
                       OR array_length(public.profiles.segments, 1) = 0
                     THEN EXCLUDED.segments
                     ELSE public.profiles.segments
                   END;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Re-attach trigger (DROP + CREATE is idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();
