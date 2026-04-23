/**
 * GET /api/admin/settings/scripts
 * POST /api/admin/settings/scripts
 *
 * Manages global lot size configuration for trading symbols.
 *
 * Validates: Requirements 5.1–5.2, 5.5–5.6, 12.1–12.6
 */

import { requireAdmin } from '../../_auth';

/**
 * GET /api/admin/settings/scripts
 *
 * Returns all script settings ordered by symbol ascending.
 *
 * Validates: Requirements 5.1, 5.5, 12.1–12.6
 * Feature: admin-panel-live-data, Property 8: Script settings ordering
 */
export async function GET(request: Request): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 12.1–12.6
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Query all script settings ordered by symbol ascending
    // Validates: Requirements 5.1, 5.5
    const { data, error } = await adminClient
      .from('script_settings')
      .select('id, symbol, lot_size')
      .order('symbol', { ascending: true });

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 3: Return script settings array
    return Response.json(data ?? [], { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/settings/scripts
 *
 * Inserts a new script setting with the given symbol and lot_size.
 * Returns 201 with the newly created row.
 *
 * Validates: Requirements 5.2, 5.6, 12.1–12.6
 * Feature: admin-panel-live-data, Property 9: Script settings CRUD round trip
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 12.1–12.6
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Parse JSON body
    // Validates: Requirement 5.2
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Step 3: Validate required fields
    const { symbol, lot_size } = body;
    if (!symbol) {
      return Response.json({ error: 'Missing required field: symbol' }, { status: 400 });
    }
    if (lot_size === undefined || lot_size === null) {
      return Response.json({ error: 'Missing required field: lot_size' }, { status: 400 });
    }
    if (typeof lot_size !== 'number' || lot_size <= 0) {
      return Response.json({ error: 'lot_size must be a positive number' }, { status: 400 });
    }

    // Step 4: Insert new script setting
    // Validates: Requirement 5.6
    const { data, error } = await adminClient
      .from('script_settings')
      .insert({ symbol: symbol as string, lot_size: lot_size as number })
      .select('id, symbol, lot_size')
      .single();

    if (error) {
      // Handle unique constraint violation on symbol
      if (error.code === '23505') {
        return Response.json({ error: 'Symbol already exists' }, { status: 409 });
      }
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 5: Return 201 with new row
    return Response.json(data, { status: 201 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
