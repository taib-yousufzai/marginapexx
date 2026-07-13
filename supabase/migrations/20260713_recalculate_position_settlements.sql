-- ==============================================================================
-- MIGRATION: Recalculate Position Settlements
-- Date: 2026-07-13
-- Description: Recalculates and corrects wallet balance, profile settlement_amount,
--              and position-level settlement_amount for users based on transaction history.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rebaseline_user_profile_balance(p_user_id UUID)
RETURNS void AS $$
DECLARE
  r_tx      RECORD;
  v_bal     numeric;
  v_sett    numeric;
  v_change  numeric;
  v_pos_id  UUID;
BEGIN
  -- First, reset all settlement_amount values for this user's positions to 0
  UPDATE public.positions
     SET settlement_amount = 0
   WHERE user_id = p_user_id;

  v_bal := 0;
  v_sett := 0;
  
  FOR r_tx IN 
    SELECT id, type, amount, ref_id
      FROM public.transactions 
     WHERE user_id = p_user_id 
       AND status = 'APPROVED'
       AND type NOT IN ('MARGIN_DEBIT', 'MARGIN_CREDIT')
     ORDER BY created_at ASC, id ASC
  LOOP
    v_change := CASE 
                  WHEN r_tx.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT') 
                  THEN r_tx.amount
                  ELSE -r_tx.amount
                END;
    v_bal := v_bal + v_change;
    
    IF v_bal < 0 THEN
      -- The shortfall is -v_bal.
      -- Attribute this shortfall to the position associated with this transaction.
      v_pos_id := NULL;
      
      IF r_tx.ref_id IS NOT NULL THEN
        -- Case 1: ref_id is directly a position UUID
        IF r_tx.ref_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
          SELECT id INTO v_pos_id 
            FROM public.positions 
           WHERE id = r_tx.ref_id::UUID;
        
        -- Case 2: ref_id starts with BKG_EXIT_ followed by UUID
        ELSIF r_tx.ref_id LIKE 'BKG_EXIT_%' THEN
          DECLARE
            v_ref_uuid_str TEXT := substring(r_tx.ref_id from 10);
          BEGIN
            IF v_ref_uuid_str ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
              SELECT id INTO v_pos_id 
                FROM public.positions 
               WHERE id = v_ref_uuid_str::UUID;
            END IF;
          END;
          
        -- Case 3: ref_id starts with BKG_, BUF_, or MADJ_ followed by UUID
        ELSIF r_tx.ref_id LIKE 'BKG_%' OR r_tx.ref_id LIKE 'BUF_%' OR r_tx.ref_id LIKE 'MADJ_%' THEN
          DECLARE
            v_ref_uuid_str TEXT;
            v_ref_uuid     UUID;
          BEGIN
            IF r_tx.ref_id LIKE 'BKG_%' OR r_tx.ref_id LIKE 'BUF_%' THEN
              v_ref_uuid_str := substring(r_tx.ref_id from 5);
            ELSE
              v_ref_uuid_str := substring(r_tx.ref_id from 6);
            END IF;
            
            IF v_ref_uuid_str ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
              v_ref_uuid := v_ref_uuid_str::UUID;
              
              -- Check if this UUID is directly a position
              SELECT id INTO v_pos_id 
                FROM public.positions 
               WHERE id = v_ref_uuid;
               
              -- If not found, check if it's an order ID mapped via executions -> trades
              IF v_pos_id IS NULL THEN
                SELECT position_id INTO v_pos_id
                  FROM public.trades
                 WHERE id = (SELECT trade_id FROM public.executions WHERE order_id = v_ref_uuid LIMIT 1);
              END IF;
            END IF;
          END;
        END IF;
      END IF;

      -- If we found a valid position, add the shortfall to its settlement_amount
      IF v_pos_id IS NOT NULL THEN
        UPDATE public.positions
           SET settlement_amount = COALESCE(settlement_amount, 0) + (-v_bal)
         WHERE id = v_pos_id;
      END IF;

      v_sett := v_sett + v_bal;
      v_bal := 0;
    END IF;
  END LOOP;
  
  UPDATE public.profiles
     SET balance = v_bal,
         settlement_amount = v_sett,
         updated_at = now()
   WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Redefine public.rebaseline_profile_balances to leverage the user-level rebaseline logic
CREATE OR REPLACE FUNCTION public.rebaseline_profile_balances()
RETURNS void AS $$
DECLARE
  r_profile RECORD;
BEGIN
  FOR r_profile IN SELECT id FROM public.profiles LOOP
    PERFORM public.rebaseline_user_profile_balance(r_profile.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Redefine the trigger function sync_profile_balance to call rebaseline_user_profile_balance
CREATE OR REPLACE FUNCTION public.sync_profile_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id       uuid;
BEGIN
  -- Skip margin transactions so they don't trigger re-baselining
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    IF NEW.type IN ('MARGIN_DEBIT', 'MARGIN_CREDIT') THEN
      RETURN NEW;
    END IF;
    v_user_id := NEW.user_id;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.type IN ('MARGIN_DEBIT', 'MARGIN_CREDIT') THEN
      RETURN OLD;
    END IF;
    v_user_id := OLD.user_id;
  END IF;

  IF v_user_id IS NOT NULL THEN
    PERFORM public.rebaseline_user_profile_balance(v_user_id);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Run re-baselining once to correct all existing user balances and positions
SELECT public.rebaseline_profile_balances();
