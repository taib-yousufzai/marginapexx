-- Migration: pay_requests table extension — add utr column
-- Requires: 20260423_pay_requests.sql

-- Add the column allowing NULLs initially for existing withdrawal and old deposit records
ALTER TABLE pay_requests
  ADD COLUMN utr TEXT NULL;

-- Enforce global uniqueness on UTR to prevent duplicate claims
ALTER TABLE pay_requests
  ADD CONSTRAINT unique_utr UNIQUE (utr);
