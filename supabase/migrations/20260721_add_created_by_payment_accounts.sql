-- Add created_by to payment_accounts
ALTER TABLE payment_accounts ADD COLUMN created_by UUID REFERENCES auth.users(id);
