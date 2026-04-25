/**
 * POST /api/kite/autologin
 *
 * Fully automated Zerodha login using stored credentials + TOTP.
 * Flow:
 *   1. POST credentials to Zerodha login endpoint → get request_id
 *   2. Generate TOTP code from secret
 *   3. POST TOTP to Zerodha 2FA endpoint → get request_token
 *   4. Exchange request_token for access_token via Kite Connect API
 *   5. Save access_token to DB + set cookie
 *
 * Protected by a shared secret (AUTOLOGIN_SECRET env var).
 * Called by the daily cron job (vercel.json) at 06:31 IST = 01:01 UTC.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as OTPAuth from 'otpauth';
import crypto from 'crypto';
import { saveKiteSession, kiteTokenExpiresAt } from '@/lib/kiteSession';

function generateChecksum(apiKey: string, requestToken: string, apiSecret: string): string {
  return crypto
    .createHash('sha256')
    .update(apiKey + requestToken + apiSecret)
    .digest('hex');
}

function generateTOTP(secret: string): string {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return totp.generate();
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleAutoLogin(request);
}

// Vercel cron jobs use GET — secret passed as query param
export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleAutoLogin(request);
}

async function handleAutoLogin(request: NextRequest): Promise<NextResponse> {
  // ── Auth: verify shared secret ──────────────────────────────────────────
  const authHeader = request.headers.get('Authorization');
  const querySecret = request.nextUrl.searchParams.get('secret');
  const expectedSecret = process.env.AUTOLOGIN_SECRET;

  if (!expectedSecret) {
    return NextResponse.json({ error: 'AUTOLOGIN_SECRET not configured' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${expectedSecret}` && querySecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── Env vars ─────────────────────────────────────────────────────────────
  const userId     = process.env.ZERODHA_USER_ID;
  const password   = process.env.ZERODHA_PASSWORD;
  const totpSecret = process.env.ZERODHA_TOTP_SECRET;
  const apiKey     = process.env.KITE_API_KEY;
  const apiSecret  = process.env.KITE_API_SECRET;
  const supabaseUserId = process.env.ZERODHA_SUPABASE_USER_ID; // the Supabase UUID of the account

  if (!userId || !password || !totpSecret || !apiKey || !apiSecret) {
    return NextResponse.json({ error: 'Missing Zerodha credentials in env' }, { status: 500 });
  }

  try {
    // ── Step 1: Login with user ID + password ────────────────────────────
    const loginRes = await fetch('https://kite.zerodha.com/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'X-Kite-Version': '3',
      },
      body: new URLSearchParams({ user_id: userId, password }),
    });

    if (!loginRes.ok) {
      const body = await loginRes.text();
      console.error('[autologin] Login step failed:', loginRes.status, body);
      return NextResponse.json({ error: 'Login step failed', detail: body }, { status: 502 });
    }

    const loginData = await loginRes.json() as {
      status: string;
      data?: { request_id: string; twofa_type: string };
    };

    if (loginData.status !== 'success' || !loginData.data?.request_id) {
      console.error('[autologin] Unexpected login response:', loginData);
      return NextResponse.json({ error: 'Login response unexpected', detail: loginData }, { status: 502 });
    }

    const requestId = loginData.data.request_id;

    // ── Step 2: Submit TOTP ──────────────────────────────────────────────
    const totpCode = generateTOTP(totpSecret);

    const twoFaRes = await fetch('https://kite.zerodha.com/api/twofa', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0',
        'X-Kite-Version': '3',
      },
      body: new URLSearchParams({
        user_id: userId,
        request_id: requestId,
        twofa_value: totpCode,
        twofa_type: 'totp',
        skip_session: 'true',
      }),
    });

    if (!twoFaRes.ok) {
      const body = await twoFaRes.text();
      console.error('[autologin] 2FA step failed:', twoFaRes.status, body);
      return NextResponse.json({ error: '2FA step failed', detail: body }, { status: 502 });
    }

    const twoFaData = await twoFaRes.json() as {
      status: string;
      data?: { request_token?: string };
    };

    // After 2FA, Zerodha redirects to the Kite Connect redirect_uri with request_token.
    // With skip_session=true the token is returned directly in the response body.
    let requestToken = twoFaData.data?.request_token;

    if (!requestToken) {
      // Some versions return it in a redirect URL — parse from Set-Cookie or Location header
      const location = twoFaRes.headers.get('location') ?? '';
      const match = location.match(/request_token=([^&]+)/);
      if (match) requestToken = match[1];
    }

    if (!requestToken) {
      console.error('[autologin] No request_token in 2FA response:', twoFaData);
      return NextResponse.json({ error: 'No request_token after 2FA', detail: twoFaData }, { status: 502 });
    }

    // ── Step 3: Exchange request_token for access_token ──────────────────
    const checksum = generateChecksum(apiKey, requestToken, apiSecret);

    const tokenRes = await fetch('https://api.kite.trade/session/token', {
      method: 'POST',
      headers: {
        'X-Kite-Version': '3',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ api_key: apiKey, request_token: requestToken, checksum }),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error('[autologin] Token exchange failed:', tokenRes.status, body);
      return NextResponse.json({ error: 'Token exchange failed', detail: body }, { status: 502 });
    }

    const tokenData = await tokenRes.json() as {
      data?: { access_token: string; user_id: string };
    };

    const accessToken = tokenData.data?.access_token;
    if (!accessToken) {
      return NextResponse.json({ error: 'No access_token in response', detail: tokenData }, { status: 502 });
    }

    const expiresAt = kiteTokenExpiresAt();

    // ── Step 4: Save to DB ────────────────────────────────────────────────
    if (supabaseUserId) {
      await saveKiteSession(supabaseUserId, {
        kiteUserId: tokenData.data?.user_id ?? userId,
        accessToken,
        expiresAt,
      });
    }

    // ── Step 5: Set cookie and return ────────────────────────────────────
    const response = NextResponse.json({
      success: true,
      expiresAt: expiresAt.toISOString(),
      kiteUserId: tokenData.data?.user_id,
    });

    response.cookies.set('kite_access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });

    console.log('[autologin] Success — token valid until', expiresAt.toISOString());
    return response;

  } catch (err) {
    console.error('[autologin] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error', detail: String(err) }, { status: 500 });
  }
}
