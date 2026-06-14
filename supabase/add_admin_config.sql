-- ==============================================================================
-- FILE: add_admin_config.sql
-- PURPOSE:
--   1. Create the admin_config table for dynamic segment-level settings
--      (e.g. strike ranges for Index Options and MCX Options).
--   2. Seed the default rows for index_options_strike_range and
--      mcx_options_strike_range using ON CONFLICT DO NOTHING so the
--      migration is idempotent and safe to re-run.
--
-- Access: service-role only (no RLS user policy).
-- Admins interact through /api/admin/settings/filtering only.
-- Requirements: 2.1, 3.1, 7.2
-- ==============================================================================

-- ── 1. Create table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_config (
  key         TEXT        PRIMARY KEY,
  value       TEXT        NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Seed default rows ──────────────────────────────────────────────────────
INSERT INTO public.admin_config (key, value) VALUES
  ('index_options_strike_range', '5'),
  ('mcx_options_strike_range',   '7')
ON CONFLICT (key) DO NOTHING;
