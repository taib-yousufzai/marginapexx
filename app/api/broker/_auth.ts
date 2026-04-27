/**
 * Shared broker authentication helper.
 * Validates the caller holds at least the 'broker' role.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { getRole } from '../../../lib/auth';

export interface BrokerContext {
  adminClient: SupabaseClient;
  callerUser: User;
  role: string;
}

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
 * Validates the token and ensures the user is a broker, admin, or super_admin.
 */
export async function requireBroker(
  request: Request,
): Promise<BrokerContext | Response> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let adminClient: SupabaseClient;
  try {
    adminClient = createAdminClient();
  } catch (e) {
    console.error('[requireBroker] createAdminClient failed:', e);
    return Response.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const role = getRole(userData.user);
  // Broker permission is granted to brokers, admins, and super admins.
  if (role !== 'broker' && role !== 'admin' && role !== 'super_admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  return { adminClient, callerUser: userData.user, role };
}
