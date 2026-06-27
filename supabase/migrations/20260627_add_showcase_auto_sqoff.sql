-- ==============================================================================
-- MIGRATION: Add showcase_auto_sqoff
-- Date: 2026-06-27
-- ==============================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS showcase_auto_sqoff numeric DEFAULT 85;
ALTER TABLE public.account_templates ADD COLUMN IF NOT EXISTS showcase_auto_sqoff numeric DEFAULT 85;
