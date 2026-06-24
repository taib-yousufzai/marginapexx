/**
 * POST /api/admin/orders/square-off-all
 *
 * Force-closes ALL open positions platform-wide (emergency risk control).
 *
 * Uses the close_position() RPC for every open position so that:
 *   - PnL is correctly realized (PNL_CREDIT / PNL_DEBIT transactions inserted)
 *   - Wallet balances are updated via the sync_profile_balance trigger
 *   - Exit orders are recorded (is_exit = true)
 *   - act_logs are written per position
 *
 * No brokerage is charged on emergency admin square-offs.
 */
import { requireAdmin } from '../../_auth';

export async function POST(request: Request): Promise<Response> {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient, callerUser } = authResult;

    // Fetch all open positions
    const { data: openPositions, error: fetchErr } = await adminClient
      .from('positions')
      .select('id, user_id, symbol, side, settlement, qty_open, entry_price, ltp')
      .eq('status', 'open')
      .gt('qty_open', 0);

    if (fetchErr) {
      console.error('[square-off-all] fetch error:', fetchErr.message);
      return Response.json({ error: 'Failed to fetch open positions' }, { status: 500 });
    }

    if (!openPositions || openPositions.length === 0) {
      return Response.json({ squaredOff: 0, errors: 0 }, { status: 200 });
    }

    // Bulk-fetch exit buffers for involved (user, segment, side) combos
    const userIds = [...new Set(openPositions.map((p) => p.user_id))];
    const { data: settingsRows } = await adminClient
      .from('segment_settings')
      .select('user_id, segment, side, exit_buffer')
      .in('user_id', userIds);

    const exitBufferMap = new Map<string, number>();
    for (const row of settingsRows ?? []) {
      exitBufferMap.set(
        `${row.user_id}|${row.segment}|${row.side}`,
        Number(row.exit_buffer ?? 0.0017),
      );
    }

    let squaredOff = 0;
    let errors = 0;

    // Close each position via the atomic RPC
    for (const pos of openPositions) {
      const baseLtp = Number(pos.ltp ?? pos.entry_price);
      const bufKey = `${pos.user_id}|${pos.settlement}|${pos.side}`;
      const exitBuffer = exitBufferMap.get(bufKey) ?? 0.0017;

      let exitPrice: number;
      if (pos.side === 'BUY') {
        exitPrice = baseLtp * (1 - exitBuffer);
      } else {
        exitPrice = baseLtp * (1 + exitBuffer);
      }
      exitPrice = Math.round(exitPrice * 100) / 100;

      const { error: rpcErr } = await adminClient.rpc('close_position', {
        p_position_id: pos.id,
        p_user_id: pos.user_id,
        p_ltp: baseLtp,
        p_exit_price: exitPrice,
        p_closed_by: 'ADMIN_SQOFF_ALL',
        p_brokerage: 0,
      });

      if (rpcErr) {
        console.error(`[square-off-all] failed to close position ${pos.id}:`, rpcErr.message);
        errors++;
      } else {
        squaredOff++;
      }
    }

    // Log the admin action (correct table: act_logs)
    await adminClient.from('act_logs').insert({
      type: 'ADMIN_SQUARE_OFF_ALL',
      user_id: callerUser.id,
      target_user_id: callerUser.id,
      reason: `Admin emergency square-off all: ${squaredOff} closed, ${errors} errors`,
    });

    return Response.json({ squaredOff, errors }, { status: 200 });
  } catch (err) {
    console.error('[square-off-all] unexpected error:', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
