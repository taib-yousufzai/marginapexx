/**
 * POST /api/admin/orders/square-off-all
 * Force-closes ALL open positions platform-wide (emergency risk control).
 */
import { requireAdmin } from '../../_auth';

export async function POST(request: Request): Promise<Response> {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient, callerUser } = authResult;

    // Mark all EXECUTED positions (qty_open > 0) as squared off
    const { data, error } = await adminClient
      .from('positions')
      .update({ qty_open: 0, exit_time: new Date().toISOString(), info: 'Admin Square-Off All' })
      .gt('qty_open', 0)
      .select('id');

    if (error) {
      console.error('[square-off-all]', error.message);
      return Response.json({ error: 'Failed to square off positions' }, { status: 500 });
    }

    // Log the admin action
    await adminClient.from('actlogs').insert({
      type: 'SQUARE_OFF_ALL',
      by: callerUser.id,
      target: 'ALL',
      reason: 'Admin emergency square-off all',
    });

    return Response.json({ squaredOff: (data ?? []).length }, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
