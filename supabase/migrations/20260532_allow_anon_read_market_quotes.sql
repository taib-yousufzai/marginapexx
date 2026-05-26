-- Drop old select policies that only allowed authenticated users
DROP POLICY IF EXISTS "Allow authenticated users to read instruments" ON public.instruments;
DROP POLICY IF EXISTS "Allow authenticated users to read market_quotes" ON public.market_quotes;

-- Create new policies allowing both authenticated and anonymous users to select
CREATE POLICY "Allow read access to instruments for all" 
  ON public.instruments FOR SELECT USING (true);

CREATE POLICY "Allow read access to market_quotes for all" 
  ON public.market_quotes FOR SELECT USING (true);
