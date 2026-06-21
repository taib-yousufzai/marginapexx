import { config } from 'dotenv';
import { resolve } from 'path';

// Load variables from .env.local first
config({ path: resolve(__dirname, '../.env.local') });

async function testOtp() {
  const { sendOtpSms, sendEmail } = await import('../lib/twilio');
  
  const phoneRecipient = '+918588829716'; 
  const emailRecipient = process.env.GMAIL_USER || 'test@example.com'; // Change to your email for testing
  const otp = '123456';
  
  console.log(`Sending test OTP (${otp}) to both SMS and Email...`);

  // 1. Send via SMS
  const smsResult = await sendOtpSms(
    phoneRecipient,
    otp,
    'Hello from MarginApex! Your fallback OTP is ' + otp
  );

  if (smsResult.success) {
    console.log('✅ Test OTP SMS sent successfully! SID:', smsResult.messageId);
  } else {
    console.error('❌ Failed to send OTP SMS:', smsResult.error);
  }

  // 2. Send via Email
  const emailSubject = 'Your MarginApex Test OTP';
  const emailHtml = `<h1>Your MarginApex OTP is: ${otp}</h1>`;
  const emailText = `Your MarginApex OTP is: ${otp}`;
  
  const emailResult = await sendEmail(
    emailRecipient,
    emailSubject,
    emailHtml,
    emailText
  );

  if (emailResult.success) {
    console.log(`✅ Test OTP Email sent successfully to ${emailRecipient}!`);
  } else {
    console.error('❌ Failed to send OTP Email:', emailResult.error);
  }
}

testOtp();
