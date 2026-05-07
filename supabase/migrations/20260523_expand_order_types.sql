-- Expand order types and status
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_order_type_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_order_type_check
  CHECK (order_type IN ('MARKET','LIMIT','SL','SLM','GTT'));

-- Ensure status check also has PENDING (already added in 20260510 but double checking)
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('PENDING','EXECUTED','CANCELLED','REJECTED','TRIGGERED'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS trigger_price numeric;
