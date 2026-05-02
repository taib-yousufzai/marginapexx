/**
 * POST /api/register/send-otp
 * Generates a 6-digit OTP, stores it hashed, and sends it via Gmail SMTP (nodemailer).
 *
 * Required env vars:
 *   GMAIL_USER         — your Gmail address (e.g. yourapp@gmail.com)
 *   GMAIL_APP_PASSWORD — Gmail App Password (NOT your regular password)
 *                        Generate at: https://myaccount.google.com/apppasswords
 *                        (2-Step Verification must be enabled first)
 */
import { NextRequest } from 'next/server';
import { createHash, randomInt } from 'crypto';
import nodemailer from 'nodemailer';
import { getAdminClient } from '@/lib/adminClient';

const OTP_TTL_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;

function hashOtp(otp: string): string {
  return createHash('sha256').update(otp).digest('hex');
}

function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('Missing env vars: GMAIL_USER and/or GMAIL_APP_PASSWORD');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, fullName, brokerRef } = body as {
      email: string;
      fullName: string;
      brokerRef?: string;
    };

    if (!email || !fullName) {
      return Response.json(
        { error: 'email and fullName are required' },
        { status: 400 },
      );
    }

    const emailLower = email.trim().toLowerCase();
    const admin = getAdminClient();

    // ── Rate-limit: block if an OTP was sent within the last 60 seconds ──────
    const { data: existing } = await admin
      .from('otp_verifications')
      .select('created_at')
      .eq('email', emailLower)
      .single();

    if (existing) {
      const secondsSinceLast =
        (Date.now() - new Date(existing.created_at).getTime()) / 1000;
      if (secondsSinceLast < RESEND_COOLDOWN_SECONDS) {
        const waitSeconds = Math.ceil(RESEND_COOLDOWN_SECONDS - secondsSinceLast);
        return Response.json(
          { error: `Please wait ${waitSeconds}s before requesting another code.` },
          { status: 429 },
        );
      }
    }

    // ── Generate OTP ──────────────────────────────────────────────────────────
    const otp = String(randomInt(100000, 999999));
    const otpHash = hashOtp(otp);
    const expiresAt = new Date(
      Date.now() + OTP_TTL_MINUTES * 60 * 1000,
    ).toISOString();

    // ── Upsert OTP record (replaces any previous OTP for this email) ──────────
    const { error: dbError } = await admin.from('otp_verifications').upsert(
      {
        email: emailLower,
        otp_hash: otpHash,
        full_name: fullName.trim(),
        broker_ref: brokerRef?.trim() || null,
        expires_at: expiresAt,
        created_at: new Date().toISOString(), // refresh timestamp for rate-limit
      },
      { onConflict: 'email' },
    );

    if (dbError) {
      console.error('[send-otp] DB error:', dbError);
      return Response.json({ error: 'Failed to store OTP' }, { status: 500 });
    }

    // ── Send OTP email via Gmail SMTP ─────────────────────────────────────────
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"MarginApex" <${process.env.GMAIL_USER}>`,
      to: emailLower,
      subject: 'Your MarginApex verification code',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#1a1a2e;margin-bottom:8px">MarginApex</h2>
          <p style="color:#444;margin-bottom:24px">
            Hi ${fullName.trim()},<br/>Use the code below to verify your email.
            It expires in <strong>${OTP_TTL_MINUTES} minutes</strong>.
          </p>
          <div style="background:#f4f4f4;border-radius:12px;padding:24px;text-align:center;
                      letter-spacing:8px;font-size:2.5rem;font-weight:700;color:#0f172a">
            ${otp}
          </div>
          <p style="color:#888;font-size:0.85rem;margin-top:24px">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      `,
      text: `Your MarginApex verification code is: ${otp}\n\nIt expires in ${OTP_TTL_MINUTES} minutes.`,
    });

    console.info('[send-otp] OTP sent to', emailLower);
    return Response.json({ success: true });
  } catch (err) {
    console.error('[send-otp] Unexpected error:', err);
    return Response.json(
      { error: 'Failed to send verification email. Please try again.' },
      { status: 500 },
    );
  }
}
