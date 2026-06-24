/**
 * Account-Level Liquidation Engine
 *
 * Implements the new liquidation model:
 *   1. Liquidation threshold is account-level (not per-position)
 *   2. liquidationPnL = -(WalletBalance × LiquidationPercentage)
 *   3. When total floating PnL across ALL positions breaches this threshold,
 *      ALL positions are auto-squared-off
 *   4. If the resulting balance goes negative, settlement records are created
 *
 * Used margin is frozen at trade entry (locked_margin), not dynamically recalculated.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface LiquidationResult {
  liquidated: boolean;
  positionsClosed: number;
  totalPnl: number;
  settlementAmount: number;
  error?: string;
}

export interface PositionForLiquidation {
  id: string;
  user_id: string;
  symbol: string;
  side: string;
  qty_open: number;
  entry_price: number;
  settlement: string;
  product_type: string;
  ltp?: number;
}

/**
 * Computes the account-level liquidation threshold.
 *
 * liquidationPnL = -(balance × liquidationPercentage / 100)
 *
 * Example: balance = ₹920, percentage = 90% → threshold = -₹828
 * When total floating PnL reaches -₹828 or worse, liquidation triggers.
 */
export function computeLiquidationThreshold(
  walletBalance: number,
  liquidationPercentage: number,
): number {
  if (walletBalance <= 0 || liquidationPercentage <= 0) return 0;
  return -(walletBalance * (liquidationPercentage / 100));
}

/**
 * Computes free margin from frozen locked margins.
 *
 * Free Margin = Wallet Balance - Sum(locked_margins)
 *
 * This does NOT include floating PnL — free margin is purely
 * how much capital is available for new trades.
 */
export function computeFreeMargin(
  walletBalance: number,
  totalLockedMargin: number,
): number {
  return walletBalance - totalLockedMargin;
}

/**
 * Check whether an account should be liquidated and execute if so.
 *
 * This is the main entry point called from the matching engine on every tick batch.
 *
 * @param userId - The user ID to check
 * @param balance - Current wallet balance (already post-brokerage)
 * @param autoSqoffPercent - Liquidation percentage (from profiles.auto_sqoff, default 90)
 * @param positions - All open positions with their current PnL
 * @param exitBuffers - Map of `userId|settlement|side` → exit_buffer for computing exit prices
 * @param admin - Supabase admin client
 */
export async function checkAndExecuteAccountLiquidation(
  userId: string,
  balance: number,
  autoSqoffPercent: number,
  positions: PositionForLiquidation[],
  totalFloatingPnl: number,
  exitBuffers: Map<string, { exit_buffer: number }>,
  admin: SupabaseClient,
): Promise<LiquidationResult> {
  if (autoSqoffPercent <= 0 || positions.length === 0) {
    return { liquidated: false, positionsClosed: 0, totalPnl: 0, settlementAmount: 0 };
  }

  // Compute threshold
  const threshold = computeLiquidationThreshold(balance, autoSqoffPercent);

  // Check if total floating PnL breaches threshold
  if (totalFloatingPnl > threshold) {
    // Not yet at liquidation level
    return { liquidated: false, positionsClosed: 0, totalPnl: totalFloatingPnl, settlementAmount: 0 };
  }

  // ─── LIQUIDATION TRIGGERED ───
  console.warn(`[LiquidationEngine] LIQUIDATION TRIGGERED for user ${userId}. ` +
    `Balance: ₹${balance.toFixed(2)}, FloatingPnL: ₹${totalFloatingPnl.toFixed(2)}, ` +
    `Threshold: ₹${threshold.toFixed(2)}`);

  const previousBalance = balance;
  let positionsClosed = 0;

  // Close ALL open positions
  for (const pos of positions) {
    const ltp = Number(pos.ltp || pos.entry_price);
    const exitBufferKey = `${userId}|${pos.settlement}|${pos.side}`;
    const exitBuffer = exitBuffers.get(exitBufferKey)?.exit_buffer ?? 0.0017;

    let exitPrice: number;
    if (pos.side === 'BUY') {
      exitPrice = ltp * (1 - exitBuffer);
    } else {
      exitPrice = ltp * (1 + exitBuffer);
    }
    exitPrice = Math.round(exitPrice * 10000) / 10000;

    const { error: closeErr } = await admin.rpc('close_position', {
      p_position_id: pos.id,
      p_user_id: userId,
      p_ltp: ltp,
      p_exit_price: exitPrice,
      p_closed_by: 'AUTO_LIQUIDATION',
    });

    if (closeErr) {
      console.error(`[LiquidationEngine] Failed to close position ${pos.id}:`, closeErr);
    } else {
      positionsClosed++;
    }
  }

  // After all positions are closed, check if balance went negative
  // The sync_profile_balance trigger handles capping at 0 and routing to settlement_amount
  // We just need to create the settlement record

  // Fetch updated balance after all closes
  const { data: updatedProfile } = await admin
    .from('profiles')
    .select('balance, settlement_amount')
    .eq('id', userId)
    .single();

  const settlementAmount = Math.abs(Number(updatedProfile?.settlement_amount || 0));
  const finalLoss = Math.abs(totalFloatingPnl);

  // Create settlement record if there is a settlement amount
  if (settlementAmount > 0) {
    await admin.from('settlement_records').insert({
      user_id: userId,
      settlement_amount: settlementAmount,
      liquidation_event: 'AUTO_LIQUIDATION',
      previous_balance: previousBalance,
      final_loss: finalLoss,
      positions_closed: positionsClosed,
      notes: `Account-level liquidation triggered. Threshold: ₹${threshold.toFixed(2)}, ` +
        `Floating PnL: ₹${totalFloatingPnl.toFixed(2)}`,
    });
  }

  // Send notification to user
  await admin.from('notifications').insert({
    user_id: userId,
    type: 'GENERAL',
    title: '[Account Liquidation] All positions squared off',
    message: `Your account has been liquidated because total losses (₹${Math.abs(totalFloatingPnl).toFixed(2)}) ` +
      `exceeded the liquidation threshold (₹${Math.abs(threshold).toFixed(2)}). ` +
      `${positionsClosed} position(s) were closed.` +
      (settlementAmount > 0 ? ` Settlement amount: ₹${settlementAmount.toFixed(2)}` : ''),
    read: false,
    created_at: new Date().toISOString(),
  });

  // Audit log
  await admin.from('act_logs').insert({
    type: 'AUTO_SQUARE_OFF',
    user_id: userId,
    target_user_id: userId,
    reason: `ACCOUNT_LIQUIDATION: ${positionsClosed} positions closed. ` +
      `Balance: ₹${previousBalance.toFixed(2)}, PnL: ₹${totalFloatingPnl.toFixed(2)}, ` +
      `Threshold: ₹${threshold.toFixed(2)}` +
      (settlementAmount > 0 ? `, Settlement: ₹${settlementAmount.toFixed(2)}` : ''),
  });

  return {
    liquidated: true,
    positionsClosed,
    totalPnl: totalFloatingPnl,
    settlementAmount,
  };
}
