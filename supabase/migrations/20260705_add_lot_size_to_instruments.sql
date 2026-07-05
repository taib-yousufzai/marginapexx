-- ==============================================================================
-- MIGRATION: Add lot_size column to instruments table
-- Date: 2026-07-05
-- ==============================================================================
-- Zerodha's instruments CSV includes lot_size for every F&O contract.
-- We store it here so the platform can do dynamic lot-size lookups instead
-- of relying on hardcoded fallbacks (which break when NSE revises lot sizes).

ALTER TABLE public.instruments
  ADD COLUMN IF NOT EXISTS lot_size integer NOT NULL DEFAULT 0;

-- Index for fast lookup by underlying name (used in lot size resolution)
CREATE INDEX IF NOT EXISTS idx_instruments_name_lot ON public.instruments (name) WHERE lot_size > 0;
