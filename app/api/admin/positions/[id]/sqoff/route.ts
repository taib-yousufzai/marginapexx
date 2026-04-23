/**
 * POST /api/admin/positions/[id]/sqoff
 *
 * Square-off a position: sets status='closed', exit_time=now(),
 * and computes duration_seconds from entry_time to now().
 *
 * Validates: Requirements 7.10, 12.1–12.6
 */

import { requireAdmin } from '../../../_auth';

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

    // Step 3: Fetch the position row to get entry_time
    // Validates: Requirement 7.10
    const { data: position, error: fetchError } = await adminClient
      .from('positions')
      .select('id, entry_time')
      .eq('id', id)
      .single();

    if (fetchError || position === null) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 4: Compute duration_seconds as difference between entry_time and now()
    const now = new Date();
    const entryTime = new Date(position.entry_time);
    const duration_seconds = Math.floor((now.getTime() - entryTime.getTime()) / 1000);

    // Step 5: Update the position: status='closed', exit_time=now(), duration_seconds=computed
    const { data: updated, error: updateError } = await adminClient
      .from('positions')
      .update({
        status: 'closed',
        exit_time: now.toISOString(),
        duration_seconds,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError || updated === null) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 6: Return the updated position row
    return Response.json(updated, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
