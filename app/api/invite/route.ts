/**
 * Invite API Route Handler
 * POST /api/invite
 *
 * Allows super admins to invite admins and admins to invite brokers via
 * Supabase's admin invite mechanism. Runs server-side only.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9,
 *            5.10, 5.11, 5.12, 8.3
 */

import { createClient } from '@supabase/supabase-js';
import { getRole } from '../../../lib/auth';

/**
 * Creates a Supabase admin client using the service role key.
 * Defined inside the module (not at module level) to prevent accidental
 * client-side bundling of the service role key.
 *
 * Validates: Requirements 5.2, 8.3
 */
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Permission matrix for invite operations.
 * Returns true if the caller is permitted to invite a user with the given role.
 *
 * | Caller Role  | Requested Role | Result |
 * |--------------|----------------|--------|
 * | super_admin  | admin          | ✅ 200 |
 * | super_admin  | broker/user    | ❌ 403 |
 * | admin        | broker         | ✅ 200 |
 * | admin        | admin/user     | ❌ 403 |
 * | broker/user  | any            | ❌ 403 |
 *
 * Validates: Requirements 5.5, 5.6, 5.7, 5.8, 5.9
 */
function isPermitted(callerRole: string, requestedRole: string): boolean {
  if (callerRole === 'super_admin') return requestedRole === 'admin';
  if (callerRole === 'admin') return requestedRole === 'broker';
  return false;
}

/**
 * POST /api/invite
 *
 * Request body: { email: string, role: string }
 * Authorization: Bearer <token>
 *
 * Validates: Requirements 5.1–5.12, 8.3
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Step 1: Parse JSON body — 400 if email or role missing
    // Validates: Requirement 5.12
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { email, role: requestedRole } = body as { email?: string; role?: string };

    if (!email || !requestedRole) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Step 2: Extract Authorization: Bearer <token> — 401 if absent
    // Validates: Requirements 5.3, 5.4
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 3: Validate session via admin client
    // Validates: Requirements 5.3, 5.4
    const adminClient = createAdminClient();
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !userData?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Step 4: Determine caller role and apply permission matrix
    // Validates: Requirements 5.5, 5.6, 5.7, 5.8, 5.9
    const callerRole = getRole(userData.user);

    if (!isPermitted(callerRole, requestedRole)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Step 5: Invite the user via Supabase admin API
    // Validates: Requirements 5.5, 5.6, 5.10, 5.11
    const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: { role: requestedRole },
    });

    if (inviteError) {
      return Response.json(
        { error: 'Failed to send invite. Please try again.' },
        { status: 500 },
      );
    }

    // Validates: Requirement 5.10
    return Response.json({ success: true }, { status: 200 });
  } catch {
    // Unexpected exception — Validates: design error handling table
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
