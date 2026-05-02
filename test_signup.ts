import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

const env = dotenv.parse(fs.readFileSync('.env.local'));

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  const { data, error } = await supabase.auth.signUp({
    email: `test_${Date.now()}@test.com`,
    password: 'password123',
    options: {
      data: {
        full_name: 'Test User',
        broker_ref: 'some_broker_id',
      }
    }
  });

  if (error) {
    console.error("Signup error:", error);
  } else {
    console.log("Signup success:", data);
  }
}

test();
