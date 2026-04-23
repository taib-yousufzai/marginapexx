/**
 * GET /api/admin/users/[id]/orders
 *
 * Returns orders for a given user, with optional tab filtering, symbol search,
 * and row limit.
 *
 * Validates: Requirements 6.1–6.8, 12.1–12.6
 */

import { requireAdmin } from '../../../_auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrderItem = {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  status: 'EXECUTED' | 'CANCELLED' | 'REJECTED';
  qty: number;
  price: number;
  order_type: 'MARKET' | 'LIMIT';
  info: string;
  time: string; // mapped from created_at
};

// ---------------------------------------------------------------------------
// Route handler
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

    // Step 3: Parse query params
    // Validates: Requirements 6.4–6.6
    const url = new URL(request.url);
    const tab = url.searchParams.get('tab') ?? null;
    const search = url.searchParams.get('search') ?? null;
    const rowsParam = url.searchParams.get('rows') ?? null;
    const rows = rowsParam ? parseInt(rowsParam, 10) : 100;

    // Step 4: Build query — filter by user_id
    // Validates: Requirement 6.3
    let query = adminClient
      .from('orders')
      .select('id, symbol, side, status, qty, price, order_type, info, created_at')
      .eq('user_id', id);

    // Step 5: Apply tab filter
    // Validates: Requirements 6.4, 6.5, 6.6
    if (tab === 'executed') {
      query = query.eq('status', 'EXECUTED');
    } else if (tab === 'limit') {
      query = query.eq('status', 'CANCELLED').eq('order_type', 'LIMIT');
    } else if (tab === 'rejected') {
      query = query.eq('status', 'REJECTED');
    }
    // default (no tab) → no status filter

    // Step 6: Apply symbol search filter
    // Validates: Requirement 6.7
    if (search) {
      query = query.ilike('symbol', `%${search}%`);
    }

    // Step 7: Apply row limit
    // Validates: Requirement 6.8
    query = query.limit(rows);

    const { data, error } = await query;

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 8: Map created_at → time and return OrderItem[]
    // Validates: Requirement 6.2
    const orders: OrderItem[] = (data ?? []).map(
      (row: {
        id: string;
        symbol: string;
        side: string;
        status: string;
        qty: number;
        price: number;
        order_type: string;
        info: string | null;
        created_at: string;
      }) => ({
        id: row.id,
        symbol: row.symbol,
        side: row.side as 'BUY' | 'SELL',
        status: row.status as 'EXECUTED' | 'CANCELLED' | 'REJECTED',
        qty: row.qty,
        price: row.price,
        order_type: row.order_type as 'MARKET' | 'LIMIT',
        info: row.info ?? '',
        time: row.created_at,
      }),
    );

    return Response.json(orders, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
