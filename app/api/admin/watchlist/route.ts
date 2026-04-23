/**
 * GET /api/admin/watchlist
 * POST /api/admin/watchlist
 * DELETE /api/admin/watchlist
 *
 * Manages per-user watchlist entries with tab-based organization.
 *
 * Validates: Requirements 4.1–4.7, 12.1–12.6
 */

import { requireAdmin } from '../_auth';

/**
 * GET /api/admin/watchlist?tab=<tab>
 *
 * Returns all watchlist symbols for the authenticated user and specified tab.
 *
 * Validates: Requirements 4.1, 4.4, 12.1–12.6
 * Feature: admin-panel-live-data, Property 5: Watchlist user isolation
 */
export async function GET(request: Request): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 12.1–12.6
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient, callerUser } = authResult;

    // Step 2: Parse tab query parameter
    // Validates: Requirement 4.1
    const url = new URL(request.url);
    const tab = url.searchParams.get('tab');
    if (!tab) {
      return Response.json({ error: 'Missing required parameter: tab' }, { status: 400 });
    }

    // Step 3: Query watchlists filtered by user_id and tab
    // Validates: Requirements 4.4
    const { data, error } = await adminClient
      .from('watchlists')
      .select('id, symbol, tab')
      .eq('user_id', callerUser.id)
      .eq('tab', tab)
      .order('created_at', { ascending: true });

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 4: Return watchlist array
    return Response.json(data ?? [], { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/admin/watchlist
 *
 * Adds a symbol to the authenticated user's watchlist for the specified tab.
 * Conflict on unique key (user_id, tab, symbol) is ignored.
 *
 * Validates: Requirements 4.2, 4.5, 12.1–12.6
 * Feature: admin-panel-live-data, Property 6: Watchlist add/remove round trip
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 12.1–12.6
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient, callerUser } = authResult;

    // Step 2: Parse JSON body
    // Validates: Requirement 4.2
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Step 3: Validate required fields
    const { tab, symbol } = body;
    if (!tab || !symbol) {
      return Response.json({ error: 'Missing required fields: tab, symbol' }, { status: 400 });
    }

    // Step 4: Insert watchlist entry (conflict on unique key → ignore)
    // Validates: Requirement 4.5
    const { data, error } = await adminClient
      .from('watchlists')
      .insert({ user_id: callerUser.id, tab: tab as string, symbol: symbol as string })
      .select('id, symbol, tab')
      .single();

    // Ignore unique constraint violations (23505 is PostgreSQL unique violation code)
    if (error && error.code === '23505') {
      // Entry already exists — return success without inserting
      return Response.json({ message: 'Symbol already in watchlist' }, { status: 200 });
    }

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 5: Return 201 with new entry
    return Response.json(data, { status: 201 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/watchlist?tab=<tab>&symbol=<symbol>
 * DELETE /api/admin/watchlist?tab=<tab>
 *
 * Removes a specific symbol or clears all symbols for the specified tab.
 *
 * Validates: Requirements 4.3, 4.6, 4.7, 12.1–12.6
 * Feature: admin-panel-live-data, Property 6: Watchlist add/remove round trip
 * Feature: admin-panel-live-data, Property 7: Watchlist clear
 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 12.1–12.6
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient, callerUser } = authResult;

    // Step 2: Parse query parameters
    // Validates: Requirement 4.3
    const url = new URL(request.url);
    const tab = url.searchParams.get('tab');
    const symbol = url.searchParams.get('symbol');

    if (!tab) {
      return Response.json({ error: 'Missing required parameter: tab' }, { status: 400 });
    }

    // Step 3: Delete matching row(s)
    let deleteQuery = adminClient
      .from('watchlists')
      .delete()
      .eq('user_id', callerUser.id)
      .eq('tab', tab);

    if (symbol) {
      // DELETE with symbol: remove specific entry
      // Validates: Requirement 4.6
      deleteQuery = deleteQuery.eq('symbol', symbol);
    }
    // else: DELETE without symbol: remove all entries for (user_id, tab)
    // Validates: Requirement 4.7

    const { error } = await deleteQuery;

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 4: Return success
    return Response.json({ message: 'Deleted successfully' }, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
