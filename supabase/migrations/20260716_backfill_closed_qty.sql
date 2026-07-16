-- Backfill: Fix existing closed positions that still have qty_open > 0
-- This cleans up any stale positions on the frontend that were closed by the cron job before the previous fix was applied.

UPDATE public.positions 
SET qty_open = 0 
WHERE status = 'closed' AND qty_open > 0;
