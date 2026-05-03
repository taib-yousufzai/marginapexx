-- Migration: pay_requests table extension — add screenshot_url column
-- Requires: 20260423_pay_requests.sql

ALTER TABLE pay_requests
  ADD COLUMN screenshot_url TEXT NULL;
