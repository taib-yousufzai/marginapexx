-- ─────────────────────────────────────────────────────────────────────────────
-- Step 1: Check what the live place_order signature looks like
-- ─────────────────────────────────────────────────────────────────────────────
SELECT proname, pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'place_order';

-- ─────────────────────────────────────────────────────────────────────────────
-- Step 2: Check numeric column precision/scale (no scale = arbitrary precision)
-- A result of "10,0" means integer-only — that would round 0.1 to 0!
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 
  table_name,
  column_name,
  data_type,
  numeric_precision,
  numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('orders', 'positions')
  AND column_name IN ('qty', 'lots', 'qty_open', 'qty_total');
