-- This migration drops the old triggers that cause duplicate position quantities.
-- The RPC `place_order` now handles position updates directly via `process_executed_position`.
-- The trigger `handle_order_execution` runs redundantly, causing the quantity to be added twice.

DROP TRIGGER IF EXISTS trg_order_executed_insert ON public.orders;
DROP TRIGGER IF EXISTS trg_order_executed_update ON public.orders;

-- We can optionally drop the old function since it's no longer needed
-- DROP FUNCTION IF EXISTS public.handle_order_execution();
