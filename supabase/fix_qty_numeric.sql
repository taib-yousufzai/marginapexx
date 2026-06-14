-- ─────────────────────────────────────────────────────────────────────────────
-- Fix qty columns to ensure they are NUMERIC (not integer) so fractional lots
-- like 0.1, 0.2 can be stored correctly.
-- Run this in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Orders table
ALTER TABLE public.orders
  ALTER COLUMN qty       TYPE numeric USING qty::numeric,
  ALTER COLUMN lots      TYPE numeric USING lots::numeric;

-- Positions table
ALTER TABLE public.positions
  ALTER COLUMN qty_open  TYPE numeric USING qty_open::numeric,
  ALTER COLUMN qty_total TYPE numeric USING qty_total::numeric;

-- Verify
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('orders', 'positions')
  AND column_name IN ('qty', 'lots', 'qty_open', 'qty_total')
ORDER BY table_name, column_name;
