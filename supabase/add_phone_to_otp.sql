-- Add phone column to otp_verifications for registration flow
ALTER TABLE public.otp_verifications ADD COLUMN IF NOT EXISTS phone text;
