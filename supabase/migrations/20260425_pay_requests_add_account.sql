-- Migration: pay_requests table extension — add payment_account_id column
-- Depends on: 20260424_payment_accounts.sql (payment_accounts table must exist first)
-- Requirements: 21.1, 21.2, 21.3

ALTER TABLE pay_requests
  ADD COLUMN payment_account_id UUID NULL REFERENCES payment_accounts(id);
