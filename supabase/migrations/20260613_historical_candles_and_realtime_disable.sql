-- Disable Realtime on market_quotes to stop triggering Supabase Realtime egress
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS public.market_quotes;

-- Create historical_candles table for OHLCV data
CREATE TABLE IF NOT EXISTS public.historical_candles (
  symbol text not null,
  timestamp timestamptz not null,
  interval text not null, -- '1m', '5m', '15m', '1h'
  open numeric not null,
  high numeric not null,
  low numeric not null,
  close numeric not null,
  volume bigint not null,
  primary key (symbol, timestamp, interval)
);

-- Enable RLS on historical_candles
ALTER TABLE public.historical_candles ENABLE ROW LEVEL SECURITY;

-- Allow read access to historical_candles for all authenticated users
CREATE POLICY "Allow read access to historical_candles for all" 
  ON public.historical_candles FOR SELECT USING (true);
