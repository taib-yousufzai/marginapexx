import { SupabaseClient } from '@supabase/supabase-js';
import { getAdminClient } from './adminClient.ts';

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
      } else if (orderType === 'GTT') {
        if (triggerPrice !== null) {
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
        }

        // Support GTT exit orders which have stop_loss or target or both
        const stopLoss = order.stop_loss ? Number(order.stop_loss) : null;
        const target = order.target ? Number(order.target) : null;
        if (!shouldTrigger && stopLoss !== null) {
          if (side === 'BUY') {
            if (ltp >= stopLoss) shouldTrigger = true;
          } else if (side === 'SELL') {
            if (ltp <= stopLoss) shouldTrigger = true;
          }
        }
        if (!shouldTrigger && target !== null) {
          if (side === 'BUY') {
            if (ltp <= target) shouldTrigger = true;
          } else if (side === 'SELL') {
            if (ltp >= target) shouldTrigger = true;
          }
        }

        if (shouldTrigger) {
          // GTT triggers execute at market price (LTP)
          fillPrice = ltp;
        }
      }

      if (shouldTrigger) {
        console.log(`[Order Matching] Triggering order ${order.id} (${side} ${orderType} ${order.symbol}) at LTP: ${ltp}, Fill: ${fillPrice}`);

          const { data: existingPos, error: posErrorCheck } = await admin
            .from('positions')
            .select('id, side')
            .eq('symbol', symbolKey)
            .eq('status', 'open');

        if (posErrorCheck) {
          console.error('[Order Matching] Error checking existing positions for', symbolKey, ':', posErrorCheck);
          // Skip processing this order due to error
          continue;
        }

        // Determine if order should proceed based on existing positions
        if (order.side === 'BUY') {
          // BUY orders can proceed unless there is an opposite SELL position open
          if (existingPos && existingPos.some((p: any) => p.side === 'SELL')) {
            console.log(`[Order Matching] Skipping BUY order ${order.id} due to existing opposite SELL position`);
            continue;
          }
        } else if (order.side === 'SELL') {
          // SELL orders require an existing BUY position
          if (!existingPos || !existingPos.some((p: any) => p.side === 'BUY')) {
            console.log(`[Order Matching] Skipping SELL order ${order.id} as no open BUY position exists`);
            continue;
          }
        }

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

        // 2. Call the unified Postgres RPC to process positions atomically
        const { error: rpcErr } = await admin.rpc('process_executed_position', {
          p_order_id: order.id,
        });

        if (rpcErr) {
          console.error(`[Order Matching] Failed to process executed position for order ${order.id}:`, rpcErr);
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

  // 2. PROCESS OPEN POSITIONS
  const { data: openPositions, error: posError } = await admin
    .from('positions')
    .select('*')
    .eq('status', 'open');

  if (posError) {
    console.error('[Order Matching] Error fetching open positions:', posError);
  } else if (openPositions && openPositions.length > 0) {
    console.log(`[Order Matching] Found ${openPositions.length} open positions to evaluate.`);

    // Group open positions by user_id
    const userOpenPositions: Record<string, any[]> = {};
    for (const pos of openPositions) {
      if (!userOpenPositions[pos.user_id]) {
        userOpenPositions[pos.user_id] = [];
      }
      userOpenPositions[pos.user_id].push(pos);
    }

    const closedPositionIds = new Set<string>();

    // Evaluate Drawdown Limit per user
    for (const [userId, userPositions] of Object.entries(userOpenPositions)) {
      // 1. Fetch user profile
      const { data: profile, error: profileErr } = await admin
        .from('profiles')
        .select('balance, auto_sqoff')
        .eq('id', userId)
        .single();

      if (profileErr || !profile) {
        console.error(`[Order Matching] Error fetching profile for user ${userId}:`, profileErr);
        continue;
      }

      const balance = Number(profile.balance || 0);
      const autoSqoffPercent = Number(profile.auto_sqoff ?? 90);

      // Guard: Bypass if balance is 0/negative or auto_sqoff is disabled (<= 0)
      if (balance <= 0 || autoSqoffPercent <= 0) {
        continue;
      }

      const drawdownLimit = - (autoSqoffPercent / 100.0) * balance;

      // 2. Fetch segment settings for this user (to get entry buffers for SELL exits)
      const { data: segSettings } = await admin
        .from('segment_settings')
        .select('segment, side, entry_buffer')
        .eq('user_id', userId);

      const settingsMap = new Map<string, number>();
      if (segSettings) {
        for (const s of segSettings) {
          settingsMap.set(`${s.segment}|${s.side}`, Number(s.entry_buffer ?? 0.003));
        }
      }

      // 3. Compute live Floating P/L and resolve LTP/Prices for each position
      let totalUnrealised = 0;
      const resolvedPositions = [];

      for (const pos of userPositions) {
        let ltp = pricesMap.get(pos.symbol);

        if (ltp === undefined && pos.settlement) {
          const exchange = pos.settlement.startsWith('OPT') || pos.settlement.startsWith('FUT') ? 'NFO' : 'NSE';
          ltp = pricesMap.get(`${exchange}:${pos.symbol}`);
        }

        // Fallback
        if (ltp === undefined || ltp <= 0) {
          ltp = Number(pos.ltp ?? pos.entry_price);
        }

        const entryPrice = Number(pos.entry_price ?? pos.avg_price);
        const qty = Number(pos.qty_open ?? 0);
        const buffer = settingsMap.get(`${pos.settlement}|BUY`) ?? 0.003;
        const pnl = pos.side === 'BUY' 
          ? ((ltp * 1.001 + ltp * buffer) - entryPrice) * qty 
          : (entryPrice - (ltp * 0.999)) * qty;

        totalUnrealised += pnl;

        resolvedPositions.push({
          pos,
          ltp,
          pnl
        });
      }

      // 4. Check if user hit drawdown limit
      if (totalUnrealised <= drawdownLimit && userPositions.length > 0) {
        console.log(`[Order Matching] DRAWDOWN TRIGGERED for user ${userId}. Total Unrealised: ${totalUnrealised}, Limit: ${drawdownLimit} (${autoSqoffPercent}% of ${balance}). Closing all positions.`);

        for (const item of resolvedPositions) {
          const pos = item.pos;
          const ltp = item.ltp;

          // Calculate exit price
          let exitPrice = ltp;
          if (pos.side === 'BUY') {
            // Exiting BUY (Selling) -> executes at Bid Price = ltp * 0.999
            exitPrice = ltp * 0.999;
          } else {
            // Exiting SELL (Buying) -> executes at Ask Price = ltp * (1.001 + entryBuffer)
            const buffer = settingsMap.get(`${pos.settlement}|BUY`) ?? 0.003;
            exitPrice = ltp * (1.001 + buffer);
          }

          console.log(`[Order Matching] Liquidation Close for position ${pos.id} (${pos.symbol}). LTP: ${ltp}, Exit Price: ${exitPrice}`);

          const { error: closeRpcErr } = await admin.rpc('close_position', {
            p_position_id: pos.id,
            p_user_id: pos.user_id,
            p_ltp: ltp,
            p_exit_price: exitPrice,
            p_closed_by: 'AUTO_SQOFF',
          });

          if (closeRpcErr) {
            console.error(`[Order Matching] Failed to close position ${pos.id} via close_position RPC during drawdown:`, closeRpcErr);
          } else {
            closedPositionIds.add(pos.id);
          }
        }
      }
    }

    // 5. PROCESS REMAINING OPEN POSITIONS FOR STOP LOSS AND TARGET
    for (const pos of openPositions) {
      if (closedPositionIds.has(pos.id)) {
        continue; // Already closed by drawdown limit
      }

      let ltp = pricesMap.get(pos.symbol);

      if (ltp === undefined && pos.settlement) {
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

        // Calculate exit price
        let exitPrice = ltp;
        if (pos.side === 'BUY') {
          exitPrice = ltp * 0.999;
        } else {
          // Fetch buffer for this user
          const { data: segSet } = await admin
            .from('segment_settings')
            .select('entry_buffer')
            .eq('user_id', pos.user_id)
            .eq('segment', pos.settlement)
            .eq('side', 'BUY')
            .maybeSingle();
          const buffer = Number(segSet?.entry_buffer ?? 0.003);
          exitPrice = ltp * (1.001 + buffer);
        }

        const { error: closeRpcErr } = await admin.rpc('close_position', {
          p_position_id: pos.id,
          p_user_id: pos.user_id,
          p_ltp: ltp,
          p_exit_price: exitPrice,
          p_closed_by: closeReason,
        });

        if (closeRpcErr) {
          console.error(`[Order Matching] Failed to close position ${pos.id} via close_position RPC:`, closeRpcErr);
        }
      } else {
        // If not closed, update the position's LTP and real-time P&L in the database
        const qty = Number(pos.qty_open ?? 0);
        let pnl = 0;
        if (side === 'BUY') {
          const { data: segSet } = await admin
            .from('segment_settings')
            .select('entry_buffer')
            .eq('user_id', pos.user_id)
            .eq('segment', pos.settlement)
            .eq('side', 'BUY')
            .maybeSingle();
          const buffer = Number(segSet?.entry_buffer ?? 0.003);
          pnl = ((ltp * 1.001 + ltp * buffer) - entryPrice) * qty;
        } else {
          pnl = (entryPrice - (ltp * 0.999)) * qty;
        }

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
