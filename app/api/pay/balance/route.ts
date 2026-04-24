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

    // Step 2: Query transactions table for all rows belonging to this user
    // Validates: Requirements 4.2
    const { data: transactions, error: txnError } = await adminClient
      .from('transactions')
      .select('type, amount')
      .eq('user_id', user.id);

    if (txnError) {
      console.error('[GET /api/pay/balance] transactions fetch error:', txnError.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 3: Compute balance using the pure helper
    // Validates: Requirements 4.3, 4.5
    // computeBalance handles empty array naturally, returning 0
    const balance = computeBalance(
      (transactions ?? []).map((t) => ({
        type: t.type as string,
        amount: Number(t.amount),
      })),
    );

    // Step 4: Return 200 with the computed balance
    // Validates: Requirements 4.4, 4.5
    return Response.json({ balance }, { status: 200 });
  } catch {
    // Validates: Requirements 4.6
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
