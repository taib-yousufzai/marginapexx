-- Migration: allow CANCELLED_BY_USER status on pay_requests
-- Run this before deploying the edit-pending-request feature.

ALTER TABLE public.pay_requests
  DROP CONSTRAINT IF EXISTS pay_requests_status_check;

ALTER TABLE public.pay_requests
  ADD CONSTRAINT pay_requests_status_check
  CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED_BY_USER'));
