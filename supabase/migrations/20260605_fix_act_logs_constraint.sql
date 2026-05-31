-- Drop the existing constraint
ALTER TABLE public.act_logs DROP CONSTRAINT IF EXISTS act_logs_type_check;

-- Add updated constraint including ORDER_PLACED, PAY_APPROVE, PAY_REJECT, and PAY_DELETE
ALTER TABLE public.act_logs ADD CONSTRAINT act_logs_type_check 
  CHECK (type IN (
    'ORDER_EXECUTION',
    'AUTO_SQUARE_OFF',
    'ORDER_CANCEL',
    'LOGIN',
    'LOGOUT',
    'ORDER_PLACED',
    'PAY_APPROVE',
    'PAY_REJECT',
    'PAY_DELETE'
  ));
