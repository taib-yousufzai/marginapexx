const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sql = `
CREATE OR REPLACE FUNCTION public.calculate_position_margin()
RETURNS trigger AS $$
DECLARE
  v_leverage      numeric;
  v_leverage_type text;
  v_parent_id     uuid;
  v_trading_mode  text;
  v_lot_size      numeric := 1;
  v_lots          numeric;
  v_computed_margin numeric;
  v_settings_table  text;
BEGIN
  IF NEW.status = 'closed' OR NEW.qty_open = 0 THEN
    NEW.margin_required := 0;
    IF TG_OP = 'UPDATE' AND OLD.locked_margin > 0 THEN
      INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
      VALUES (NEW.user_id, 'MARGIN_CREDIT', OLD.locked_margin, 'APPROVED', 'MRG_RET_' || NEW.id::text);
      NEW.locked_margin := 0;
    END IF;
    RETURN NEW;
  END IF;

  SELECT trading_mode INTO v_trading_mode FROM public.profiles WHERE id = NEW.user_id;
  IF v_trading_mode = 'scalper' THEN v_settings_table := 'scalper_segment_settings'; ELSE v_settings_table := 'segment_settings'; END IF;

  IF v_settings_table = 'scalper_segment_settings' THEN
    SELECT CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END, CASE WHEN NEW.product_type = 'CARRY' THEN holding_type ELSE intraday_type END INTO v_leverage, v_leverage_type FROM public.scalper_segment_settings WHERE user_id = NEW.user_id AND segment = NEW.settlement AND side = NEW.side;
  ELSE
    SELECT CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END, CASE WHEN NEW.product_type = 'CARRY' THEN holding_type ELSE intraday_type END INTO v_leverage, v_leverage_type FROM public.segment_settings WHERE user_id = NEW.user_id AND segment = NEW.settlement AND side = NEW.side;
  END IF;

  IF v_leverage IS NULL THEN
    SELECT parent_id::uuid INTO v_parent_id FROM public.profiles WHERE id = NEW.user_id;
    IF v_parent_id IS NOT NULL THEN
      IF v_settings_table = 'scalper_segment_settings' THEN
        SELECT CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END, CASE WHEN NEW.product_type = 'CARRY' THEN holding_type ELSE intraday_type END INTO v_leverage, v_leverage_type FROM public.scalper_segment_settings WHERE user_id = v_parent_id AND segment = NEW.settlement AND side = NEW.side;
      ELSE
        SELECT CASE WHEN NEW.product_type = 'CARRY' THEN holding_leverage ELSE intraday_leverage END, CASE WHEN NEW.product_type = 'CARRY' THEN holding_type ELSE intraday_type END INTO v_leverage, v_leverage_type FROM public.segment_settings WHERE user_id = v_parent_id AND segment = NEW.settlement AND side = NEW.side;
      END IF;
    END IF;
  END IF;

  IF v_leverage IS NULL OR v_leverage <= 0 THEN
    v_leverage_type := 'Multiplier';
    IF NEW.settlement LIKE '%FOREX%' OR NEW.settlement LIKE '%CDS%' THEN v_leverage := CASE WHEN NEW.product_type = 'CARRY' THEN 10 ELSE 100 END; ELSIF NEW.settlement LIKE '%CRYPTO%' THEN v_leverage := CASE WHEN NEW.product_type = 'CARRY' THEN 1 ELSE 10 END; ELSE v_leverage := CASE WHEN NEW.product_type = 'CARRY' THEN 5 ELSE 50 END; END IF;
  END IF;

  IF v_leverage_type IS NULL OR v_leverage_type = '' THEN v_leverage_type := 'Multiplier'; END IF;

  -- 100% margin on Option BUYs
  IF NEW.settlement LIKE '%OPT%' AND NEW.side = 'BUY' THEN
    v_computed_margin := (NEW.qty_open * NEW.entry_price);
  ELSE
    IF v_leverage_type = '%' THEN
      v_computed_margin := (NEW.qty_open * NEW.entry_price) * (v_leverage / 100.0);
    ELSIF v_leverage_type = 'Fixed' THEN
      SELECT lot_size INTO v_lot_size FROM public.script_settings WHERE NEW.symbol LIKE '%' || symbol || '%' ORDER BY length(symbol) DESC LIMIT 1;
      IF v_lot_size IS NULL OR v_lot_size <= 0 THEN
        IF NEW.symbol LIKE '%BANKNIFTY%' OR NEW.symbol LIKE '%BANKEX%' THEN v_lot_size := 15; ELSIF NEW.symbol LIKE '%FINNIFTY%' THEN v_lot_size := 25; ELSIF NEW.symbol LIKE '%MIDCP%' OR NEW.symbol LIKE '%MIDCAP%' THEN v_lot_size := 50; ELSIF NEW.symbol LIKE '%SENSEX%' THEN v_lot_size := 10; ELSIF NEW.symbol LIKE '%NIFTY%' THEN v_lot_size := 25; ELSIF NEW.symbol LIKE '%GOLDM%' THEN v_lot_size := 10; ELSIF NEW.symbol LIKE '%GOLD%' THEN v_lot_size := 100; ELSIF NEW.symbol LIKE '%SILVERM%' THEN v_lot_size := 5; ELSIF NEW.symbol LIKE '%SILVER%' THEN v_lot_size := 30; ELSIF NEW.symbol LIKE '%CRUDEOILM%' THEN v_lot_size := 10; ELSIF NEW.symbol LIKE '%CRUDEOIL%' THEN v_lot_size := 100; ELSIF NEW.symbol LIKE '%NATGASMINI%' THEN v_lot_size := 250; ELSIF NEW.symbol LIKE '%NATURALGAS%' THEN v_lot_size := 1250; ELSE v_lot_size := 1; END IF;
      END IF;
      v_lots := NEW.qty_open / v_lot_size;
      v_computed_margin := v_lots * v_leverage;
    ELSE
      v_computed_margin := (NEW.qty_open * NEW.entry_price) / v_leverage;
    END IF;
  END IF;

  NEW.margin_required := v_computed_margin;

  IF TG_OP = 'INSERT' THEN
    NEW.locked_margin := v_computed_margin;
  ELSIF TG_OP = 'UPDATE' THEN
    IF v_computed_margin > OLD.locked_margin THEN
      INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
      VALUES (NEW.user_id, 'MARGIN_DEBIT', v_computed_margin - OLD.locked_margin, 'APPROVED', 'MRG_ADJ_' || NEW.id::text);
      NEW.locked_margin := v_computed_margin;
    ELSIF v_computed_margin < OLD.locked_margin THEN
      INSERT INTO public.transactions (user_id, type, amount, status, ref_id)
      VALUES (NEW.user_id, 'MARGIN_CREDIT', OLD.locked_margin - v_computed_margin, 'APPROVED', 'MRG_ADJ_' || NEW.id::text);
      NEW.locked_margin := v_computed_margin;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

async function main() {
  const { data, error } = await supabase.rpc('exec_sql', { query: sql });
  if (error) {
    console.error('SQL Execution Error:', error);
  } else {
    console.log('Migration applied successfully:', data);
  }
}

main();
