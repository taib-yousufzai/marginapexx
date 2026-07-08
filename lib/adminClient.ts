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

const pendingRequests = new Map<string, Promise<any>>();

/**
 * Resolve and verify a Supabase Bearer JWT from an Authorization header.
 * Returns the user object or null if invalid.
 */
export async function getUserFromRequest(request: Request) {
  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;

  const token = auth.slice(7).trim();
  if (!token || token === 'null' || token === 'undefined') return null;

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

  // Prevent cache stampede by reusing pending requests for the same token
  if (pendingRequests.has(token)) {
    try {
      return await pendingRequests.get(token);
    } catch (e) {
      return null;
    }
  }

  const fetchUser = async () => {
    const admin = getAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) {
      if (error?.message !== 'Auth session missing!') {
        console.error('[getUserFromRequest] Auth error:', error);
      }
      return null;
    }

    try {
      const { getRedisClient } = await import('./redis');
      const redis = getRedisClient();
      // Cache the user for 1 hour to avoid hitting Supabase API rate limits
      // Token usually expires in 1 hour anyway.
      if (redis.setex) {
        await redis.setex(`auth_user:${token}`, 3600, JSON.stringify(data.user));
      } else {
        await redis.set(`auth_user:${token}`, JSON.stringify(data.user), 'EX', 3600);
      }
    } catch (err) {
      // Ignore Redis errors
    }
    return data.user;
  };

  const promise = fetchUser().finally(() => {
    pendingRequests.delete(token);
  });
  pendingRequests.set(token, promise);

  return promise;
}
