/**
 * GET /api/admin/payinout/rules  — Fetch current wallet rules
 * PUT /api/admin/payinout/rules  — Save (upsert) wallet rules
 *
 * Validates: Requirements 8.1–8.5, 9.1–9.7, 19.1
 */

import { requireAdmin } from '../../_auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WalletRulesRow = {
  withdraw_enabled: boolean;
  allowed_days: string[];
  start_time: string;
  end_time: string;
  min_withdraw: number;
  min_deposit: number;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// GET handler — fetch wallet rules
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 8.1, 19.1
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Query wallet_rules WHERE id=1
    // Validates: Requirement 8.2
    const { data, error } = await adminClient
      .from('wallet_rules')
      .select('withdraw_enabled, allowed_days, start_time, end_time, min_withdraw, min_deposit, updated_at')
      .eq('id', 1)
      .single();

    // Step 3: Handle not-found (PGRST116 = "no rows returned" from PostgREST)
    // Validates: Requirement 8.4
    if (error) {
      if (error.code === 'PGRST116') {
        return Response.json({ error: 'Rules not configured' }, { status: 404 });
      }
      console.error('[GET /api/admin/payinout/rules] DB error:', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    if (!data) {
      return Response.json({ error: 'Rules not configured' }, { status: 404 });
    }

    // Step 4: Return the rules object
    // Validates: Requirement 8.3
    const row = data as WalletRulesRow;
    return Response.json(
      {
        withdraw_enabled: row.withdraw_enabled,
        allowed_days: row.allowed_days,
        start_time: row.start_time,
        end_time: row.end_time,
        min_withdraw: row.min_withdraw,
        min_deposit: row.min_deposit,
        updated_at: row.updated_at,
      },
      { status: 200 },
    );
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT handler — save (upsert) wallet rules
// ---------------------------------------------------------------------------

export async function PUT(request: Request): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 9.1, 19.1
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Parse request body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Step 3: Validate withdraw_enabled — must be a boolean
    // Validates: Requirement 9.2
    const { withdraw_enabled, allowed_days, start_time, end_time, min_withdraw, min_deposit } = body;

    if (typeof withdraw_enabled !== 'boolean') {
      return Response.json({ error: 'Invalid withdraw_enabled' }, { status: 400 });
    }

    // Step 4: Validate min_withdraw and min_deposit — must be positive numbers (> 0)
    // Validates: Requirement 9.3
    if (
      typeof min_withdraw !== 'number' ||
      !isFinite(min_withdraw) ||
      min_withdraw <= 0 ||
      typeof min_deposit !== 'number' ||
      !isFinite(min_deposit) ||
      min_deposit <= 0
    ) {
      return Response.json({ error: 'Invalid minimum amount' }, { status: 400 });
    }

    // Step 5: Validate start_time and end_time — must match /^\d{2}:\d{2}$/
    // Validates: Requirement 9.4
    const timeRegex = /^\d{2}:\d{2}$/;
    if (
      typeof start_time !== 'string' ||
      !timeRegex.test(start_time) ||
      typeof end_time !== 'string' ||
      !timeRegex.test(end_time)
    ) {
      return Response.json({ error: 'Invalid time format' }, { status: 400 });
    }

    // Step 6: Upsert wallet_rules row with id=1
    // Validates: Requirement 9.5
    const { data, error } = await adminClient
      .from('wallet_rules')
      .upsert(
        {
          id: 1,
          withdraw_enabled,
          allowed_days: Array.isArray(allowed_days) ? allowed_days : undefined,
          start_time,
          end_time,
          min_withdraw,
          min_deposit,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      .select('withdraw_enabled, allowed_days, start_time, end_time, min_withdraw, min_deposit, updated_at')
      .single();

    if (error) {
      console.error('[PUT /api/admin/payinout/rules] upsert error:', error.message);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 7: Return the updated wallet_rules object
    // Validates: Requirement 9.6
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
