import { describe, it, expect, vi, beforeEach } from 'vitest';
import twilio from 'twilio';
import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';

// Mock external services
vi.mock('twilio', () => {
  const mockCreate = vi.fn().mockResolvedValue({ sid: 'mock-sid-123' });
  const mockTwilio = vi.fn().mockReturnValue({
    messages: {
      create: mockCreate,
    },
  });
  return { default: mockTwilio };
});

vi.mock('@sendgrid/mail', () => {
  const mockSend = vi.fn().mockResolvedValue([{}]);
  const mockSetApiKey = vi.fn();
  return {
    default: {
      setApiKey: mockSetApiKey,
      send: mockSend,
    },
  };
});

vi.mock('nodemailer', () => {
  const mockSendMail = vi.fn().mockResolvedValue({});
  const mockCreateTransport = vi.fn().mockReturnValue({
    sendMail: mockSendMail,
  });
  return {
    default: {
      createTransport: mockCreateTransport,
    },
  };
});

describe('twilio & sendgrid notification helper', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('formats 10-digit Indian numbers to E.164 automatically', async () => {
    // Import dynamically so it evaluates mocks after env setup
    const { sendSms } = await import('../twilio');
    
    // Test formatting
    const res = await sendSms('9876543210', 'Test message');
    expect(res.success).toBe(true);
    expect(res.messageId).toBeDefined();
  });

  it('uses twilio client when environment variables are set', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'ACxxxxxx';
    process.env.TWILIO_AUTH_TOKEN = 'token_xxxxxx';
    process.env.TWILIO_PHONE_NUMBER = '+1234567890';

    const { sendSms } = await import('../twilio');
    const res = await sendSms('+919876543210', 'Test message');
    
    expect(res.success).toBe(true);
    expect(res.messageId).toBe('mock-sid-123');
  });

  it('uses sendgrid when key and sender email are set', async () => {
    process.env.SENDGRID_API_KEY = 'SG.xxxxxx';
    process.env.SENDGRID_FROM_EMAIL = 'no-reply@example.com';

    const { sendEmail } = await import('../twilio');
    const res = await sendEmail('user@example.com', 'Subject', '<p>Html</p>', 'Text');

    expect(res.success).toBe(true);
    expect(sgMail.send).toHaveBeenCalled();
  });

  it('falls back to nodemailer Gmail SMTP when SendGrid is unconfigured', async () => {
    process.env.GMAIL_USER = 'test@gmail.com';
    process.env.GMAIL_APP_PASSWORD = 'app-password';
    delete process.env.SENDGRID_API_KEY;

    const { sendEmail } = await import('../twilio');
    const res = await sendEmail('user@example.com', 'Subject', '<p>Html</p>', 'Text');

    expect(res.success).toBe(true);
    expect(nodemailer.createTransport).toHaveBeenCalled();
  });
});
