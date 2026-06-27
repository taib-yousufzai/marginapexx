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
  exitBuffers: Map<string, { exit_buffer: number, bid_buffer?: number }>,
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
    const bufferSettings = exitBuffers.get(exitBufferKey);
    const exitBuffer = bufferSettings?.exit_buffer ?? 0.0017;
    const bidBuffer = bufferSettings?.bid_buffer ?? 0.003;

    let exitPrice: number;
    if (pos.side === 'BUY') {
      exitPrice = ltp * (1 - bidBuffer);
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

  const totalProfileSettlement = Math.abs(Number(updatedProfile?.settlement_amount || 0));
  // The incremental settlement caused strictly by this liquidation event
  // previousBalance is the total balance before we started (could be negative if they already had debt)
  const previousDebt = previousBalance < 0 ? Math.abs(previousBalance) : 0;
  // If their previous balance was positive, but now they have a settlement amount, the incremental debt is the full settlement amount.
  // If they already had debt, the incremental debt is the new debt minus the old debt.
  const incrementalSettlement = Math.max(0, totalProfileSettlement - previousDebt);
  const finalLoss = Math.abs(totalFloatingPnl);

  // Stamp settlement_amount onto every position that was just liquidated
  // so users can see it on their individual position history cards.
  //
  // We distribute the incremental settlement debt proportionally by each position's
  // share of the total floating loss.
  if (incrementalSettlement > 0 && positionsClosed > 0) {
    const liquidatedIds = positions.map(p => p.id);

    // Compute each position's floating loss contribution
    const posLosses = positions.map(p => {
      const ltp = Number(p.ltp || p.entry_price);
      const pnl = p.side === 'BUY'
        ? (ltp - Number(p.entry_price)) * p.qty_open
        : (Number(p.entry_price) - ltp) * p.qty_open;
      return { id: p.id, loss: Math.max(0, -pnl) }; // only count losses, clamp to 0
    });

    const totalLoss = posLosses.reduce((sum, p) => sum + p.loss, 0);

    if (totalLoss > 0) {
      // Proportional distribution — update each position individually
      await Promise.all(
        posLosses.map(({ id, loss }) => {
          const share = (loss / totalLoss) * incrementalSettlement;
          return admin
            .from('positions')
            .update({ settlement_amount: Math.round(share * 100) / 100 })
            .eq('id', id);
        }),
      );
    } else {
      // All positions broke even or were profitable — split equally
      const equalShare = Math.round((incrementalSettlement / liquidatedIds.length) * 100) / 100;
      await admin
        .from('positions')
        .update({ settlement_amount: equalShare })
        .in('id', liquidatedIds);
    }
  }

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
