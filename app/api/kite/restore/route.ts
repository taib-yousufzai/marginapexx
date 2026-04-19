/**
 * Kite Session Restore
 * POST /api/kite/restore
 *
 * Called on app load when the kite_access_token cookie is missing.
 * Looks up the Supabase user's saved Kite session and re-sets the cookie.
 *
 * This handles the case where:
 * - User cleared cookies but token is still valid in DB
 * - User opened the app on a new device/browser
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { loadKiteSession } from '@/lib/kiteSession';

async function getSupabaseUserId(request: NextRequest): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  const cookieHeader = request.headers.get('cookie') ?? '';
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { cookie: cookieHeader } },
  });

  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // If cookie already exists, nothing to do
  const existingToken = request.cookies.get('kite_access_token')?.value;
  if (existingToken) {
    return NextResponse.json({ restored: false, reason: 'cookie_exists' });
  }

  const supabaseUserId = await getSupabaseUserId(request);
  if (!supabaseUserId) {
    return NextResponse.json({ restored: false, reason: 'not_authenticated' });
  }

  try {
    const session = await loadKiteSession(supabaseUserId);

    if (!session) {
      return NextResponse.json({ restored: false, reason: 'no_session' });
    }

    // Re-set the cookie from the DB value
    const response = NextResponse.json({ restored: true });

    response.cookies.set('kite_access_token', session.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: session.expiresAt,
    });

    return response;
  } catch (err) {
    console.error('Kite restore error:', err);
    return NextResponse.json({ restored: false, reason: 'error' });
  }
}
