import { config } from 'dotenv';
import { resolve } from 'path';

// Load variables from .env.local first
config({ path: resolve(__dirname, '../.env.local') });

async function test() {
  // Dynamically import AFTER env vars are loaded so it initializes properly
  const { sendSms } = await import('../lib/twilio');
  
  const recipient = '+918588829716'; 
  
  console.log('Sending test SMS via Twilio...');
  console.log('Twilio SID configured:', !!process.env.TWILIO_ACCOUNT_SID);
  console.log('From Phone:', process.env.TWILIO_PHONE_NUMBER);

  const result = await sendSms(
    recipient,
    'Hello from MarginApex! This is a test SMS to verify your Twilio integration.'
  );

  if (result.success) {
    console.log('\n✅ Test SMS sent successfully! SID:', result.messageId);
  } else {
    console.error('\n❌ Failed to send SMS:', result.error);
  }
}

test();
