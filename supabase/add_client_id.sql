-- 1. Add client_id column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_id VARCHAR(6) UNIQUE;

-- 2. Backfill existing rows with a random 6-character alphanumeric string
UPDATE public.profiles
SET client_id = substring(md5(random()::text) from 1 for 6)
WHERE client_id IS NULL;

-- 3. Ensure the column is not null moving forward
ALTER TABLE public.profiles ALTER COLUMN client_id SET NOT NULL;
