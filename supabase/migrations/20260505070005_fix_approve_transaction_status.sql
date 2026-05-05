CREATE OR REPLACE FUNCTION approve_pay_request(
  request_id UUID,
  admin_id   UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request pay_requests%ROWTYPE;
BEGIN
  -- Lock the row to prevent concurrent approvals
  SELECT * INTO v_request
    FROM pay_requests
   WHERE id = request_id
     FOR UPDATE;

  -- Not found
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Not found', 'code', 404);
  END IF;

  -- Already processed
  IF v_request.status <> 'PENDING' THEN
    RETURN jsonb_build_object('error', 'Request is not pending', 'code', 409);
  END IF;

  -- Update status to APPROVED
  UPDATE pay_requests
     SET status = 'APPROVED',
         updated_at = now()
   WHERE id = request_id;

  -- Insert matching transaction row WITH status APPROVED
  INSERT INTO transactions (user_id, type, amount, status, created_at)
  VALUES (v_request.user_id, v_request.type, v_request.amount, 'APPROVED', now());

  RETURN jsonb_build_object('status', 'APPROVED', 'code', 200);
END;
$$;

-- Fix any existing transactions that were erroneously created as PENDING when they were approved deposits/withdrawals.
-- Since all transactions created from pay_requests SHOULD be approved upon insertion by the RPC,
-- any PENDING DEPOSIT/WITHDRAWAL should be updated to APPROVED.
UPDATE transactions 
SET status = 'APPROVED' 
WHERE status = 'PENDING' AND type IN ('DEPOSIT', 'WITHDRAWAL');
