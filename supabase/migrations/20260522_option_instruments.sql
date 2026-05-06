-- Add strike_price, option_type, and underlying_symbol to instruments table
ALTER TABLE public.instruments 
ADD COLUMN IF NOT EXISTS strike_price numeric,
ADD COLUMN IF NOT EXISTS option_type text,
ADD COLUMN IF NOT EXISTS underlying_symbol text;

-- Index for faster filtering in the option chain
CREATE INDEX IF NOT EXISTS idx_instruments_option_lookup 
ON public.instruments(underlying_symbol, expiry, strike_price);
