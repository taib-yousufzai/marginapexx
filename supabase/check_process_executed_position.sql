-- Check all overloads of process_executed_position
SELECT proname, pg_get_function_arguments(oid) AS args, oid
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'process_executed_position'
ORDER BY oid;
