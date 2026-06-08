/**
 * KiteAutoLogin — Self-healing Kite session manager.
 *
 * Ports the kite_autologin.py HTTP flow into the ticker process so the
 * Kite session is renewed automatically without any external scheduler.
 *
 * Flow:
 *   POST /api/login       (user_id + password)
 *   POST /api/twofa       (TOTP code)
 *   GET  connect/login    (OAuth redirect — capture request_token)
 *   POST /session/token   (exchange request_token for access_token)
 *   saveKiteSession()     (upsert to Supabase)
 *
 * The KiteSessionMonitor checks every 5 minutes and triggers logi
 * 90 minutes before the token expires, providing a comfortable renewal
 * window with retry headroom before market open.
 */
import { TOTP, Secret } from 'otpauth';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import pino from 'pino';
import { saveKiteSession, kiteTokenExpiresAt, invalidateSharedKiteSessionCache } from '../../lib/kiteSession.ts';
import type { KiteSessionData } from '../../lib/kiteSession.ts';

const logger = pino({ name: 'kite-autologin' });

const KITE_LOGIN_URL = 'https://kite.zerodha.com/api/login';
const KITE_TWOFA_URL = 'https://kite.zerodha.com/api/twofa';
const KITE_CONNECT_URL = 'https://kite.trade/connect/login';
const KITE_TOKEN_URL = 'https://api.kite.trade/session/token';

/** Renew session this many minutes before expiry */
const RENEW_BEFORE_EXPIRY_MINUTES = 90;
/** Check session age on this interval */
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
/** Retry failed logins after this delay */
const RETRY_DELAY_MS = 3 * 60 * 1000; // 3 minutes
/** Max consecutive login failures before escalating alert level */
const MAX_CONSECUTIVE_FAILURES = 3;

// ---------------------------------------------------------------------------
// Pure auth flow — no side effects beyond returning a session
// ---------------------------------------------------------------------------

