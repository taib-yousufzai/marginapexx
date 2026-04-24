/**
 * POST /api/pay/request
 *
 * Allows an authenticated user to submit a deposit or withdrawal request.
 * Validates the request against wallet_rules, then inserts a PENDING row
 * into pay_requests.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9,
 *            3.10, 3.11, 19.2, 19.4
 */

import { createClient } from '@supabase/supabase-js';
import { validatePayRequest, WalletRules } from '../../../../lib/payValidation';

// ---------------------------------------------------------------------------
// Admin client factory
// ---------------------------------------------------------------------------

/**
 * Creates a Supabase admin client using the service role key.
 * Defined as a function (not at module scope) to prevent accidental
 * client-side bundling of the service role key.
 *
 * Validates: Requirements 19.4
 */
function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  try {
    // Step 1: Extract Bearer token and authenticate the user
    // Validates: Requirements 3.1, 19.2
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let adminClient;
    try {
      adminClient = createAdminClient();
    } catch (e) {
      console.error('[POST /api/pay/request] createAdminClient failed:', e);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = userData.user;

    // Step 2: Fetch wallet_rules row with id = 1
    // Validates: Requirements 3.4, 3.5, 3.6, 3.7, 3.8
    const { data: rulesData, error: rulesError } = await adminClient
      .from('wallet_rules')
      .select('*')
      .eq('id', 1)
      .single();

    if (rulesError) {
      console.error('[POST /api/pay/request] wallet_rules fetch error:', rulesError.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    const rules: WalletRules = {
      withdraw_enabled: rulesData.withdraw_enabled,
      allowed_days: rulesData.allowed_days,
      start_time: rulesData.start_time,
      end_time: rulesData.end_time,
      min_withdraw: Number(rulesData.min_withdraw),
      min_deposit: Number(rulesData.min_deposit),
    };

    // Step 3: Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid type' }, { status: 400 });
    }

    // Step 4: Validate the pay request
    // Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9
    const validation = validatePayRequest(body, rules, new Date());
    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: validation.status });
    }

    const { data: validatedData } = validation;

    // Step 5: Insert row into pay_requests
    // Validates: Requirements 3.10
    const { data: insertData, error: insertError } = await adminClient
      .from('pay_requests')
      .insert({
        user_id: user.id,
        type: validatedData.type,
        amount: validatedData.amount,
        account_name: validatedData.account_name ?? null,
        account_no: validatedData.account_no ?? null,
        ifsc: validatedData.ifsc ?? null,
        upi: validatedData.upi ?? null,
        status: 'PENDING',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[POST /api/pay/request] insert error:', insertError.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 6: Return 201 with the new row's id
    // Validates: Requirements 3.10
    return Response.json({ id: insertData.id }, { status: 201 });
  } catch {
    // Validates: Requirements 3.11
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
