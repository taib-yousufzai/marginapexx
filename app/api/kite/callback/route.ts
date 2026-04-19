/**
 * Kite Connect OAuth Callback
 * GET /api/kite/callback
 *
 * Flow:
 * 1. Receive request_token from Kite redirect
 * 2. Exchange for access_token via Kite API
 * 3. Save access_token to Supabase (kite_sessions table)
 * 4. Set access_token in HTTP-only cookie (fast cache)
 * 5. Redirect to dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { saveKiteSession, kiteTokenExpiresAt } from '@/lib/kiteSession';

function generateChecksum(apiKey: string, requestToken: string, apiSecret: string): string {
  return crypto
    .createHash('sha256')
    .update(apiKey + requestToken + apiSecret)
    .digest('hex');
}

/** Resolve the Supabase user from the session cookie in the request. */
async function getSupabaseUserId(request: NextRequest): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;

  // Extract the Supabase auth cookie — Next.js stores it as sb-<ref>-auth-token
  const cookieHeader = request.headers.get('cookie') ?? '';
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false },
    global: { headers: { cookie: cookieHeader } },
  });

  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const requestToken = searchParams.get('request_token');
  const status = searchParams.get('status');

  if (!requestToken || status !== 'success') {
    return NextResponse.redirect(new URL('/login?kite_error=cancelled', request.url));
  }

  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error('Missing KITE_API_KEY or KITE_API_SECRET');
    return NextResponse.redirect(new URL('/login?kite_error=config', request.url));
  }

  try {
    // ── 1. Exchange request_token for access_token ──────────────────────────
    const checksum = generateChecksum(apiKey, requestToken, apiSecret);

    const tokenResponse = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'X-Kite-Version': '3',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }),
    });

    if (!tokenResponse.ok) {
      const body = await tokenResponse.text();
      console.error('Kite token exchange failed:', tokenResponse.status, body);
      return NextResponse.redirect(new URL('/login?kite_error=token_exchange', request.url));
    }

    const tokenData = await tokenResponse.json() as {
      data?: {
        access_token: string;
        user_id: string;
        user_name: string;
        email: string;
      };
    };

    const accessToken = tokenData.data?.access_token;
    const kiteUserId = tokenData.data?.user_id ?? '';

    if (!accessToken) {
      console.error('No access_token in Kite response');
      return NextResponse.redirect(new URL('/login?kite_error=no_token', request.url));
    }

    const expiresAt = kiteTokenExpiresAt();

    // ── 2. Save to Supabase (best-effort — don't block redirect on failure) ──
    const supabaseUserId = await getSupabaseUserId(request);
    if (supabaseUserId) {
      try {
        await saveKiteSession(supabaseUserId, { kiteUserId, accessToken, expiresAt });
      } catch (err) {
        // Log but don't fail — cookie fallback still works
        console.error('Failed to persist Kite session to DB:', err);
      }
    } else {
      console.warn('Could not resolve Supabase user — Kite token saved to cookie only');
    }

    // ── 3. Set HTTP-only cookie (fast cache for API routes) ──────────────────
    const redirectResponse = NextResponse.redirect(new URL('/', request.url));

    redirectResponse.cookies.set('kite_access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    return redirectResponse;
  } catch (err) {
    console.error('Kite callback error:', err);
    return NextResponse.redirect(new URL('/login?kite_error=server', request.url));
  }
}
