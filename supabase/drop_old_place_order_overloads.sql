-- Drop stale old overloads of place_order that cause PostgREST ambiguity
-- Keep only oid 18932 (the current 17-param version with p_buffer_fee)

-- Drop the 12-param version (oid 17908)
DROP FUNCTION IF EXISTS public.place_order(
  uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, text
);

-- Drop the 13-param version with only trigger_price (oid 18669)
DROP FUNCTION IF EXISTS public.place_order(
  uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, text,
  numeric
);

-- Drop the 16-param version without p_buffer_fee (oid 18588)
DROP FUNCTION IF EXISTS public.place_order(
  uuid, text, text, text, text, text, text,
  numeric, numeric, numeric, numeric, text,
  numeric, numeric, numeric, boolean
);

-- Verify only one overload remains
SELECT proname, pg_get_function_arguments(oid) AS args, oid
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname = 'place_order'
ORDER BY oid;
