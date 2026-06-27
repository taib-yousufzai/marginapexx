-- ==========================================
-- FILE: 20260628_referral_update.sql
-- DESCRIPTION: Schema updates for new referral logic (First Trade Bonus & Weekly Brokerage)
-- ==========================================

-- 1. Track if a user has started trading
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS has_traded BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Add an earning_type to referral_earnings to distinguish bonuses
ALTER TABLE public.referral_earnings
  ADD COLUMN IF NOT EXISTS earning_type TEXT DEFAULT 'DEPOSIT_COMMISSION';

-- 3. Track which brokerage transactions have been paid out to referrers
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS brokerage_shared BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.referral_earnings ALTER COLUMN referred_user_id DROP NOT NULL;
