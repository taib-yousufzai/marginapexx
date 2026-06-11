-- Run this script in the Supabase SQL Editor to create the get_option_expiries RPC function.
-- This dramatically speeds up the option chain loading by returning only distinct expiry dates
-- instead of pulling all instrument records over the network.

CREATE OR REPLACE FUNCTION get_option_expiries(p_symbol TEXT, p_min_date DATE)
RETURNS TABLE (expiry DATE) 
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT i.expiry 
  FROM public.instruments i
  WHERE i.underlying_symbol = p_symbol 
    AND i.expiry >= p_min_date
    AND i.expiry IS NOT NULL
  ORDER BY i.expiry ASC;
END;
$$;
