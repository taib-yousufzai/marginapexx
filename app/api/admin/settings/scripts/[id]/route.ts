/**
 * PATCH /api/admin/settings/scripts/[id]
 * DELETE /api/admin/settings/scripts/[id]
 *
 * Updates or removes a specific script setting by id.
 *
 * Validates: Requirements 5.3–5.4, 5.7–5.8, 12.1–12.6
 */

import { requireAdmin } from '../../../_auth';

/**
 * PATCH /api/admin/settings/scripts/[id]
 *
 * Updates symbol and/or lot_size for the given script setting.
 * Returns 404 if the id does not exist.
 *
 * Validates: Requirements 5.3, 5.7, 12.1–12.6
 * Feature: admin-panel-live-data, Property 9: Script settings CRUD round trip
 */
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
    const { id } = resolvedParams;

    // Step 3: Parse JSON body
    // Validates: Requirement 5.3
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Step 4: Build update payload from allowed fields
    const updates: Record<string, unknown> = {};
    if (body.symbol !== undefined) {
      updates.symbol = body.symbol;
    }
    if (body.lot_size !== undefined) {
      if (typeof body.lot_size !== 'number' || body.lot_size <= 0) {
        return Response.json({ error: 'lot_size must be a positive number' }, { status: 400 });
      }
      updates.lot_size = body.lot_size;
    }

    if (Object.keys(updates).length === 0) {
      return Response.json({ error: 'No updatable fields provided' }, { status: 400 });
    }

    // Step 5: Update the row and return the updated record
    // Validates: Requirement 5.7
    const { data, error } = await adminClient
      .from('script_settings')
      .update(updates)
      .eq('id', id)
      .select('id, symbol, lot_size')
      .single();

    if (error) {
      // PGRST116 = no rows returned (not found)
      if (error.code === 'PGRST116') {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (!data) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 6: Return updated row
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/settings/scripts/[id]
 *
 * Removes the script setting with the given id.
 * Returns 404 if the id does not exist.
 *
 * Validates: Requirements 5.4, 5.8, 12.1–12.6
 * Feature: admin-panel-live-data, Property 9: Script settings CRUD round trip
 */
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
    const { id } = resolvedParams;

    // Step 3: Check the row exists before deleting
    // Validates: Requirement 5.8
    const { data: existing, error: fetchError } = await adminClient
      .from('script_settings')
      .select('id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 4: Delete the row
    const { error: deleteError } = await adminClient
      .from('script_settings')
      .delete()
      .eq('id', id);

    if (deleteError) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 5: Return success
    return Response.json({ message: 'Deleted successfully' }, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
