/**
 * GET /api/admin/settings/filtering
 * PUT /api/admin/settings/filtering
 *
 * Manages segment-specific strike range configuration for the Filter Engine.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { requireAdmin } from '../../_auth';

const INDEX_KEY = 'index_options_strike_range';
const MCX_KEY = 'mcx_options_strike_range';
const DEFAULT_INDEX = 5;
const DEFAULT_MCX = 7;

/**
 * GET /api/admin/settings/filtering
 * Returns { indexOptionsRange: number, mcxOptionsRange: number }
 */
export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const { data, error } = await adminClient
      .from('admin_config')
      .select('key, value')
      .in('key', [INDEX_KEY, MCX_KEY]);

    if (error) {
      console.error('[GET filtering] Error:', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    const rows = data ?? [];
    const indexRow = rows.find((r) => r.key === INDEX_KEY);
    const mcxRow = rows.find((r) => r.key === MCX_KEY);

    return Response.json(
      {
        indexOptionsRange: indexRow ? parseInt(indexRow.value, 10) : DEFAULT_INDEX,
        mcxOptionsRange: mcxRow ? parseInt(mcxRow.value, 10) : DEFAULT_MCX,
      },
      { status: 200 },
    );
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/settings/filtering
 * Body: { indexOptionsRange: number, mcxOptionsRange: number }
 * Validates both are positive integers, upserts rows, returns updated values.
 */
export async function PUT(request: Request) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const body = await request.json();
    const { indexOptionsRange, mcxOptionsRange } = body;

    // Validate presence
    if (indexOptionsRange === undefined || indexOptionsRange === null) {
      return Response.json(
        { error: 'Missing required field: indexOptionsRange' },
        { status: 400 },
      );
    }
    if (mcxOptionsRange === undefined || mcxOptionsRange === null) {
      return Response.json(
        { error: 'Missing required field: mcxOptionsRange' },
        { status: 400 },
      );
    }

    // Validate positive integers
    if (!Number.isInteger(indexOptionsRange) || indexOptionsRange <= 0) {
      return Response.json(
        { error: 'indexOptionsRange must be a positive integer greater than zero' },
        { status: 400 },
      );
    }
    if (!Number.isInteger(mcxOptionsRange) || mcxOptionsRange <= 0) {
      return Response.json(
        { error: 'mcxOptionsRange must be a positive integer greater than zero' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { error } = await adminClient.from('admin_config').upsert(
      [
        { key: INDEX_KEY, value: String(indexOptionsRange), updated_at: now },
        { key: MCX_KEY, value: String(mcxOptionsRange), updated_at: now },
      ],
      { onConflict: 'key' },
    );

    if (error) {
      console.error('[PUT filtering] Error:', error.message);
      return Response.json({ error: 'Failed to update filtering config' }, { status: 500 });
    }

    return Response.json({ indexOptionsRange, mcxOptionsRange }, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
