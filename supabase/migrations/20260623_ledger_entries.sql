-- Migration: ledger_entries table
-- Feature: ledger-transaction-classification
-- Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.3, 5.2, 9.1, 10.1

CREATE TABLE public.ledger_entries (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_type     TEXT        NOT NULL CHECK (entry_type IN (
                               'DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT', 'CORRECTION', 'REFUND'
                             )),
  direction      TEXT        NOT NULL CHECK (direction IN ('CREDIT', 'DEBIT')),
  amount         NUMERIC     NOT NULL CHECK (amount > 0),
  remarks        TEXT        NULL,
  pay_request_id UUID        NULL REFERENCES public.pay_requests(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique: one ledger entry per approved pay_request (prevents double-write on retry)
-- Requirements: 4.3, 5.2, 10.1
CREATE UNIQUE INDEX ledger_entries_pay_request_uniq
  ON public.ledger_entries (pay_request_id)
  WHERE pay_request_id IS NOT NULL;

-- Efficient per-user history queries ordered by recency
-- Requirements: 1.3, 9.1
CREATE INDEX ledger_entries_user_id_created_at_idx
  ON public.ledger_entries (user_id, created_at DESC);

-- RLS: enable row-level security so users can only see their own entries
-- Requirements: 9.1
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Users may only SELECT their own ledger entries
CREATE POLICY "Users read own ledger entries"
  ON public.ledger_entries
  FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (used by server-side API routes) has full access
CREATE POLICY "Service role manages all ledger entries"
  ON public.ledger_entries
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
