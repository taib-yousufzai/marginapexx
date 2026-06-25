-- ==============================================================================
-- MIGRATION: Disable anti-scalping hold lock for all users
-- Date: 2026-06-25
-- ==============================================================================
-- Set profit_hold_sec and loss_hold_sec to 0 for all rows in both
-- segment_settings and scalper_segment_settings so no position is ever
-- locked from exiting regardless of how recently it was entered.
-- ==============================================================================

UPDATE public.segment_settings
SET profit_hold_sec = 0,
    loss_hold_sec   = 0,
    updated_at      = now();

UPDATE public.scalper_segment_settings
SET profit_hold_sec = 0,
    loss_hold_sec   = 0,
    updated_at      = now()
WHERE EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = 'scalper_segment_settings'
);
