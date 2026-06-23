-- Add balance_after column to ledger_entries
ALTER TABLE public.ledger_entries
ADD COLUMN balance_after NUMERIC NULL;
