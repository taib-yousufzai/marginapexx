/**
 * Shared Supabase admin (service-role) client factory.
 * Imported by API routes that need full DB access.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (_adminClient) return _adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL');
  if (!key) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY');

  _adminClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _adminClient;
}

/**
 * Resolve and verify a Supabase Bearer JWT from an Authorization header.
 * Returns the user object or null if invalid.
 */
export async function getUserFromRequest(request: Request) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;

  const token = auth.slice(7).trim();
  if (!token) return null;

  try {
    const { getRedisClient } = await import('./redis');
    const redis = getRedisClient();
    const cachedUser = await redis.get(`auth_user:${token}`);
    if (cachedUser) {
      return JSON.parse(cachedUser);
    }
  } catch (err) {
    // Ignore Redis errors
  }

  const admin = getAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;

  try {
    const { getRedisClient } = await import('./redis');
    const redis = getRedisClient();
    // Cache the user for 60 seconds to avoid hitting Supabase API rate limits
    if (redis.setex) {
      await redis.setex(`auth_user:${token}`, 60, JSON.stringify(data.user));
    } else {
      await redis.set(`auth_user:${token}`, JSON.stringify(data.user), 'EX', 60);
    }
  } catch (err) {
    // Ignore Redis errors
  }

  return data.user;
}
