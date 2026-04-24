CREATE TABLE wallet_rules (
  id               INTEGER     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  withdraw_enabled BOOLEAN     NOT NULL DEFAULT true,
  allowed_days     TEXT[]      NOT NULL DEFAULT '{Monday,Tuesday,Wednesday,Thursday,Friday}',
  start_time       TIME        NOT NULL DEFAULT '10:00',
  end_time         TIME        NOT NULL DEFAULT '16:00',
  min_withdraw     NUMERIC     NOT NULL DEFAULT 100,
  min_deposit      NUMERIC     NOT NULL DEFAULT 1000,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the single configuration row
INSERT INTO wallet_rules (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
