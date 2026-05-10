-- Add margin_required to positions table
-- This allows accurate tracking of margin used by each user in real-time.

alter table if exists public.positions
  add column if not exists margin_required numeric default 0;

-- Optionally, if we have orders that were recently executed, we could try to backfill
-- But for now, we'll just ensure new positions have this data.
