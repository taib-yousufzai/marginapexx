/**
 * Kite Auto Login Script
 * 
 * Uses Playwright to log into Zerodha via a real browser,
 * captures the request_token from the OAuth redirect,
 * exchanges it for an access_token, and saves it to Supabase.
 * 
 * Run by GitHub Actions daily at 06:31 IST.
 */

const { chromium } = require('playwright');
const { TOTP, Secret } = require('otpauth');
const crypto = require('crypto');
const https = require('https');

// ── Env vars ──────────────────────────────────────────────────────────────────
const {
  ZERODHA_USER_ID,
  ZERODHA_PASSWORD,
  ZERODHA_TOTP_SECRET,
  KITE_API_KEY,
  KITE_API_SECRET,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  ZERODHA_SUPABASE_USER_ID,
} = process.env;

function assertEnv(name, value) {
  if (!value) { console.error(`Missing env var: ${name}`); process.exit(1); }
}
assertEnv('ZERODHA_USER_ID', ZERODHA_USER_ID);
assertEnv('ZERODHA_PASSWORD', ZERODHA_PASSWORD);
assertEnv('ZERODHA_TOTP_SECRET', ZERODHA_TOTP_SECRET);
assertEnv('KITE_API_KEY', KITE_API_KEY);
assertEnv('KITE_API_SECRET', KITE_API_SECRET);
assertEnv('SUPABASE_URL', SUPABASE_URL);
assertEnv('SUPABASE_SERVICE_ROLE_KEY', SUPABASE_SERVICE_ROLE_KEY);
assertEnv('ZERODHA_SUPABASE_USER_ID', ZERODHA_SUPABASE_USER_ID);

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateTOTP(secret) {
  const totp = new TOTP({
    secret: Secret.fromBase32(secret),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return totp.generate();
}

function generateChecksum(apiKey, requestToken, apiSecret) {
  return crypto
    .createHash('sha256')
    .update(apiKey + requestToken + apiSecret)
    .digest('hex');
}

function kiteTokenExpiresAt() {
  const now = new Date();
  const expiry = new Date(now);
  expiry.setUTCHours(0, 30, 0, 0);
  if (expiry <= now) expiry.setUTCDate(expiry.getUTCDate() + 1);
  return expiry;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('Starting Kite auto-login...');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  let requestToken = null;

  // Intercept the redirect to capture request_token
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('request_token=')) {
      const match = url.match(/request_token=([^&]+)/);
      if (match) {
        requestToken = match[1];
        console.log('Captured request_token from redirect');
      }
    }
  });

  try {
    // ── Step 1: Navigate to Kite Connect login ──────────────────────────────
    const loginUrl = `https://kite.trade/connect/login?api_key=${KITE_API_KEY}&v=3`;
    console.log('Navigating to Kite Connect login...');
    await page.goto(loginUrl, { waitUntil: 'networkidle' });

    // ── Step 2: Enter user ID ───────────────────────────────────────────────
    console.log('Entering user ID...');
    await page.fill('input[type="text"]', ZERODHA_USER_ID);
    await page.fill('input[type="password"]', ZERODHA_PASSWORD);
    await page.click('button[type="submit"]');

    // ── Step 3: Wait for TOTP field ─────────────────────────────────────────
    console.log('Waiting for TOTP field...');
    await page.waitForSelector('input[type="text"][autocomplete="one-time-code"], input[label="External TOTP"], input[placeholder*="TOTP"], input[placeholder*="totp"]', {
      timeout: 10000,
    }).catch(async () => {
      // Try a more generic selector
      await page.waitForSelector('input[type="text"]:not([value])', { timeout: 5000 });
    });

    // ── Step 4: Enter TOTP ──────────────────────────────────────────────────
    const totpCode = generateTOTP(ZERODHA_TOTP_SECRET);
    console.log('Entering TOTP code...');

    // Find the TOTP input — it's usually the only visible text input after password step
    const inputs = await page.$$('input[type="text"]');
    if (inputs.length > 0) {
      await inputs[inputs.length - 1].fill(totpCode);
    }

    // Submit
    await page.click('button[type="submit"]').catch(() => {});

    // ── Step 5: Wait for redirect with request_token ────────────────────────
    console.log('Waiting for OAuth redirect...');
    await page.waitForURL(/request_token=/, { timeout: 15000 }).catch(() => {
      // May have already redirected — check current URL
      const url = page.url();
      const match = url.match(/request_token=([^&]+)/);
      if (match) requestToken = match[1];
    });

    if (!requestToken) {
      const url = page.url();
      const match = url.match(/request_token=([^&]+)/);
      if (match) requestToken = match[1];
    }

    if (!requestToken) {
      console.error('Failed to capture request_token. Current URL:', page.url());
      await page.screenshot({ path: 'login-debug.png' });
      process.exit(1);
    }

    console.log('Got request_token, exchanging for access_token...');

  } finally {
    await browser.close();
  }

  // ── Step 6: Exchange request_token for access_token ──────────────────────
  const checksum = generateChecksum(KITE_API_KEY, requestToken, KITE_API_SECRET);

  const tokenResult = await fetchJson('https://api.kite.trade/session/token', {
    method: 'POST',
    headers: {
      'X-Kite-Version': '3',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      api_key: KITE_API_KEY,
      request_token: requestToken,
      checksum,
    }).toString(),
  });

  if (!tokenResult.ok || !tokenResult.data?.data?.access_token) {
    console.error('Token exchange failed:', tokenResult.data);
    process.exit(1);
  }

  const accessToken = tokenResult.data.data.access_token;
  const kiteUserId = tokenResult.data.data.user_id;
  const expiresAt = kiteTokenExpiresAt();

  console.log(`Got access_token for ${kiteUserId}, expires at ${expiresAt.toISOString()}`);

  // ── Step 7: Save to Supabase ──────────────────────────────────────────────
  const upsertResult = await fetchJson(
    `${SUPABASE_URL}/rest/v1/kite_sessions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: ZERODHA_SUPABASE_USER_ID,
        kite_user_id: kiteUserId,
        access_token: accessToken,
        expires_at: expiresAt.toISOString(),
      }),
    }
  );

  if (!upsertResult.ok) {
    console.error('Failed to save session to Supabase:', upsertResult.data);
    process.exit(1);
  }

  console.log('✅ Kite session saved successfully. Auto-login complete.');
})();
