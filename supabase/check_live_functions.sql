-- Run this in Supabase SQL Editor to see what functions are live
-- and check their parameter types

SELECT 
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  p.prosrc
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('place_order', 'process_executed_position')
ORDER BY p.proname;
