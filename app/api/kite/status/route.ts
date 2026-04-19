/**
 * Kite Auth Status
 * GET /api/kite/status
 *
 * Checks if the user has a valid Kite session.
 * Priority: cookie → DB → not connected
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ connected: false, reason: 'not_configured' });
  }

  // ── 1. Check cookie first (fast path) ────────────────────────────────────
  let accessToken = request.cookies.get('kite_access_token')?.value;

  // ── 2. Fall back to DB if cookie missing ─────────────────────────────────
  if (!accessToken) {
    const supabaseUserId = await getSupabaseUserId(request);
    if (supabaseUserId) {
      const session = await loadKiteSession(supabaseUserId);
      if (session) {
        accessToken = session.accessToken;
      }
    }
  }

  if (!accessToken) {
    return NextResponse.json({ connected: false, reason: 'no_token' });
  }

  // ── 3. Verify token is still valid with Kite ─────────────────────────────
  try {
    const response = await fetch('https://api.kite.trade/user/profile', {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ connected: false, reason: 'token_invalid' });
    }

    const data = await response.json() as {
      data?: { user_name?: string; email?: string; user_id?: string };
    };

    return NextResponse.json({
      connected: true,
      userName: data.data?.user_name,
      email: data.data?.email,
      kiteUserId: data.data?.user_id,
    });
  } catch {
    return NextResponse.json({ connected: false, reason: 'network_error' });
  }
}
