-- ==============================================================================
-- MIGRATION: Add settlement_amount to positions
-- Date: 2026-06-25
-- ==============================================================================
-- When a liquidation drives the account balance negative, the shortfall (e.g. ₹100)
-- is stored as the user's settlement debt on profiles.settlement_amount.
-- This column records that same amount on each individual position that was
-- closed as part of that liquidation batch, so users can see it in history.
-- ==============================================================================

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS settlement_amount numeric NOT NULL DEFAULT 0;
