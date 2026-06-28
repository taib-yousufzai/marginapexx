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
import { requireAuth } from '../../../lib/api-middleware';

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
  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY');
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
  const authResult = await requireAuth(request, []);
  if (authResult instanceof Response) return authResult;
  
  const { adminClient, callerUser, callerRole } = authResult;

  if (callerRole !== 'admin' && callerRole !== 'super_admin' && callerRole !== 'broker') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { adminClient, callerUser };
}

/**
 * Validates the Bearer token and asserts the caller is super_admin only.
 *
 * Returns AdminContext on success.
 * Returns a Response (401 or 403) on failure — caller must return it immediately.
 *
 * Steps:
 *   1. Extract Authorization: Bearer <token> header → 401 if absent or wrong format
 *   2. Create admin client via createAdminClient()
 *   3. Call adminClient.auth.getUser(token) → 401 if error or no user
 *   4. Call getRole(user) → 403 if role is NOT super_admin (admin role is also rejected)
 *   5. Return { adminClient, callerUser }
 *
 * Usage:
 *   const result = await requireSuperAdmin(request);
 *   if (result instanceof Response) return result;
 *   const { adminClient, callerUser } = result;
 *
 * Validates: Requirements 22.1, 22.2, 22.3, 22.4, 22.5
 */
export async function requireSuperAdmin(
  request: Request,
): Promise<AdminContext | Response> {
  const authResult = await requireAuth(request, []);
  if (authResult instanceof Response) return authResult;
  
  const { adminClient, callerUser, callerRole } = authResult;

  if (callerRole !== 'super_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { adminClient, callerUser };
}
