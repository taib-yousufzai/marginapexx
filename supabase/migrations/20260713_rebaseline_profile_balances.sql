-- ==============================================================================
-- MIGRATION: Re-baseline Profile Balances
-- Date: 2026-07-13
-- Description: Recalculates and corrects the wallet balance and settlement_amount
--              for all users based on their approved, non-margin transaction history.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.rebaseline_profile_balances()
RETURNS void AS $$
DECLARE
  r_profile RECORD;
  r_tx      RECORD;
  v_bal     numeric;
  v_sett    numeric;
  v_change  numeric;
BEGIN
  FOR r_profile IN SELECT id, email FROM public.profiles LOOP
    v_bal := 0;
    v_sett := 0;
    
    FOR r_tx IN 
      SELECT type, amount 
        FROM public.transactions 
       WHERE user_id = r_profile.id 
         AND status = 'APPROVED'
         AND type NOT IN ('MARGIN_DEBIT', 'MARGIN_CREDIT')
       ORDER BY created_at ASC, id ASC
    -- Order by created_at and id to ensure deterministic sequence
    LOOP
      v_change := CASE 
                    WHEN r_tx.type IN ('DEPOSIT', 'PNL_CREDIT', 'MARGIN_ADJ_CREDIT') 
                    THEN r_tx.amount
                    ELSE -r_tx.amount
                  END;
      v_bal := v_bal + v_change;
      IF v_bal < 0 THEN
        v_sett := v_sett + v_bal;
        v_bal := 0;
      END IF;
    END LOOP;
    
    UPDATE public.profiles
       SET balance = v_bal,
           settlement_amount = v_sett,
           updated_at = now()
     WHERE id = r_profile.id;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute the re-baselining once to correct existing user balances
SELECT public.rebaseline_profile_balances();
