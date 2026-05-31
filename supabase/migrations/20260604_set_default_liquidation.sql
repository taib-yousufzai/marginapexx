-- Update all existing profiles to have auto_sqoff = 90
UPDATE profiles SET auto_sqoff = 90 WHERE auto_sqoff IS DISTINCT FROM 90;
