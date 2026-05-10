-- 20260524_trading_hours.sql
-- Table to manage market segment trading hours

CREATE TABLE IF NOT EXISTS public.trading_hours (
  id          text        PRIMARY KEY, -- e.g. 'nse', 'mcx'
  name        text        NOT NULL,
  start_time  text        NOT NULL DEFAULT '09:15',
  end_time    text        NOT NULL DEFAULT '15:30',
  is_active   boolean     NOT NULL DEFAULT true,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Initial data
INSERT INTO public.trading_hours (id, name, start_time, end_time, is_active)
VALUES 
  ('nse', 'NSE Equity', '09:15', '15:30', true),
  ('bse', 'BSE Equity', '09:15', '15:30', true),
  ('mcx', 'MCX Commodities', '09:00', '23:30', true),
  ('forex', 'FOREX', '00:00', '23:59', true),
  ('comex', 'COMEX', '00:00', '23:59', true)
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE public.trading_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages trading_hours"
  ON public.trading_hours FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Authenticated users can read trading_hours"
  ON public.trading_hours FOR SELECT
  USING (auth.role() = 'authenticated');
