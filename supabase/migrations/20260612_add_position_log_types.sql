-- Add POSITION_EDIT and POSITION_DELETE to the act_logs check constraint
ALTER TABLE public.act_logs DROP CONSTRAINT IF EXISTS act_logs_type_check;

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
    'PAY_DELETE',
    'POSITION_EDIT',
    'POSITION_DELETE'
  ));
