-- ==============================================================================
-- MIGRATION: Add Crypto trading hours
-- Date: 2026-06-25
-- ==============================================================================
-- Crypto trades 24/7. Without this row, CRYPTO positions fell through to the
-- 'nse' default (end_time 15:30) and were EOD square-offed at 3:30 PM IST.
-- ==============================================================================

INSERT INTO public.trading_hours (id, name, start_time, end_time, is_active)
VALUES ('crypto', 'Crypto', '00:00', '23:59', true)
ON CONFLICT (id) DO UPDATE SET
  start_time = '00:00',
  end_time   = '23:59',
  is_active  = true;
