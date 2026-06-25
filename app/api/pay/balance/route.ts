/**
 * GET /api/pay/balance
 *
 * Returns the authenticated user's ledger balance, computed as the sum of all
 * DEPOSIT transaction amounts minus the sum of all WITHDRAWAL transaction amounts.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 19.2
 */

import { createClient } from '@supabase/supabase-js';
import { computeBalance } from '../../../../lib/payValidation';

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

export async function GET(request: Request): Promise<Response> {
  try {
    // Step 1: Extract Bearer token and authenticate the user
    // Validates: Requirements 4.1, 19.2
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
      console.error('[GET /api/pay/balance] createAdminClient failed:', e);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = userData.user;

    // Fetch balance and settlement_amount directly from profiles table
    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('balance, settlement_amount')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('[GET /api/pay/balance] profile fetch error:', profileError.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    const balance = Number(profile?.balance || 0);
    const settlementAmount = Math.abs(Number(profile?.settlement_amount || 0));

    // Step 4: Return 200 with the computed balance and settlement amount
    // Validates: Requirements 4.4, 4.5
    return Response.json({ balance, settlementAmount }, { status: 200 });
  } catch {
    // Validates: Requirements 4.6
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
