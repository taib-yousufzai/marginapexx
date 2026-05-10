/**
 * GET  /api/admin/orders  — list all orders platform-wide (with filters)
 * POST /api/admin/orders/square-off-all — force-close all open positions
 * POST /api/admin/orders/cancel-all     — cancel all pending LIMIT orders
 */

import { requireAdmin } from '../_auth';

export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const url = new URL(request.url);
    const tab        = url.searchParams.get('tab') ?? null;
    const search     = url.searchParams.get('search') ?? null;
    const dateFrom   = url.searchParams.get('dateFrom') ?? null;
    const dateTo     = url.searchParams.get('dateTo') ?? null;
    const rowsParam  = url.searchParams.get('rows') ?? null;
    const pageParam  = url.searchParams.get('page') ?? '1';
    const rows       = rowsParam ? Math.min(parseInt(rowsParam, 10), 500) : 50;
    const page       = Math.max(1, parseInt(pageParam, 10));

    let query = adminClient
      .from('orders')
      .select('id, user_id, symbol, side, status, qty, price, order_type, info, created_at', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (tab === 'executed') {
      query = query.eq('status', 'EXECUTED');
    } else if (tab === 'limit') {
      query = query.eq('status', 'CANCELLED').eq('order_type', 'LIMIT');
    } else if (tab === 'rejected') {
      query = query.eq('status', 'REJECTED');
    } else if (tab === 'pending') {
      query = query.eq('status', 'PENDING').eq('order_type', 'LIMIT');
    }

    if (search) {
      query = query.ilike('symbol', `%${search}%`);
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      // Add 1 day so "to" date is inclusive
      const toDate = new Date(dateTo);
      toDate.setDate(toDate.getDate() + 1);
      query = query.lt('created_at', toDate.toISOString());
    }

    const from = (page - 1) * rows;
    const to   = from + rows - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json({ orders: data ?? [], total: count ?? 0 }, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
