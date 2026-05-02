-- ============================================================
-- Broker Referral: handle_new_user trigger (idempotent)
-- Run this in Supabase SQL Editor.
-- It drops any existing handle_new_user function+trigger first,
-- then creates a clean single trigger that safely upserts the
-- profile row and maps broker_ref -> parent_id.
-- ============================================================

-- 1. Drop the old trigger first (if it exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Drop the old function (if it exists)
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- 3. Create the new function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    parent_id
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'broker_ref'), '')
  )
  ON CONFLICT (id) DO UPDATE SET
    parent_id = EXCLUDED.parent_id,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role      = COALESCE(public.profiles.role, EXCLUDED.role);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Attach the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
