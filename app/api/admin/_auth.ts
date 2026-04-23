/**
 * Shared admin authentication helper.
 * Used by all /api/admin/* route handlers to validate the caller's identity
 * and assert they hold the admin or super_admin role.
 *
 * Validates: Requirements 2.1–2.7
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { getRole } from '../../../lib/auth';

export interface AdminContext {
  adminClient: SupabaseClient;
  callerUser: User;
}

/**
 * Creates a Supabase admin client using the service role key.
 * Defined as a module-level function (not at module scope) to prevent
 * accidental client-side bundling of the service role key.
 *
 * Validates: Requirements 2.7, 6.3
 */
function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Server configuration error');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Validates the Bearer token and asserts the caller is admin or super_admin.
 *
 * Returns AdminContext on success.
 * Returns a Response (401 or 403) on failure — caller must return it immediately.
 *
 * Steps:
 *   1. Extract Authorization: Bearer <token> header → 401 if absent or wrong format
 *   2. Create admin client via createAdminClient()
 *   3. Call adminClient.auth.getUser(token) → 401 if error or no user
 *   4. Call getRole(user) → 403 if role is not admin or super_admin
 *   5. Return { adminClient, callerUser }
 *
 * Usage:
 *   const result = await requireAdmin(request);
 *   if (result instanceof Response) return result;
 *   const { adminClient, callerUser } = result;
 *
 * Validates: Requirements 2.1–2.7
 */
export async function requireAdmin(
  request: Request,
): Promise<AdminContext | Response> {
  // Step 1: Extract Authorization: Bearer <token> header
  // Validates: Requirements 2.1, 2.2
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 2: Create admin client
  // Validates: Requirement 2.7
  const adminClient = createAdminClient();

  // Step 3: Validate session via admin client
  // Validates: Requirements 2.3, 2.4
  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Step 4: Determine caller role and assert admin or super_admin
  // Validates: Requirements 2.5, 2.6
  const role = getRole(userData.user);
  if (role !== 'admin' && role !== 'super_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Step 5: Return context
  return { adminClient, callerUser: userData.user };
}
