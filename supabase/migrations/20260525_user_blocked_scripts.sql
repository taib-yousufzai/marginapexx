-- 20260525_user_blocked_scripts.sql
-- Table to manage blocked scripts per user

CREATE TABLE IF NOT EXISTS public.user_blocked_scripts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  symbol      text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

-- RLS
ALTER TABLE public.user_blocked_scripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages all user_blocked_scripts"
  ON public.user_blocked_scripts FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Users can read their own blocked scripts"
  ON public.user_blocked_scripts FOR SELECT
  USING (auth.uid() = user_id);
