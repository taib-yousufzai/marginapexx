-- Extended profile fields: personal, KYC, bank details
-- All columns nullable — users fill gradually

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS date_of_birth text,
    ADD COLUMN IF NOT EXISTS city          text,
    ADD COLUMN IF NOT EXISTS state         text,
    ADD COLUMN IF NOT EXISTS pan_number    text,
    ADD COLUMN IF NOT EXISTS address       text,
    ADD COLUMN IF NOT EXISTS pincode       text,
    ADD COLUMN IF NOT EXISTS aadhar_number text,
    ADD COLUMN IF NOT EXISTS bank_name     text,
    ADD COLUMN IF NOT EXISTS account_no    text,
    ADD COLUMN IF NOT EXISTS ifsc          text;
