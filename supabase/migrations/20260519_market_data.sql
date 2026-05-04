-- Create instruments table to cache Kite Connect instruments list
CREATE TABLE IF NOT EXISTS public.instruments (
  id text primary key, -- exchange:tradingsymbol (e.g. NSE:RELIANCE)
  instrument_token bigint not null,
  tradingsymbol text not null,
  name text,
  exchange text,
  instrument_type text,
  segment text,
  updated_at timestamptz default now()
);

-- Index for querying by segment/type quickly
CREATE INDEX IF NOT EXISTS idx_instruments_segment_type ON public.instruments(segment, instrument_type);

-- Create market_quotes table to store latest prices
CREATE TABLE IF NOT EXISTS public.market_quotes (
  id text primary key references public.instruments(id) on delete cascade,
  last_price numeric,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume bigint,
  quote_timestamp timestamptz,
  updated_at timestamptz default now()
);

-- Enable RLS
ALTER TABLE public.instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_quotes ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (handled automatically by Supabase for service_role)
-- Allow authenticated users to SELECT
CREATE POLICY "Allow authenticated users to read instruments" 
  ON public.instruments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated users to read market_quotes" 
  ON public.market_quotes FOR SELECT TO authenticated USING (true);
