-- Notifications table for user-facing alerts
-- Types cover: orders, positions, funds, account status

CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN (
               'ORDER_EXECUTED', 'ORDER_REJECTED', 'ORDER_CANCELLED',
               'POSITION_OPENED', 'POSITION_CLOSED',
               'DEPOSIT_APPROVED', 'DEPOSIT_REJECTED',
               'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED',
               'ACCOUNT_SUSPENDED', 'ACCOUNT_READONLY',
               'ACCOUNT_DELETE_SCHEDULED', 'TRADE_DISABLED',
               'GENERAL'
             )),
  title      TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  read       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_read_idx    ON public.notifications(user_id, read);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for server-side inserts from triggers/API)
CREATE POLICY "Service role manages all notifications"
  ON public.notifications FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Users can read their own notifications
CREATE POLICY "Users can read own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

-- Users can mark their own notifications as read
CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
