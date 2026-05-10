/**
 * GET /api/admin/settings/trading-hours
 * PUT /api/admin/settings/trading-hours
 * 
 * Manages segment-wise trading hours.
 */

import { requireAdmin } from '../../_auth';

export async function GET(request: Request) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const { data, error } = await adminClient
      .from('trading_hours')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('[GET trading-hours] Error:', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data || [], { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const body = await request.json();
    const { segments } = body; // Array of { id, name, startTime, endTime, isActive }

    if (!Array.isArray(segments)) {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Upsert all segments
    const upsertData = segments.map(s => ({
      id: s.id,
      name: s.name,
      start_time: s.startTime,
      end_time: s.endTime,
      is_active: s.isActive,
      updated_at: new Date().toISOString()
    }));

    const { error } = await adminClient
      .from('trading_hours')
      .upsert(upsertData, { onConflict: 'id' });

    if (error) {
      console.error('[PUT trading-hours] Error:', error.message);
      return Response.json({ error: 'Failed to update trading hours' }, { status: 500 });
    }

    return Response.json({ success: true }, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