function generateTOTP(secret: string): string {
  const totp = new TOTP({
    secret: Secret.fromBase32(secret.replace(/\s/g, '')),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return totp.generate();
}

function generateChecksum(apiKey: string, requestToken: string, apiSecret: string): string {
  return crypto.createHash('sha256')
    .update(apiKey + requestToken + apiSecret)
    .digest('hex');
}

/**
 * Performs the complete Kite Connect OAuth login flow via HTTP.
 * Returns a valid KiteSessionData on success, throws on failure.
 *
 * This is a direct port of kite_autologin.py — same endpoints, same logic.
 */
export async function performKiteLogin(): Promise<KiteSessionData> {
  const userId = process.env.ZERODHA_USER_ID;
  const password = process.env.ZERODHA_PASSWORD;
  const totpSecret = process.env.ZERODHA_TOTP_SECRET;
  const apiKey = process.env.KITE_API_KEY || process.env.NEXT_PUBLIC_KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;
  const supabaseUserId = process.env.ZERODHA_SUPABASE_USER_ID;

  if (!userId || !password || !totpSecret || !apiKey || !apiSecret || !supabaseUserId) {
    throw new Error('Missing required env vars: ZERODHA_USER_ID, ZERODHA_PASSWORD, ZERODHA_TOTP_SECRET, KITE_API_KEY, KITE_API_SECRET, ZERODHA_SUPABASE_USER_ID');
  }

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Kite-Version': '3',
  };

  // ── Step 1: Login ──────────────────────────────────────────────────────────
  logger.info('Kite autologin: Step 1 — posting credentials');
  const loginRes = await fetch(KITE_LOGIN_URL, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ user_id: userId, password }).toString(),
  });
  const loginData = await loginRes.json() as any;

  if (loginData?.status !== 'success') {
    throw new Error(`Kite login failed: ${JSON.stringify(loginData)}`);
  }
  const requestId: string = loginData.data.request_id;
  logger.info({ requestId }, 'Kite autologin: Step 1 success');

  // ── Step 2: TOTP ───────────────────────────────────────────────────────────
  logger.info('Kite autologin: Step 2 — submitting TOTP');
  const totpCode = generateTOTP(totpSecret);
  const twofaRes = await fetch(KITE_TWOFA_URL, {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      user_id: userId,
      request_id: requestId,
      twofa_value: totpCode,
      skip_session: '',
    }).toString(),
  });
  const twofaData = await twofaRes.json() as any;

  if (twofaData?.status !== 'success') {
    throw new Error(`Kite 2FA failed: ${JSON.stringify(twofaData)}`);
  }
  logger.info('Kite autologin: Step 2 success');

  // ── Step 3: OAuth redirect — capture request_token ─────────────────────────
  logger.info('Kite autologin: Step 3 — following OAuth redirect');
  const connectUrl = `${KITE_CONNECT_URL}?v=3&api_key=${apiKey}&skip_session=true`;
  let requestToken: string | null = null;
  let currentUrl = connectUrl;

  for (let i = 0; i < 6 && !requestToken; i++) {
    const res = await fetch(currentUrl, {
      method: 'GET',
      headers: { ...headers, 'Cookie': twofaRes.headers.get('set-cookie') || '' },
      redirect: 'manual',
    });

    const location = res.headers.get('location') || '';
    if (location) {
      currentUrl = location;
      const match = location.match(/request_token=([^&]+)/);
      if (match) requestToken = match[1];
    } else {
      // No redirect — check if we're already at the destination URL
      const match = currentUrl.match(/request_token=([^&]+)/);
      if (match) requestToken = match[1];
      break;
    }
  }

  if (!requestToken) {
    throw new Error(`Failed to capture request_token. Final URL: ${currentUrl}`);
  }
  logger.info('Kite autologin: Step 3 success — captured request_token');

  // ── Step 4: Exchange request_token for access_token ────────────────────────
  logger.info('Kite autologin: Step 4 — exchanging token');
  const checksum = generateChecksum(apiKey, requestToken, apiSecret);
  const tokenRes = await fetch(KITE_TOKEN_URL, {
    method: 'POST',
    headers: { ...headers },
    body: new URLSearchParams({
      api_key: apiKey,
      request_token: requestToken,
      checksum,
    }).toString(),
  });
  const tokenData = await tokenRes.json() as any;

  if (!tokenRes.ok || !tokenData?.data?.access_token) {
    throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
  }

  const accessToken: string = tokenData.data.access_token;
  const kiteUserId: string = tokenData.data.user_id;
  const expiresAt = kiteTokenExpiresAt();

  logger.info({ kiteUserId, expiresAt }, 'Kite autologin: Step 4 success');

  // ── Step 5: Persist to Supabase ────────────────────────────────────────────
  logger.info('Kite autologin: Step 5 — saving session to Supabase');
  await saveKiteSession(supabaseUserId, { kiteUserId, accessToken, expiresAt });
  logger.info('Kite autologin: Step 5 complete — session saved');

  return { kiteUserId, accessToken, expiresAt };
}

// ---------------------------------------------------------------------------
// Session Monitor — runs inside the ticker process
// ---------------------------------------------------------------------------

export interface SessionStatus {
  sessionValid: boolean;
  expiresAt: Date | null;
  minutesUntilExpiry: number | null;
  lastSuccessfulLogin: Date | null;
  lastLoginAttempt: Date | null;
  lastLoginFailure: Date | null;
  consecutiveFailures: number;
}

/**
 * KiteSessionMonitor — emits events and monitors session health.
 *
 * Events:
 *   'session-refreshed' (newSession: KiteSessionData) — call reconnect logic
 *   'login-failed'      (err: Error)                  — for alerting
 *   'session-warning'   (minutesLeft: number)          — < 60 min remaining
 *   'session-critical'                                 — expired / login failed 3x
 */
