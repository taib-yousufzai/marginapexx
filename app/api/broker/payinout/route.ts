/**
 * GET /api/broker/payinout
 * PATCH /api/broker/payinout/[id] — approve/reject (handled in [id]/route.ts)
 *
 * Returns pay requests scoped to broker's sub-users.
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
    const type   = url.searchParams.get('type')   ?? null;
    const status = url.searchParams.get('status') ?? null;

    // Get sub-user IDs
    const { data: profiles } = await adminClient
      .from('profiles')
      .select('id, full_name, email')
      .eq('parent_id', callerUser.id);

    const subUserIds = (profiles ?? []).map((p: any) => p.id);
    const profileMap: Record<string, { full_name: string; email: string }> = {};
    for (const p of (profiles ?? [])) profileMap[p.id] = { full_name: p.full_name, email: p.email };

    if (subUserIds.length === 0) {
      return Response.json([], { status: 200 });
    }

    let query = adminClient
      .from('pay_requests')
      .select('*')
      .in('user_id', subUserIds)
      .order('created_at', { ascending: false });

    if (type)   query = query.eq('type', type);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return Response.json({ error: 'Internal server error' }, { status: 500 });

    const result = (data ?? []).map((r: any) => ({
      ...r,
      full_name: profileMap[r.user_id]?.full_name ?? null,
      email:     profileMap[r.user_id]?.email     ?? null,
    }));

    return Response.json(result, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
