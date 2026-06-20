import { config } from 'dotenv';
import { resolve } from 'path';

// Load variables from .env.local first
config({ path: resolve(__dirname, '../.env.local') });

async function test() {
  // Dynamically import AFTER env vars are loaded so it initializes properly
  const { sendEmail } = await import('../lib/twilio');
  const recipient = 'lastidiot416@gmail.com';
  
  console.log('Sending test email via SendGrid...');
  console.log('API Key configured:', !!process.env.SENDGRID_API_KEY);
  console.log('From Email:', process.env.SENDGRID_FROM_EMAIL);

  const result = await sendEmail(
    recipient,
    'SendGrid Test Integration',
    '<h1>Success!</h1><p>If you are reading this, your Twilio SendGrid integration is working perfectly.</p>',
    'Success! If you are reading this, your Twilio SendGrid integration is working perfectly.'
  );

  if (result.success) {
    console.log('\n✅ Test email sent successfully! Check your inbox (and spam folder) at', recipient);
  } else {
    console.error('\n❌ Failed to send email:', result.error);
  }
}

test();
