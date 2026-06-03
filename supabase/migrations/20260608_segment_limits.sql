-- Add top_limit and min_limit columns to segment_settings and scalper_segment_settings tables
ALTER TABLE public.segment_settings 
  ADD COLUMN IF NOT EXISTS top_limit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_limit numeric NOT NULL DEFAULT 0;

ALTER TABLE public.scalper_segment_settings 
  ADD COLUMN IF NOT EXISTS top_limit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS min_limit numeric NOT NULL DEFAULT 0;
