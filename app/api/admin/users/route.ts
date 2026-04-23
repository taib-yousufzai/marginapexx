/**
 * GET /api/admin/users
 *
 * Returns a list of all user profiles for admin management.
 *
 * Validates: Requirements 2.1–2.6, 12.1–12.6
 */

/**
 * POST /api/admin/users
 *
 * Creates a new Supabase auth user and inserts a corresponding profile row.
 * On profile insert failure, rolls back by deleting the auth user.
 *
 * Validates: Requirements 3.2–3.9
 */

import { requireAdmin } from '../_auth';

export async function GET(request: Request): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 2.2, 2.5, 12.1–12.6
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Query all profiles with the required UserListItem fields
    // Validates: Requirements 2.3, 2.4
    const { data, error } = await adminClient
      .from('profiles')
      .select(
        'id, email, full_name, phone, role, parent_id, segments, active, read_only, demo_user, balance, created_at, scheduled_delete_at',
      );

    if (error) {
      console.error('[GET /api/admin/users] DB error:', error);
      return Response.json({ error: 'Internal server error', detail: error.message }, { status: 500 });
    }

    // Step 3: Return the profile array
    // Validates: Requirement 2.4
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Profile fields extracted from the request body (excluding email and password)
const PROFILE_FIELDS = [
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

export async function POST(request: Request): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 2.1–2.7
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Parse JSON body
    // Validates: Requirement 6.4
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Step 3: Validate required fields
    // Validates: Requirement 3.8
    const { email, password } = body;
    if (!email || !password) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Step 4: Validate password length
    // Validates: Requirement 3.9
    if (typeof password === 'string' && password.length < 8) {
      return Response.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      );
    }

    // Extract profile fields from body
    const profileFields: Record<string, unknown> = {};
    for (const field of PROFILE_FIELDS) {
      if (field in body) {
        profileFields[field] = body[field];
      }
    }

    // Step 5: Create auth user
    // Validates: Requirements 3.2, 3.4
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: email as string,
      password: password as string,
      email_confirm: true,
      user_metadata: { role: body.role },
    });

    if (createError || !createData?.user) {
      return Response.json(
        { error: createError?.message ?? 'Failed to create user' },
        { status: 422 },
      );
    }

    const newUser = createData.user;

    // Step 6: Insert profile row
    // Validates: Requirements 3.3, 3.5
    const { error: insertError } = await adminClient
      .from('profiles')
      .insert({ id: newUser.id, email: email as string, ...profileFields });

    if (insertError) {
      // Rollback: attempt to delete the auth user
      await adminClient.auth.admin.deleteUser(newUser.id);
      return Response.json(
        { error: 'Failed to create profile. User creation rolled back.' },
        { status: 500 },
      );
    }

    // Step 7: Return 201 with id and email
    // Validates: Requirement 3.6
    return Response.json({ id: newUser.id, email: newUser.email }, { status: 201 });
  } catch {
    // Outer catch: unhandled exceptions
    // Validates: Requirement 6.1
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
