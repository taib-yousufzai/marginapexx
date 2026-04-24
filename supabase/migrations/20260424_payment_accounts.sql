-- Migration: payment_accounts table
-- Requirements: 20.1, 20.2, 20.3, 20.4

CREATE TABLE payment_accounts (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_holder TEXT        NOT NULL,
  bank_name      TEXT        NOT NULL,
  account_no     TEXT        NOT NULL,
  ifsc           TEXT        NOT NULL,
  upi_id         TEXT        NOT NULL,
  qr_image_url   TEXT        NOT NULL,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  sort_order     INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reuse existing set_updated_at() trigger function (created in 20260423_pay_requests.sql)
CREATE TRIGGER payment_accounts_updated_at
  BEFORE UPDATE ON payment_accounts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- No user-facing RLS; all access via service role
