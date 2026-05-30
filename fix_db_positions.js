import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.log("Missing Supabase credentials in env.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Fetch open positions with QTY > 0
  const { data: positions, error: pError } = await supabase
    .from('positions')
    .select('*')
    .eq('status', 'open')
    .gt('qty_open', 0);

  if (pError) {
    console.error("Positions Error:", pError);
    return;
  }
  
  if (!positions || positions.length === 0) {
    console.log("No open positions to fix.");
    return;
  }

  console.log(`Found ${positions.length} open positions to review.`);

  for (const pos of positions) {
    // Let's find orders for this position
    const { data: orders, error: oError } = await supabase
      .from('orders')
      .select('*')
      .eq('symbol', pos.symbol)
      .eq('user_id', pos.user_id)
      .eq('status', 'EXECUTED')
      .eq('is_exit', false);

    if (oError) {
      console.error(`Error fetching orders for ${pos.symbol}:`, oError);
      continue;
    }

    // Calculate actual total qty from orders
    let totalOrderQty = 0;
    if (orders) {
       for(let o of orders) {
          totalOrderQty += o.qty;
       }
    }

    // Check for exit orders as well
    const { data: exitOrders } = await supabase
      .from('orders')
      .select('*')
      .eq('symbol', pos.symbol)
      .eq('user_id', pos.user_id)
      .eq('status', 'EXECUTED')
      .eq('is_exit', true);
      
    let totalExitQty = 0;
    if (exitOrders) {
       for(let o of exitOrders) {
          totalExitQty += o.qty;
       }
    }

    const expectedOpenQty = totalOrderQty - totalExitQty;

    if (pos.qty_open > expectedOpenQty && expectedOpenQty > 0 && pos.qty_open === expectedOpenQty * 2) {
      console.log(`Fixing position ${pos.symbol}: QTY is ${pos.qty_open} but should be ${expectedOpenQty}`);
      
      const { error: updateError } = await supabase
        .from('positions')
        .update({
          qty_open: expectedOpenQty,
          qty_total: expectedOpenQty,
          margin_required: pos.margin_required / 2
        })
        .eq('id', pos.id);

      if (updateError) {
        console.error(`Failed to update ${pos.symbol}:`, updateError);
      } else {
        console.log(`Successfully fixed ${pos.symbol}`);
      }
    } else {
        console.log(`Position ${pos.symbol} seems fine (Open: ${pos.qty_open}, Expected: ${expectedOpenQty})`);
    }
  }
}

main();
