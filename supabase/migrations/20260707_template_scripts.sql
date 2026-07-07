-- ------------------------------------------
-- FILE: 20260707_template_scripts.sql
-- Template Scripts allowlist
-- ------------------------------------------
-- Adds a per-template script (instrument) allowlist.
-- When a template has no rows in this table, all scripts are allowed (open access).
-- When rows exist, only those symbols are allowed for users assigned to the template.
--
-- This controls what instruments a user can:
--   - Search, View, Open charts for, Buy, Sell, Trade

CREATE TABLE IF NOT EXISTS public.template_scripts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid        NOT NULL REFERENCES public.account_templates(id) ON DELETE CASCADE,
  symbol      text        NOT NULL,
  exchange    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, symbol)
);

CREATE INDEX IF NOT EXISTS template_scripts_template_id_idx
  ON public.template_scripts(template_id);

ALTER TABLE public.template_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages all template_scripts"
  ON public.template_scripts FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
