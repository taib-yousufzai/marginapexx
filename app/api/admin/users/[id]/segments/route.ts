/**
 * GET  /api/admin/users/[id]/segments
 * POST /api/admin/users/[id]/segments
 *
 * GET  returns all segment_settings rows for the given user id.
 * POST upserts an array of segment settings using onConflict: 'user_id,segment,side'.
 *
 * Validates: Requirements 8.1–8.4, 12.1–12.6
 */

import { requireAdmin } from '../../../_auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SegmentSettingRow = {
  id: string;
  user_id: string;
  segment: string;
  side: 'BUY' | 'SELL';
  commission_type: string;
  commission_value: number;
  profit_hold_sec: number;
  loss_hold_sec: number;
  strike_range: number;
  max_lot: number;
  max_order_lot: number;
  intraday_leverage: number;
  intraday_type: string;
  holding_leverage: number;
  entry_buffer: number;
  holding_type: string;
  exit_buffer: number;
  trade_allowed: boolean;
  created_at: string;
  updated_at: string;
};

// Fields accepted in the POST body for each segment setting entry
type SegmentSettingInput = Omit<SegmentSettingRow, 'id' | 'created_at' | 'updated_at'>;

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 12.1–12.6
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Resolve params
    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    // Step 3: Query all segment_settings rows for this user
    // Validates: Requirements 8.1, 8.3
    const { data, error } = await adminClient
      .from('segment_settings')
      .select(
        'id, user_id, segment, side, commission_type, commission_value, profit_hold_sec, loss_hold_sec, strike_range, max_lot, max_order_lot, intraday_leverage, intraday_type, holding_leverage, entry_buffer, holding_type, exit_buffer, trade_allowed, created_at, updated_at',
      )
      .eq('user_id', id);

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 4: Return the segment settings array
    return Response.json(data ?? [], { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 12.1–12.6
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Resolve params
    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    // Step 3: Parse JSON body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Step 4: Validate that body is a non-empty array
    // Validates: Requirement 8.4
    if (!Array.isArray(body) || body.length === 0) {
      return Response.json(
        { error: 'Request body must be a non-empty array of segment settings' },
        { status: 400 },
      );
    }

    // Step 5: Validate each entry has required fields (segment and side)
    for (const entry of body) {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof (entry as Record<string, unknown>).segment !== 'string' ||
        !['BUY', 'SELL'].includes((entry as Record<string, unknown>).side as string)
      ) {
        return Response.json(
          { error: 'Each entry must have a valid segment (string) and side (BUY|SELL)' },
          { status: 400 },
        );
      }
    }

    // Step 6: Build upsert payload — force user_id to the path param
    // Validates: Requirement 8.4
    const rows: SegmentSettingInput[] = (body as Record<string, unknown>[]).map((entry) => ({
      user_id: id,
      segment: entry.segment as string,
      side: entry.side as 'BUY' | 'SELL',
      commission_type:
        typeof entry.commission_type === 'string' ? entry.commission_type : 'Per Crore',
      commission_value:
        typeof entry.commission_value === 'number' ? entry.commission_value : 4500,
      profit_hold_sec:
        typeof entry.profit_hold_sec === 'number' ? entry.profit_hold_sec : 120,
      loss_hold_sec:
        typeof entry.loss_hold_sec === 'number' ? entry.loss_hold_sec : 0,
      strike_range:
        typeof entry.strike_range === 'number' ? entry.strike_range : 0,
      max_lot:
        typeof entry.max_lot === 'number' ? entry.max_lot : 50,
      max_order_lot:
        typeof entry.max_order_lot === 'number' ? entry.max_order_lot : 50,
      intraday_leverage:
        typeof entry.intraday_leverage === 'number' ? entry.intraday_leverage : 50,
      intraday_type:
        typeof entry.intraday_type === 'string' ? entry.intraday_type : 'Multiplier',
      holding_leverage:
        typeof entry.holding_leverage === 'number' ? entry.holding_leverage : 5,
      entry_buffer:
        typeof entry.entry_buffer === 'number' ? entry.entry_buffer : 0.003,
      holding_type:
        typeof entry.holding_type === 'string' ? entry.holding_type : 'Multiplier',
      exit_buffer:
        typeof entry.exit_buffer === 'number' ? entry.exit_buffer : 0.0017,
      trade_allowed:
        typeof entry.trade_allowed === 'boolean' ? entry.trade_allowed : true,
    }));

    // Step 7: Upsert using the unique constraint (user_id, segment, side)
    // Validates: Requirement 8.4
    const { data, error } = await adminClient
      .from('segment_settings')
      .upsert(rows, { onConflict: 'user_id,segment,side' })
      .select();

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 8: Return the upserted rows
    return Response.json(data ?? [], { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
