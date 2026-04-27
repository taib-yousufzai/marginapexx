/**
 * GET    /api/admin/users/[id]
 * PATCH  /api/admin/users/[id]
 * DELETE /api/admin/users/[id]
 *
 * Validates: Requirements 4.2–4.10, 5.2–5.8, 8.5–8.7, 13.7
 */

import { requireAdmin } from '../../_auth';

// Profile fields that can be updated via PATCH (password is handled separately)
const PROFILE_FIELDS = [
  'email',
  'full_name',
  'phone',
  'role',
  'parent_id',
  'segments',
  'active',
  'read_only',
  'demo_user',
  'intraday_sq_off',
  'auto_sqoff',
  'sqoff_method',
] as const;

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

    // Resolve params (may be a Promise in newer Next.js versions)
    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    // Step 2: Query the profile row
    // Validates: Requirements 8.5, 13.7
    const { data, error } = await adminClient
      .from('profiles')
      .select(
        'id, email, full_name, phone, role, parent_id, segments, active, read_only, demo_user, intraday_sq_off, auto_sqoff, sqoff_method, balance, created_at, scheduled_delete_at',
      )
      .eq('id', id)
      .single();

    if (error || data === null) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // Step 3: Return the profile
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 2.1–2.7
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Resolve params (may be a Promise in newer Next.js versions)
    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    // Step 2: Parse JSON body
    // Validates: Requirement 6.4
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Step 3: If password present and non-empty, validate length
    // Validates: Requirement 4.10
    const { password } = body;
    if (password !== undefined && password !== '') {
      if (typeof password === 'string' && password.length < 8) {
        return Response.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 },
        );
      }
    }

    // Extract profile fields from body (excluding password)
    const profileFields: Record<string, unknown> = {};
    for (const field of PROFILE_FIELDS) {
      if (field in body) {
        profileFields[field] = body[field];
      }
    }

    // Step 4: Update profile row
    // Validates: Requirements 4.2, 4.6
    const { data: profileData, error: profileError } = await adminClient
      .from('profiles')
      .update(profileFields)
      .eq('id', id)
      .select()
      .single();

    if (profileError || profileData === null) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    // Step 5: Sync role/active to auth user_metadata if present in body
    // Validates: Requirement 4.3
    if ('role' in body || 'active' in body) {
      const userMetadata: Record<string, unknown> = {};
      if ('role' in body) userMetadata.role = body.role;
      if ('active' in body) userMetadata.active = body.active;
      await adminClient.auth.admin.updateUserById(id, { user_metadata: userMetadata });
    }

    // Step 6: Update password if present and non-empty
    // Validates: Requirements 4.4, 4.5
    if (password !== undefined && password !== '' && typeof password === 'string') {
      await adminClient.auth.admin.updateUserById(id, { password });
    }

    // Step 7: Return success
    // Validates: Requirement 4.7
    return Response.json({ success: true }, { status: 200 });
  } catch {
    // Outer catch: unhandled exceptions
    // Validates: Requirement 6.1
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 2.1–2.7
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Resolve params (may be a Promise in newer Next.js versions)
    const resolvedParams = await Promise.resolve(params);
    const id = resolvedParams.id;

    // Step 2: Hard-delete the user from auth (cascades to profiles)
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(id);

    if (deleteError) {
      console.error('[DELETE /api/admin/users/[id]] delete error:', deleteError.message);
      return Response.json({ error: 'Failed to delete user' }, { status: 500 });
    }

    // Step 3: Return success
    return Response.json({ success: true }, { status: 200 });
  } catch {
    // Outer catch: unhandled exceptions
    // Validates: Requirement 6.1
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
