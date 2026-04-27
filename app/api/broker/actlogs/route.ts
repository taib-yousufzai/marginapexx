/**
 * GET /api/broker/actlogs
 *
 * Scoped activity logs for brokers.
 */

import { NextResponse } from 'next/server';
import { requireBroker } from '../_auth';

export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireBroker(request);
    if (!authResult || !('adminClient' in authResult) || !authResult.adminClient) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { adminClient, callerUser } = authResult as any;

    const url = new URL(request.url);
    const search = url.searchParams.get('search') ?? null;
    const pageParam = url.searchParams.get('page') ?? null;
    const rowsParam = url.searchParams.get('rows') ?? null;

    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const rows = rowsParam ? parseInt(rowsParam, 10) : 50;

    // Brokers see logs where target_user_id is one of their sub-users
    // First, get sub-user IDs
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id')
      .eq('parent_id', callerUser.id);
    
    const subUserIds = (profiles ?? []).map((p: { id: string }) => p.id);

    if (subUserIds.length === 0) {
      return Response.json([], { status: 200 });
    }

    let query = adminClient
      .from('act_logs')
      .select('*')
      .in('target_user_id', subUserIds)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`type.ilike.%${search}%,symbol.ilike.%${search}%,target_user_id.eq.${search}`);
    }

    const from = (page - 1) * rows;
    const to = from + rows - 1;
    query = query.range(from, to);

    const { data, error } = await query;

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    const logs = (data ?? []).map((row: any) => ({
      id: row.id,
      type: row.type,
      time: row.created_at,
      by: row.user_id ?? '',
      target: row.target_user_id ?? '',
      symbol: row.symbol,
      qty: row.qty,
      price: row.price,
      reason: row.reason,
      ip: row.ip ?? '',
    }));

    return Response.json(logs, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
