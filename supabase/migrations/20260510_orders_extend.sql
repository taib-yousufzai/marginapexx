-- ─── Orders: add execution columns ───────────────────────────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS segment        text,
  ADD COLUMN IF NOT EXISTS product_type   text
    CHECK (product_type IN ('INTRADAY','CARRY')),
  ADD COLUMN IF NOT EXISTS lots           numeric,
  ADD COLUMN IF NOT EXISTS fill_price     numeric,       -- actual platform fill (LTP ± buffer)
  ADD COLUMN IF NOT EXISTS ltp_at_entry   numeric,       -- raw Kite LTP at moment of order
  ADD COLUMN IF NOT EXISTS kite_instrument text,         -- Kite quote key e.g. "NSE:RELIANCE"
  ADD COLUMN IF NOT EXISTS updated_at     timestamptz NOT NULL DEFAULT now();

-- Expand status to include PENDING (future limit-order engine)
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('PENDING','EXECUTED','CANCELLED','REJECTED'));

-- ─── Transactions: add P&L settlement types ───────────────────────────────────
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('DEPOSIT','WITHDRAWAL','PNL_CREDIT','PNL_DEBIT'));

-- updated_at trigger for orders (reuses existing set_updated_at function)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'orders_updated_at' AND tgrelid = 'public.orders'::regclass
  ) THEN
    CREATE TRIGGER orders_updated_at
      BEFORE UPDATE ON public.orders
      FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();
  END IF;
END;
$$;