export class KiteSessionMonitor extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private isStopping = false;
  private isLoginInProgress = false;

  private status: SessionStatus = {
    sessionValid: false,
    expiresAt: null,
    minutesUntilExpiry: null,
    lastSuccessfulLogin: null,
    lastLoginAttempt: null,
    lastLoginFailure: null,
    consecutiveFailures: 0,
  };

  /** Call this once at startup with the initial session from DB (may be null) */
  public setInitialSession(session: KiteSessionData | null) {
    if (session) {
      this.status.sessionValid = true;
      this.status.expiresAt = session.expiresAt;
      this.status.minutesUntilExpiry = this.computeMinutesLeft(session.expiresAt);
    }
  }

  public start() {
    logger.info('KiteSessionMonitor started — checking every 5 minutes');
    // Run immediately, then on interval
    this.check();
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  public stop() {
    this.isStopping = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
  }

  public getStatus(): SessionStatus {
    // Refresh computed minutesUntilExpiry
    if (this.status.expiresAt) {
      this.status.minutesUntilExpiry = this.computeMinutesLeft(this.status.expiresAt);
      this.status.sessionValid = this.status.minutesUntilExpiry > 0;
    }
    return { ...this.status };
  }

  private computeMinutesLeft(expiresAt: Date): number {
    return Math.floor((expiresAt.getTime() - Date.now()) / 60_000);
  }

  private async check() {
    if (this.isStopping || this.isLoginInProgress) return;

    const minutesLeft = this.status.expiresAt
      ? this.computeMinutesLeft(this.status.expiresAt)
      : -1;

    this.status.minutesUntilExpiry = minutesLeft;

    if (minutesLeft <= 0) {
      logger.error({ minutesLeft }, 'Kite session has expired — triggering emergency login');
      this.emit('session-critical');
      await this.attemptLogin('expired');
    } else if (minutesLeft <= 60) {
      logger.warn({ minutesLeft }, 'Kite session expiring within 60 minutes — WARNING');
      this.emit('session-warning', minutesLeft);
      if (minutesLeft <= RENEW_BEFORE_EXPIRY_MINUTES) {
        await this.attemptLogin('proactive');
      }
    } else if (minutesLeft <= RENEW_BEFORE_EXPIRY_MINUTES) {
      logger.info({ minutesLeft }, `Kite session expiring within ${RENEW_BEFORE_EXPIRY_MINUTES} min — proactive renewal`);
      await this.attemptLogin('proactive');
    } else {
      logger.debug({ minutesLeft }, 'Kite session healthy');
    }
  }

  private async attemptLogin(reason: 'proactive' | 'expired') {
    if (this.isLoginInProgress) return;
    this.isLoginInProgress = true;
    this.status.lastLoginAttempt = new Date();

    logger.info({ reason }, 'Attempting Kite auto-login...');

    try {
      const session = await performKiteLogin();

      // Success
      this.status.sessionValid = true;
      this.status.expiresAt = session.expiresAt;
      this.status.minutesUntilExpiry = this.computeMinutesLeft(session.expiresAt);
      this.status.lastSuccessfulLogin = new Date();
      this.status.consecutiveFailures = 0;

      // Bust the in-process session cache so initKite() picks up the new token
      invalidateSharedKiteSessionCache();

      logger.info({ expiresAt: session.expiresAt }, '✅ Kite session renewed successfully');
      this.emit('session-refreshed', session);
    } catch (err: any) {
      this.status.consecutiveFailures++;
      this.status.lastLoginFailure = new Date();

      logger.error({ err: err.message, consecutiveFailures: this.status.consecutiveFailures }, '❌ Kite auto-login failed');
      this.emit('login-failed', err);

      if (this.status.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        logger.fatal({ consecutiveFailures: this.status.consecutiveFailures },
          'CRITICAL: Kite auto-login failed multiple times. Manual intervention may be required.');
        this.emit('session-critical');
      } else {
        // Schedule a retry sooner than the normal 5-minute check
        logger.info({ retryInMs: RETRY_DELAY_MS }, 'Scheduling retry in 3 minutes...');
        this.retryTimer = setTimeout(() => {
          this.isLoginInProgress = false;
          this.attemptLogin(reason);
        }, RETRY_DELAY_MS);
        // Don't fall through to the finally block's reset
        return;
      }
    } finally {
      this.isLoginInProgress = false;
    }
  }
}
