CREATE OR REPLACE FUNCTION public.process_executed_position(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order record;
