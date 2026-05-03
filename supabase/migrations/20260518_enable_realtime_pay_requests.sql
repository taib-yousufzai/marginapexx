-- Enable full replication identity to ensure all columns are available in realtime events
ALTER TABLE public.pay_requests REPLICA IDENTITY FULL;

-- Add the table to the supabase_realtime publication
-- We use a DO block to handle cases where it might already be added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'pay_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pay_requests;
  END IF;
END $$;

-- Policy to allow admins and super_admins to view all pay requests
-- This is required for realtime subscriptions to receive events for all users
DROP POLICY IF EXISTS "Admins can view all pay_requests" ON public.pay_requests;
CREATE POLICY "Admins can view all pay_requests"
  ON public.pay_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
      AND role IN ('admin', 'super_admin')
    )
  );
