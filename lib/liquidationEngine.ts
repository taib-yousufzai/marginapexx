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


export function computeLiquidationThreshold(
  walletBalance: number,
  liquidationPercentage: number,
): number {
  if (walletBalance <= 0 || liquidationPercentage <= 0) return 0;
  return -(walletBalance * (liquidationPercentage / 100));
}


export function computeFreeMargin(
  walletBalance: number,
  totalLockedMargin: number,
): number {
  return walletBalance - totalLockedMargin;
}

/**
 *
 *
 * every tick batch.
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


  const threshold = computeLiquidationThreshold(balance, autoSqoffPercent);

  // Not yet at liquidation level — return early, nothing to do
  if (totalFloatingPnl > threshold) {
    console.log(
      `[LiquidationEngine] SKIP user ${userId}: ` +
      `PnL=₹${totalFloatingPnl.toFixed(2)} > threshold=₹${threshold.toFixed(2)} ` +
      `(balance=₹${balance.toFixed(2)}, sqoff=${autoSqoffPercent}%, positions=${positions.length})`,
    );
    return { liquidated: false, positionsClosed: 0, totalPnl: totalFloatingPnl, settlementAmount: 0 };
  }


  let confirmedBalance = balance;
  let confirmedAutoSqoff = autoSqoffPercent;
  try {
    const { data: liveProfile } = await admin
      .from('profiles')
      .select('balance, auto_sqoff')
      .eq('id', userId)
      .single();

    if (liveProfile) {
      confirmedBalance = Number(liveProfile.balance ?? balance);
      confirmedAutoSqoff = Number(liveProfile.auto_sqoff ?? autoSqoffPercent);
      const confirmedThreshold = computeLiquidationThreshold(confirmedBalance, confirmedAutoSqoff);

      if (totalFloatingPnl > confirmedThreshold) {
        // Deposit just arrived — account is actually fine now
        console.log(
          `[LiquidationEngine] SKIP (confirmed) user ${userId}: ` +
          `PnL=₹${totalFloatingPnl.toFixed(2)} > confirmed threshold=₹${confirmedThreshold.toFixed(2)} ` +
          `(live balance=₹${confirmedBalance.toFixed(2)}, sqoff=${confirmedAutoSqoff}%)`,
        );
        return { liquidated: false, positionsClosed: 0, totalPnl: totalFloatingPnl, settlementAmount: 0 };
      }
    }
  } catch {
    // DB error — proceed with the original balance; better to fire than miss
  }

  // ─── LIQUIDATION CONFIRMED ───────────────────────────────────────────────
  const confirmedThreshold = computeLiquidationThreshold(confirmedBalance, confirmedAutoSqoff);
  console.warn(
    `[LiquidationEngine]   LIQUIDATION TRIGGERED for user ${userId}. ` +
    `Balance: ₹${confirmedBalance.toFixed(2)}, ` +
    `FloatingPnL: ₹${totalFloatingPnl.toFixed(2)}, ` +
    `Threshold: ₹${confirmedThreshold.toFixed(2)} (${confirmedAutoSqoff}%). ` +
    `Closing ${positions.length} position(s) immediately.`,
  );

  const previousBalance = confirmedBalance;
  let positionsClosed = 0;


  const { error: cancelErr } = await admin
    .from('orders')
    .update({ status: 'CANCELLED', info: 'AUTO_LIQUIDATION' })
    .eq('user_id', userId)
    .eq('status', 'PENDING');

  if (cancelErr) {
    console.error(`[LiquidationEngine] Failed to cancel pending orders for user ${userId}:`, cancelErr.message);
  }


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

    // Attempt close with one retry — a transient DB error during liquidation
    // must not silently leave positions open.
    let closed = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { error: closeErr } = await admin.rpc('close_position', {
        p_position_id: pos.id,
        p_user_id: userId,
        p_ltp: ltp,
        p_exit_price: exitPrice,
        p_closed_by: 'AUTO_LIQUIDATION',
        p_brokerage: 0,
      });

      if (!closeErr) {
        closed = true;
        break;
      }

      if (attempt === 1) {
        console.warn(
          `[LiquidationEngine] close_position failed for ${pos.id} (attempt 1): ${closeErr.message}. Retrying in 200ms...`,
        );
        await new Promise(r => setTimeout(r, 200));
      } else {
        console.error(
          `[LiquidationEngine] close_position FAILED for ${pos.id} after 2 attempts: ${closeErr.message}. Position may remain open!`,
        );
      }
    }
    if (closed) positionsClosed++;
  }

  //  determine settlement amount
  const { data: updatedProfile } = await admin
    .from('profiles')
    .select('balance, settlement_amount')
    .eq('id', userId)
    .single();

  const settlementAmount = Math.abs(Number(updatedProfile?.settlement_amount || 0));
  const finalLoss = Math.abs(totalFloatingPnl);

  //  if balance went negative
  if (settlementAmount > 0) {
    await admin.from('settlement_records').insert({
      user_id: userId,
      settlement_amount: settlementAmount,
      liquidation_event: 'AUTO_LIQUIDATION',
      previous_balance: previousBalance,
      final_loss: finalLoss,
      positions_closed: positionsClosed,
      notes:
        `Auto-liquidation at ${confirmedAutoSqoff}% threshold. ` +
        `Threshold: ₹${confirmedThreshold.toFixed(2)}, ` +
        `Floating PnL at trigger: ₹${totalFloatingPnl.toFixed(2)}`,
    });
  }

  // Notify user 
  await admin.from('notifications').insert({
    user_id: userId,
    type: 'GENERAL',
    title: ' Account Liquidated — All positions squared off',
    message:
      `Your account was auto-liquidated because total losses ` +
      `(₹${Math.abs(totalFloatingPnl).toFixed(2)}) exceeded ${confirmedAutoSqoff}% of your balance ` +
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
      `ACCOUNT_LIQUIDATION (${confirmedAutoSqoff}%): ${positionsClosed} positions closed. ` +
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
