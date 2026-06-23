-- ------------------------------------------
-- FILE: 20260622_account_templates.sql
-- Template Account (Parent Account) system
-- ------------------------------------------

-- 1. Extend act_logs type constraint to include TEMPLATE_APPLY
--    (preserves all existing types from the latest setup.sql constraint)
ALTER TABLE public.act_logs DROP CONSTRAINT IF EXISTS act_logs_type_check;
ALTER TABLE public.act_logs ADD CONSTRAINT act_logs_type_check
  CHECK (type IN (
    'ORDER_EXECUTION',
    'AUTO_SQUARE_OFF',
    'ORDER_CANCEL',
    'LOGIN',
    'LOGOUT',
    'ORDER_PLACED',
    'PAY_APPROVE',
    'PAY_REJECT',
    'PAY_DELETE',
    'POSITION_EDIT',
    'POSITION_DELETE',
    'ADMIN_ACTION',
    'TEMPLATE_APPLY'
  ));

-- 2. account_templates — stores all profile-level settings for a template
CREATE TABLE IF NOT EXISTS public.account_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text        NOT NULL,
  description     text,
  is_default      boolean     NOT NULL DEFAULT false,

  -- Profile-level settings mirrored from profiles
  segments        text[],
  read_only       boolean     NOT NULL DEFAULT false,
  demo_user       boolean     NOT NULL DEFAULT false,
  intraday_sq_off boolean     NOT NULL DEFAULT false,
  auto_sqoff      integer     NOT NULL DEFAULT 90,
  sqoff_method    text        NOT NULL DEFAULT 'Credit',
  trading_mode    text        NOT NULL DEFAULT 'normal'
                              CHECK (trading_mode IN ('normal', 'scalper')),

  created_by      uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Only one template can be default at a time (enforced in API, not DB, for flexibility)
-- Index for fast default lookup
CREATE INDEX IF NOT EXISTS account_templates_is_default_idx ON public.account_templates(is_default) WHERE is_default = true;

ALTER TABLE public.account_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages all account_templates"
  ON public.account_templates FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER account_templates_updated_at
  BEFORE UPDATE ON public.account_templates
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 3. template_segment_settings — normal mode segment settings per template
CREATE TABLE IF NOT EXISTS public.template_segment_settings (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id             uuid        NOT NULL REFERENCES public.account_templates(id) ON DELETE CASCADE,
  segment                 text        NOT NULL,
  side                    text        NOT NULL CHECK (side IN ('BUY', 'SELL')),
  commission_type         text        NOT NULL DEFAULT 'Per Crore',
  commission_value        numeric     NOT NULL DEFAULT 4500,
  carry_commission_type   text        NOT NULL DEFAULT 'Per Crore',
  carry_commission_value  numeric     NOT NULL DEFAULT 4500,
  gtt_commission_type     text        NOT NULL DEFAULT 'Per Trade',
  gtt_commission_value    numeric     NOT NULL DEFAULT 10,
  profit_hold_sec         integer     NOT NULL DEFAULT 120,
  loss_hold_sec           integer     NOT NULL DEFAULT 0,
  strike_range            numeric     NOT NULL DEFAULT 0,
  max_lot                 numeric     NOT NULL DEFAULT 50,
  max_order_lot           numeric     NOT NULL DEFAULT 50,
  intraday_leverage       numeric     NOT NULL DEFAULT 50,
  intraday_type           text        NOT NULL DEFAULT 'Multiplier',
  holding_leverage        numeric     NOT NULL DEFAULT 5,
  holding_type            text        NOT NULL DEFAULT 'Multiplier',
  entry_buffer            numeric     NOT NULL DEFAULT 0.003,
  exit_buffer             numeric     NOT NULL DEFAULT 0.0017,
  trade_allowed           boolean     NOT NULL DEFAULT true,
  top_limit               numeric     NOT NULL DEFAULT 0,
  min_limit               numeric     NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, segment, side)
);

CREATE INDEX IF NOT EXISTS template_segment_settings_template_id_idx
  ON public.template_segment_settings(template_id);

ALTER TABLE public.template_segment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages all template_segment_settings"
  ON public.template_segment_settings FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER template_segment_settings_updated_at
  BEFORE UPDATE ON public.template_segment_settings
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 4. template_scalper_segment_settings — scalper mode segment settings per template
CREATE TABLE IF NOT EXISTS public.template_scalper_segment_settings (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id             uuid        NOT NULL REFERENCES public.account_templates(id) ON DELETE CASCADE,
  segment                 text        NOT NULL,
  side                    text        NOT NULL CHECK (side IN ('BUY', 'SELL')),
  commission_type         text        NOT NULL DEFAULT 'Per Crore',
  commission_value        numeric     NOT NULL DEFAULT 8500,
  carry_commission_type   text        NOT NULL DEFAULT 'Per Crore',
  carry_commission_value  numeric     NOT NULL DEFAULT 8500,
  gtt_commission_type     text        NOT NULL DEFAULT 'Per Trade',
  gtt_commission_value    numeric     NOT NULL DEFAULT 10,
  profit_hold_sec         integer     NOT NULL DEFAULT 15,
  loss_hold_sec           integer     NOT NULL DEFAULT 0,
  strike_range            numeric     NOT NULL DEFAULT 0,
  max_lot                 numeric     NOT NULL DEFAULT 50,
  max_order_lot           numeric     NOT NULL DEFAULT 50,
  intraday_leverage       numeric     NOT NULL DEFAULT 50,
  intraday_type           text        NOT NULL DEFAULT 'Multiplier',
  holding_leverage        numeric     NOT NULL DEFAULT 5,
  holding_type            text        NOT NULL DEFAULT 'Multiplier',
  entry_buffer            numeric     NOT NULL DEFAULT 0.003,
  exit_buffer             numeric     NOT NULL DEFAULT 0.0017,
  trade_allowed           boolean     NOT NULL DEFAULT true,
  top_limit               numeric     NOT NULL DEFAULT 0,
  min_limit               numeric     NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, segment, side)
);

CREATE INDEX IF NOT EXISTS template_scalper_segment_settings_template_id_idx
  ON public.template_scalper_segment_settings(template_id);

ALTER TABLE public.template_scalper_segment_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages all template_scalper_segment_settings"
  ON public.template_scalper_segment_settings FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE TRIGGER template_scalper_segment_settings_updated_at
  BEFORE UPDATE ON public.template_scalper_segment_settings
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

-- 5. profiles: add template_id reference (nullable — existing users are unaffected)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.account_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_template_id_idx ON public.profiles(template_id);
