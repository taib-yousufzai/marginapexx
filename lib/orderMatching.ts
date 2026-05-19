import { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from './adminClient';

export interface Quote {
  id: string; // e.g. "NSE:INFY"
  last_price: number;
}

/**
 * Iterates over all PENDING orders and open positions to check if they need to be triggered or updated.
 * Driven by the daily/regular price sync.
 */
export async function processPendingOrdersAndPositions(quotes: Quote[]): Promise<void> {
  const admin = getAdminClient();

  if (!quotes || quotes.length === 0) return;

  // Build a lookup map of prices for fast access
  const pricesMap = new Map<string, number>();
  for (const quote of quotes) {
    pricesMap.set(quote.id, quote.last_price);
  }

  // 1. PROCESS PENDING ORDERS
  const { data: pendingOrders, error: ordersError } = await admin
    .from('orders')
    .select('*')
    .eq('status', 'PENDING');

  if (ordersError) {
    console.error('[Order Matching] Error fetching pending orders:', ordersError);
  } else if (pendingOrders && pendingOrders.length > 0) {
    console.log(`[Order Matching] Found ${pendingOrders.length} pending orders to evaluate.`);

    for (const order of pendingOrders) {
      const symbolKey = order.kite_instrument || order.symbol;
      const ltp = pricesMap.get(symbolKey);

      if (ltp === undefined || ltp <= 0) {
        continue; // No price update for this symbol in the current batch
      }

      let shouldTrigger = false;
      let fillPrice = Number(order.price ?? ltp);

      const orderType = order.order_type;
      const side = order.side;
      const triggerPrice = order.trigger_price ? Number(order.trigger_price) : null;
      const limitPrice = order.price ? Number(order.price) : null;

      if (orderType === 'LIMIT' && limitPrice !== null) {
        if (side === 'BUY' && ltp <= limitPrice) {
          shouldTrigger = true;
        } else if (side === 'SELL' && ltp >= limitPrice) {
          shouldTrigger = true;
        }
      } else if ((orderType === 'SL' || orderType === 'SLM') && triggerPrice !== null) {
        if (side === 'BUY' && ltp >= triggerPrice) {
          shouldTrigger = true;
          // SLM executes at market price (LTP)
          if (orderType === 'SLM') {
            fillPrice = ltp;
          }
        } else if (side === 'SELL' && ltp <= triggerPrice) {
          shouldTrigger = true;
          // SLM executes at market price (LTP)
          if (orderType === 'SLM') {
            fillPrice = ltp;
          }
        }
      } else if (orderType === 'GTT' && triggerPrice !== null) {
        // GTT trigger logic based on entry direction
        const ltpAtEntry = order.ltp_at_entry ? Number(order.ltp_at_entry) : null;
        if (side === 'BUY') {
          if (ltpAtEntry !== null && ltpAtEntry < triggerPrice) {
            // Entered below trigger (breakout buy), trigger when we rise above it
            if (ltp >= triggerPrice) shouldTrigger = true;
          } else {
            // Entered above trigger (buy the dip), trigger when we drop below it
            if (ltp <= triggerPrice) shouldTrigger = true;
          }
        } else if (side === 'SELL') {
          if (ltpAtEntry !== null && ltpAtEntry > triggerPrice) {
            // Entered above trigger (stop loss), trigger when we drop below it
            if (ltp <= triggerPrice) shouldTrigger = true;
          } else {
            // Entered below trigger (target / breakout sell), trigger when we rise above it
            if (ltp >= triggerPrice) shouldTrigger = true;
          }
        }

        if (shouldTrigger) {
          // GTT triggers execute at market price (LTP)
          fillPrice = ltp;
        }
      }

      if (shouldTrigger) {
        console.log(`[Order Matching] Triggering order ${order.id} (${side} ${orderType} ${order.symbol}) at LTP: ${ltp}, Fill: ${fillPrice}`);

        // 1. Mark order as EXECUTED and set fill_price
        const { error: updateOrderErr } = await admin
          .from('orders')
          .update({
            status: 'EXECUTED',
            fill_price: fillPrice,
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.id);

        if (updateOrderErr) {
          console.error(`[Order Matching] Failed to update order ${order.id} to EXECUTED:`, updateOrderErr);
          continue;
        }

        // 2. Open a position for the user
        const { error: insertPosErr } = await admin
          .from('positions')
          .insert({
            user_id: order.user_id,
            symbol: order.symbol,
            side: order.side,
            status: 'open',
            qty_total: order.qty,
            qty_open: order.qty,
            avg_price: fillPrice,
            entry_price: fillPrice,
            ltp: ltp,
            settlement: order.segment,
            stop_loss: order.stop_loss,
            sl: order.stop_loss, // Populate both sl and stop_loss for safety
            target: order.target,
            tp: order.target, // Populate both tp and target for safety
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (insertPosErr) {
          console.error(`[Order Matching] Failed to create position for order ${order.id}:`, insertPosErr);
        }

        // 3. Write audit log
        await admin.from('act_logs').insert({
          type: 'ORDER_EXECUTION',
          user_id: order.user_id,
          target_user_id: order.user_id,
          symbol: order.symbol,
          qty: order.qty,
          price: fillPrice,
          reason: `${orderType} Order Triggered @ ${ltp}`,
        });
      }
    }
  }

  // 2. PROCESS OPEN POSITIONS FOR STOP LOSS AND TARGET
  const { data: openPositions, error: posError } = await admin
    .from('positions')
    .select('*')
    .eq('status', 'open');

  if (posError) {
    console.error('[Order Matching] Error fetching open positions:', posError);
  } else if (openPositions && openPositions.length > 0) {
    console.log(`[Order Matching] Found ${openPositions.length} open positions to evaluate.`);

    for (const pos of openPositions) {
      // Check if we have the symbol's LTP.
      // Pos symbol might be just the name (e.g. INFY), or it could have exchange prefix.
      // We check both the symbol directly and with the prefix from orders segment or settlement.
      let ltp = pricesMap.get(pos.symbol);

      if (ltp === undefined && pos.settlement) {
        // Try exchange:symbol format
        const exchange = pos.settlement.startsWith('OPT') || pos.settlement.startsWith('FUT') ? 'NFO' : 'NSE';
        ltp = pricesMap.get(`${exchange}:${pos.symbol}`);
      }

      if (ltp === undefined || ltp <= 0) {
        continue; // No price update in this batch
      }

      let shouldClose = false;
      let closeReason = 'AUTO_SQOFF';

      const stopLoss = pos.stop_loss ? Number(pos.stop_loss) : (pos.sl ? Number(pos.sl) : null);
      const target = pos.target ? Number(pos.target) : (pos.tp ? Number(pos.tp) : null);
      const side = pos.side;
      const entryPrice = Number(pos.entry_price ?? pos.avg_price);

      // Check Stop Loss
      if (stopLoss !== null && stopLoss > 0) {
        if (side === 'BUY' && ltp <= stopLoss) {
          shouldClose = true;
          closeReason = 'AUTO_SL';
        } else if (side === 'SELL' && ltp >= stopLoss) {
          shouldClose = true;
          closeReason = 'AUTO_SL';
        }
      }

      // Check Target
      if (!shouldClose && target !== null && target > 0) {
        if (side === 'BUY' && ltp >= target) {
          shouldClose = true;
          closeReason = 'AUTO_TARGET';
        } else if (side === 'SELL' && ltp <= target) {
          shouldClose = true;
          closeReason = 'AUTO_TARGET';
        }
      }

      if (shouldClose) {
        console.log(`[Order Matching] Triggering auto-exit for position ${pos.id} (${side} ${pos.symbol}) due to ${closeReason}. LTP: ${ltp}, SL: ${stopLoss}, Target: ${target}`);

        // Call the close_position RPC function to handle full settlement and exit order creation
        const { error: closeRpcErr } = await admin.rpc('close_position', {
          p_position_id: pos.id,
          p_user_id: pos.user_id,
          p_ltp: ltp,
          p_exit_price: ltp,
          p_closed_by: closeReason,
        });

        if (closeRpcErr) {
          console.error(`[Order Matching] Failed to close position ${pos.id} via close_position RPC:`, closeRpcErr);
        }
      } else {
        // If not closed, update the position's LTP and real-time P&L in the database
        const qty = Number(pos.qty_open ?? 0);
        const pnl = side === 'BUY' 
          ? (ltp - entryPrice) * qty 
          : (entryPrice - ltp) * qty;

        const { error: updatePosErr } = await admin
          .from('positions')
          .update({
            ltp: ltp,
            pnl: pnl,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pos.id);

        if (updatePosErr) {
          console.error(`[Order Matching] Failed to update LTP/PNL for position ${pos.id}:`, updatePosErr);
        }
      }
    }
  }
}
