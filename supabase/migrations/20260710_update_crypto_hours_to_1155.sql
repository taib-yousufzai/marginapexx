-- Update Crypto trading hours to end at 23:55 (11:55 PM)

UPDATE public.trading_hours
SET end_time = '23:55'
WHERE id = 'crypto';
