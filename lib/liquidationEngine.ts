/**
 * Account-Level Liquidation Engine
 *
 * Implements the new liquidation model:
 *   1. Liquidation threshold is account-level (not per-position)
 *   2. threshold = -(walletBalance × liquidationPercentage / 100)
 *   3. When total floating PnL across ALL open positions breaches this threshold,
 *      ALL positions are auto-squared-off immediately.
 *   4. If the resulting balance goes negative, the deficit is stored as
 *      settlement_amount (never auto-recovered from future deposits).
 *
 * Used margin is frozen at trade entry (locked_margin), not dynamically recalculated.
 *
 * Called from the matching engine on EVERY price tick (once per second) so that
 * liquidation fires the moment the 90% loss level is breached — not with a delay.
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

  // ── Step 1: Compute threshold against the balance passed in ─────────────
  // balance is already fetched live from DB by the matching engine before
  // this call (one DB read per user per tick), so this is the freshest value
  // available without an additional round-trip.
  const threshold = computeLiquidationThreshold(balance, autoSqoffPercent);

  // Not yet at liquidation level — return early, nothing to do
  if (totalFloatingPnl > threshold) {
    return { liquidated: false, positionsClosed: 0, totalPnl: totalFloatingPnl, settlementAmount: 0 };
  }

  // ── Step 2: Double-check with a live balance re-fetch ───────────────────
  // Between the balance fetch in the matching engine and this point, a deposit
  // or admin credit could have increased the balance — which would raise the
  // threshold and potentially make the liquidation no longer warranted.
  // Re-fetch to avoid liquidating an account that just topped up.
  let confirmedBalance = balance;
  try {
    const { data: liveProfile } = await admin
      .from('profiles')
      .select('balance, auto_sqoff')
      .eq('id', userId)
      .single();

    if (liveProfile) {
      confirmedBalance = Number(liveProfile.balance ?? balance);
      const confirmedAutoSqoff = Number(liveProfile.auto_sqoff ?? autoSqoffPercent);
      const confirmedThreshold = computeLiquidationThreshold(confirmedBalance, confirmedAutoSqoff);

      if (totalFloatingPnl > confirmedThreshold) {
        // Deposit just arrived — account is actually fine now
        return { liquidated: false, positionsClosed: 0, totalPnl: totalFloatingPnl, settlementAmount: 0 };
      }
    }
  } catch {
    // DB error — proceed with the original balance; better to fire than miss
  }

  // ─── LIQUIDATION CONFIRMED ───────────────────────────────────────────────
  const confirmedThreshold = computeLiquidationThreshold(confirmedBalance, autoSqoffPercent);
  console.warn(
    `[LiquidationEngine] ⚠️  LIQUIDATION TRIGGERED for user ${userId}. ` +
    `Balance: ₹${confirmedBalance.toFixed(2)}, ` +
    `FloatingPnL: ₹${totalFloatingPnl.toFixed(2)}, ` +
    `Threshold: ₹${confirmedThreshold.toFixed(2)} (${autoSqoffPercent}%). ` +
    `Closing ${positions.length} position(s) immediately.`,
  );

  const previousBalance = confirmedBalance;
  let positionsClosed = 0;

  // ── Step 3: Cancel ALL pending orders for this user ────────────────────
  // Pending LIMIT/SL/GTT orders must be cancelled at the same time as positions
  // are closed — otherwise they could execute after liquidation and re-open
  // the account into a position it can no longer afford.
  const { error: cancelErr } = await admin
    .from('orders')
    .update({ status: 'CANCELLED', info: 'AUTO_LIQUIDATION' })
    .eq('user_id', userId)
    .eq('status', 'PENDING');

  if (cancelErr) {
    console.error(`[LiquidationEngine] Failed to cancel pending orders for user ${userId}:`, cancelErr.message);
  }

  // ── Step 4: Close ALL open positions as fast as possible ────────────────
  // Sequential RPCs ensure each position gets its own PnL transaction and the
  // balance trigger fires correctly.  Parallel would risk racing the trigger.
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
      console.error(`[LiquidationEngine] Failed to close position ${pos.id}:`, closeErr.message);
    } else {
      positionsClosed++;
    }
  }

  // ── Step 4: Read final balance to determine settlement amount ────────────
  const { data: updatedProfile } = await admin
    .from('profiles')
    .select('balance, settlement_amount')
    .eq('id', userId)
    .single();

  const settlementAmount = Math.abs(Number(updatedProfile?.settlement_amount || 0));
  const finalLoss = Math.abs(totalFloatingPnl);

  // ── Step 5: Create settlement record if balance went negative ────────────
  if (settlementAmount > 0) {
    await admin.from('settlement_records').insert({
      user_id: userId,
      settlement_amount: settlementAmount,
      liquidation_event: 'AUTO_LIQUIDATION',
      previous_balance: previousBalance,
      final_loss: finalLoss,
      positions_closed: positionsClosed,
      notes:
        `Auto-liquidation at ${autoSqoffPercent}% threshold. ` +
        `Threshold: ₹${confirmedThreshold.toFixed(2)}, ` +
        `Floating PnL at trigger: ₹${totalFloatingPnl.toFixed(2)}`,
    });
  }

  // ── Step 6: Notify the user ──────────────────────────────────────────────
  await admin.from('notifications').insert({
    user_id: userId,
    type: 'GENERAL',
    title: '⚠️ Account Liquidated — All positions squared off',
    message:
      `Your account was auto-liquidated because total losses ` +
      `(₹${Math.abs(totalFloatingPnl).toFixed(2)}) exceeded ${autoSqoffPercent}% of your balance ` +
      `(threshold: ₹${Math.abs(confirmedThreshold).toFixed(2)}). ` +
      `${positionsClosed} position(s) were closed.` +
      (settlementAmount > 0 ? ` Outstanding settlement: ₹${settlementAmount.toFixed(2)}.` : ''),
    read: false,
    created_at: new Date().toISOString(),
  });

  // ── Step 7: Audit log ────────────────────────────────────────────────────
  await admin.from('act_logs').insert({
    type: 'AUTO_SQUARE_OFF',
    user_id: userId,
    target_user_id: userId,
    reason:
      `ACCOUNT_LIQUIDATION (${autoSqoffPercent}%): ${positionsClosed} positions closed. ` +
      `Balance: ₹${previousBalance.toFixed(2)}, ` +
      `FloatingPnL: ₹${totalFloatingPnl.toFixed(2)}, ` +
      `Threshold: ₹${confirmedThreshold.toFixed(2)}` +
      (settlementAmount > 0 ? `, Settlement: ₹${settlementAmount.toFixed(2)}` : ''),
  });

  return {
    liquidated: true,
    positionsClosed,
    totalPnl: totalFloatingPnl,
    settlementAmount,
  };
}
