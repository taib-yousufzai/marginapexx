-- Add expiry column to instruments table to support front-month contract mapping
ALTER TABLE public.instruments ADD COLUMN expiry date;

-- Index for querying by expiry quickly
CREATE INDEX IF NOT EXISTS idx_instruments_expiry ON public.instruments(expiry);
