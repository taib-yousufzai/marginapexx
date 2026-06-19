import twilio from 'twilio';
import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';

// Define service availability
let twilioClient: any = null;
let useSendGrid = false;

// 1. Initialize Twilio client if keys exist
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

if (accountSid && authToken && fromPhone) {
  try {
    twilioClient = twilio(accountSid, authToken);
    console.info('Twilio SMS service initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize Twilio SMS client:', err);
  }
} else {
  console.warn('Twilio keys are not set. SMS sending will be simulated.');
}

// 2. Initialize SendGrid client if key exists
const sendgridApiKey = process.env.SENDGRID_API_KEY;
const fromEmail = process.env.SENDGRID_FROM_EMAIL;

if (sendgridApiKey && fromEmail) {
  try {
    sgMail.setApiKey(sendgridApiKey);
    useSendGrid = true;
    console.info('SendGrid email service initialized successfully.');
  } catch (err) {
    console.error('Failed to initialize SendGrid client:', err);
  }
} else {
  console.warn('SendGrid keys not set. Email service will fall back to Gmail SMTP.');
}

// 3. Nodemailer transporter fallback for Gmail SMTP
function getNodemailerTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    throw new Error('Missing fallback email env vars: GMAIL_USER and/or GMAIL_APP_PASSWORD');
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

/**
 * Sends an SMS using Twilio.
 * If Twilio is not configured, logs the message instead (simulation).
 * Formats the number to E.164 if it's a simple 10-digit number.
 */
export async function sendSms(
  to: string,
  body: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  let formattedTo = to.trim();
  
  // Format simple 10-digit number to E.164. Assumes India code (+91) as default.
  if (/^\d{10}$/.test(formattedTo)) {
    formattedTo = `+91${formattedTo}`;
  } else if (/^\d{12}$/.test(formattedTo) && formattedTo.startsWith('91')) {
    formattedTo = `+${formattedTo}`;
  }

  if (!twilioClient || !fromPhone) {
    console.info(`[SMS SIMULATION] To: ${formattedTo} | Body: ${body}`);
    return { success: true, messageId: 'simulated-msg-id' };
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: fromPhone,
      to: formattedTo,
    });
    console.info(`SMS sent to ${formattedTo}. SID: ${message.sid}`);
    return { success: true, messageId: message.sid };
  } catch (err: any) {
    console.error(`Failed to send SMS to ${formattedTo}:`, err);
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Sends an email using SendGrid. Falls back to Gmail SMTP if SendGrid is unconfigured.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<{ success: boolean; error?: string }> {
  const recipient = to.trim().toLowerCase();

  if (useSendGrid && fromEmail) {
    try {
      await sgMail.send({
        to: recipient,
        from: fromEmail,
        subject,
        text,
        html,
      });
      console.info(`Email sent via SendGrid to ${recipient}`);
      return { success: true };
    } catch (err: any) {
      console.error(`Failed to send email via SendGrid to ${recipient}:`, err);
      console.info('Attempting fallback to Gmail SMTP...');
    }
  }

  // Fallback to Nodemailer / Gmail SMTP
  try {
    const transporter = getNodemailerTransporter();
    const gmailUser = process.env.GMAIL_USER;
    await transporter.sendMail({
      from: `"MarginApex" <${gmailUser}>`,
      to: recipient,
      subject,
      text,
      html,
    });
    console.info(`Email sent via Gmail SMTP fallback to ${recipient}`);
    return { success: true };
  } catch (err: any) {
    console.error(`Failed to send email via fallback to ${recipient}:`, err);
    return { success: false, error: err.message || String(err) };
  }
}
