-- Enable replica identity on market_quotes to get full payloads in realtime events
ALTER TABLE public.market_quotes REPLICA IDENTITY FULL;

-- Add the table to the supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'market_quotes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.market_quotes;
  END IF;
END $$;
