-- Migration: extend approve_pay_request RPC to write ledger_entries atomically
-- Feature: ledger-transaction-classification
-- Requirements: 4.1, 4.2, 4.3, 5.1, 5.2
--
-- Depends on: 20260623_ledger_entries.sql (ledger_entries table must exist)
--
-- This migration replaces the existing approve_pay_request function so that,
-- inside the same database transaction, it:
--   1. Updates pay_requests.status → APPROVED  (unchanged)
--   2. Inserts into transactions               (unchanged — preserves balance trigger)
--   3. Inserts into ledger_entries             (NEW — typed, immutable financial record)
--
-- Direction mapping:
--   DEPOSIT  → CREDIT
--   WITHDRAWAL → DEBIT

CREATE OR REPLACE FUNCTION public.approve_pay_request(
  request_id UUID,
  admin_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request   pay_requests%ROWTYPE;
  v_direction TEXT;
BEGIN
  -- Lock the row to prevent concurrent approvals
  SELECT * INTO v_request
    FROM pay_requests
   WHERE id = request_id
     FOR UPDATE;

  -- Not found
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Not found', 'code', 404);
  END IF;

  -- Already processed
  IF v_request.status <> 'PENDING' THEN
    RETURN jsonb_build_object('error', 'Request is not pending', 'code', 409);
  END IF;

  -- Update status to APPROVED
  UPDATE pay_requests
     SET status     = 'APPROVED',
         updated_at = now()
   WHERE id = request_id;

  -- Existing transaction insert — keeps the transactions_balance_sync trigger working
  INSERT INTO transactions (user_id, type, amount, status, created_at)
  VALUES (v_request.user_id, v_request.type, v_request.amount, 'APPROVED', now());

  -- New ledger entry — immutable, typed financial record
  -- Requirements: 4.1, 4.2 (DEPOSIT→CREDIT, WITHDRAWAL→DEBIT)
  v_direction := CASE WHEN v_request.type = 'DEPOSIT' THEN 'CREDIT' ELSE 'DEBIT' END;

  INSERT INTO ledger_entries (user_id, entry_type, direction, amount, pay_request_id, created_at)
  VALUES (v_request.user_id, v_request.type, v_direction, v_request.amount, request_id, now());

  RETURN jsonb_build_object('status', 'APPROVED', 'code', 200);
END;
$$;
