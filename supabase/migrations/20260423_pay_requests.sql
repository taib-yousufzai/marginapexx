CREATE TABLE pay_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id),
  type         TEXT        NOT NULL CHECK (type IN ('DEPOSIT', 'WITHDRAWAL')),
  amount       NUMERIC     NOT NULL CHECK (amount > 0),
  status       TEXT        NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  account_name TEXT        NULL,
  account_no   TEXT        NULL,
  ifsc         TEXT        NULL,
  upi          TEXT        NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pay_requests_updated_at
  BEFORE UPDATE ON pay_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE pay_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_pay_requests"
  ON pay_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_pay_requests"
  ON pay_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);
