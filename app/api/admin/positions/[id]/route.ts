/**
 * PATCH /api/admin/positions/[id]
 * DELETE /api/admin/positions/[id]
 *
 * PATCH: Update editable fields on a position row.
 * DELETE: Remove a position row.
 *
 * Validates: Requirements 7.8–7.9, 12.1–12.6
 */

import { requireAdmin } from '../../_auth';

// Editable position fields allowed via PATCH
const EDITABLE_FIELDS = [
  'sl',
  'tp',
  'qty_open',
  'avg_price',
  'ltp',
  'exit_price',
  'duration_seconds',
  'brokerage',
  'settlement',
  'status',
] as const;

export async function PATCH(
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
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Step 4: Extract only editable fields from body
    // Validates: Requirement 7.8
    const updateFields: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in body) {
        updateFields[field] = body[field];
      }
    }

    if (Object.keys(updateFields).length === 0) {
      return Response.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    // Step 5: Update the position row
    const { data, error, count } = await adminClient
      .from('positions')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

    if (error || count === 0 || data === null) {
      // If the row was not found, return 404
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 6: Return the updated position row
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
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

    // Step 3: Delete the position row
    // Validates: Requirement 7.9
    const { error, count } = await adminClient
      .from('positions')
      .delete({ count: 'exact' })
      .eq('id', id);

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (count === 0) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 4: Return success
    return Response.json({ success: true }, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
