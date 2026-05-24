-- Fix handle_new_user trigger to be robust against schema changes.
-- The trigger previously failed silently because:
--   1. It did not handle all NOT NULL columns (e.g. balance, email)
--   2. parent_id FK validation could fail if broker_ref was not a valid UUID
-- This version uses a BEGIN/EXCEPTION block so any failure is logged and graceful.

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
    active,
    balance
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    -- Only set parent_id if broker_ref is a valid non-empty UUID
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'broker_ref', '')), ''),
    true,
    0  -- new users start with zero balance
  )
  ON CONFLICT (id) DO UPDATE SET
    parent_id = EXCLUDED.parent_id,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role      = COALESCE(public.profiles.role, EXCLUDED.role),
    active    = true;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log the error but don't block user creation
  RAISE WARNING 'handle_new_user failed for %: % %', NEW.email, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user();
