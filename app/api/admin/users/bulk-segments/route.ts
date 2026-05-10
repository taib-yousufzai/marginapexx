/**
 * POST /api/admin/users/bulk-segments
 *
 * Bulk updates segment settings for all users under a specific broker.
 */

import { requireAdmin } from '../../_auth';

export async function POST(request: Request): Promise<Response> {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const { broker, segments, config } = await request.json();

    if (!broker || !segments || !Array.isArray(segments) || segments.length === 0 || !config) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Find all users under this broker (including sub-brokers and clients)
    const { data: profiles, error: pError } = await adminClient
      .from('profiles')
      .select('id, parent_id');

    if (pError) throw pError;

    const targetUserIds: string[] = [];
    const findDescendants = (parentId: string) => {
      profiles.forEach(p => {
        if (p.parent_id === parentId) {
          targetUserIds.push(p.id);
          findDescendants(p.id);
        }
      });
    };
    
    // Start with the broker itself if it's a valid ID, or just find its descendants
    findDescendants(broker);
    // Include the broker's direct children if the broker string is a name/code
    // This assumes 'broker' is the parent_id value used in the database.

    if (targetUserIds.length === 0) {
      return Response.json({ error: 'No users found under this broker' }, { status: 404 });
    }

    // 2. Perform bulk update in segment_settings
    const { error: uError } = await adminClient
      .from('segment_settings')
      .update({
        commission_type: config.commissionType,
        commission_value: Number(config.commissionValue),
        profit_hold_sec: Number(config.profitHoldSec),
        loss_hold_sec: Number(config.loss_hold_sec),
        strike_range: Number(config.strikeRange),
        max_lot: Number(config.maxLot),
        max_order_lot: Number(config.maxOrderLot),
        intraday_leverage: Number(config.intradayLeverage),
        intraday_type: config.intradayType,
        holding_leverage: Number(config.holdingLeverage),
        holding_type: config.holdingType,
        entry_buffer: Number(config.entryBuffer),
        exit_buffer: Number(config.exitBuffer),
        trade_allowed: config.tradeAllowed
      })
      .in('user_id', targetUserIds)
      .in('segment_name', segments);

    if (uError) throw uError;

    return Response.json({ 
      success: true, 
      message: `Updated ${segments.length} segments for ${targetUserIds.length} users.` 
    }, { status: 200 });

  } catch (err: any) {
    console.error('[POST /api/admin/users/bulk-segments] Error:', err);
    return Response.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
