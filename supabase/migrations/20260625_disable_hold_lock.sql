-- ==============================================================================
-- MIGRATION: Fix hold lock — zero loss_hold_sec, keep profit_hold_sec at 120
-- Date: 2026-06-25
-- ==============================================================================
-- Loss positions should NEVER be locked — only profitable ones get the 120s hold.
-- Also reset any profit_hold_sec = 0 rows back to 120 (the intended default).
-- ==============================================================================

UPDATE public.segment_settings
SET loss_hold_sec   = 0,
    profit_hold_sec = CASE WHEN profit_hold_sec = 0 THEN 120 ELSE profit_hold_sec END,
    updated_at      = now();

UPDATE public.scalper_segment_settings
SET loss_hold_sec   = 0,
    updated_at      = now()
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'scalper_segment_settings'
);
