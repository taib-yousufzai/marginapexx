import twilio from "twilio";
import sgMail from "@sendgrid/mail";

/**
 * Returns a lazily-initialised Twilio REST client.
 *
 * Called at request time (not at module load) so that a missing env var
 * produces a clean 500 response rather than crashing the Next.js build.
 *
 * Throws `Error("Server configuration error")` if either credential is
 * absent, and logs the *name* of the missing variable (never its value).
 */
export function getTwilioClient(): twilio.Twilio {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;

  if (!sid || !token) {
    const missing = !sid ? "TWILIO_ACCOUNT_SID" : "TWILIO_AUTH_TOKEN";
    console.error(`[twilio] Missing env var: ${missing}`);
    throw new Error("Server configuration error");
  }

  return twilio(sid, token);
}

/**
 * Initialises the SendGrid mail client with the API key from env vars.
 *
 * Called at request time (not at module load) so that a missing env var
 * produces a clean 500 response rather than crashing the Next.js build.
 *
 * Throws `Error("Server configuration error")` if the key is absent, and
 * logs the *name* of the missing variable (never its value).
 */
export function initialiseSendGrid(): void {
  const key = process.env.SENDGRID_API_KEY;

  if (!key) {
    console.error("[sendgrid] Missing env var: SENDGRID_API_KEY");
    throw new Error("Server configuration error");
  }

  sgMail.setApiKey(key);
}
