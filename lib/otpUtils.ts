import { createHash } from 'crypto';

/**
 * Returns true iff `phone` is a valid E.164 telephone number.
 * E.164 format: starts with '+', followed by 1–9 (non-zero), then 1–14 digits.
 * Total length: 3–16 characters ('+' + 2–15 digits).
 */
export function isE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

/**
 * Determines the delivery channel from an unknown request body.
 * Returns "sms" only when `body.channel === "sms"`.
 * Returns "email" for all other cases: absent, null, undefined, or empty string.
 */
export function resolveChannel(body: unknown): 'email' | 'sms' {
  if (
    body !== null &&
    typeof body === 'object' &&
    'channel' in body &&
    (body as Record<string, unknown>).channel === 'sms'
  ) {
    return 'sms';
  }
  return 'email';
}

/**
 * Computes the number of seconds remaining before a new OTP can be requested.
 * Returns `60 - Math.floor((now - timestamp) / 1000)`.
 *
 * @param timestamp - The millisecond timestamp of the last OTP send (e.g. Date.now() at send time)
 * @param now       - The current time in milliseconds (e.g. Date.now())
 */
export function computeWaitSeconds(timestamp: number, now: number): number {
  return 60 - Math.floor((now - timestamp) / 1000);
}

/**
 * Returns the SHA-256 hex digest of `otp`.
 * Consistent with the hash stored in `otp_verifications.otp_hash`.
 */
export function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}
