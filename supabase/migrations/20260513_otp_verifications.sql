-- OTP verifications table for custom email verification flow
CREATE TABLE IF NOT EXISTS public.otp_verifications (
  email       text        PRIMARY KEY,
  otp_hash    text        NOT NULL,
  full_name   text        NOT NULL,
  broker_ref  text,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- No RLS needed — only accessible via service role in API routes
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages otp_verifications"
  ON public.otp_verifications
  FOR ALL
  USING  (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Auto-clean expired OTPs (optional scheduled job or called inline)
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM public.otp_verifications WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
