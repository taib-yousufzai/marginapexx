-- 1. Add bid_buffer column to segment_settings
ALTER TABLE public.segment_settings 
ADD COLUMN IF NOT EXISTS bid_buffer numeric NOT NULL DEFAULT 0.003;

-- 2. Add bid_buffer column to scalper_segment_settings
ALTER TABLE public.scalper_segment_settings 
ADD COLUMN IF NOT EXISTS bid_buffer numeric NOT NULL DEFAULT 0.003;
