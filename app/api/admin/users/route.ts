/**
 * GET /api/admin/users
 *
 * Returns a list of all user profiles for admin management.
 *
 * Validates: Requirements 2.1–2.6, 12.1–12.6
 */

/**
 * POST /api/admin/users
 *
 * Creates a new Supabase auth user and inserts a corresponding profile row.
 * On profile insert failure, rolls back by deleting the auth user.
 *
 * Validates: Requirements 3.2–3.9
 */

import { requireAdmin } from '../_auth';
import { getRole } from '../../../../lib/auth'; // trigger recompile

export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // 1. Fetch profiles (filtered by parent_id if broker)
    const callerRole = getRole(authResult.callerUser);
    const isBroker = callerRole === 'broker';

    let pQuery = adminClient
      .from('profiles')
      .select('id, client_id, email, full_name, phone, role, parent_id, segments, active, read_only, demo_user, intraday_sq_off, auto_sqoff, sqoff_method, balance, settlement_amount, created_at, scheduled_delete_at, trading_mode, mode_locked_until');
    
    if (isBroker) {
      pQuery = pQuery.eq('parent_id', authResult.callerUser.id);
    }
    const { data: profiles, error: pError } = await pQuery;

    if (pError) throw pError;

    const targetUserIds = (profiles ?? []).map((p: any) => p.id);
    if (targetUserIds.length === 0) {
      return Response.json([], { status: 200 });
    }

    // 2. Fetch positions to calculate live stats (only for filtered users)
    const { data: positions, error: posError } = await adminClient
      .from('positions')
      .select('user_id, pnl, status, entry_time, exit_time, margin_required')
      .in('user_id', targetUserIds);

    if (posError) throw posError;

    // 3. Aggregate stats per user
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const statsMap: Record<string, { openPnl: number; m2m: number; weeklyPnl: number; marginUsed: number }> = {};

    (positions ?? []).forEach(pos => {
      if (!statsMap[pos.user_id]) {
        statsMap[pos.user_id] = { openPnl: 0, m2m: 0, weeklyPnl: 0, marginUsed: 0 };
      }
      const s = statsMap[pos.user_id];

      // Open PNL: positions that are open or active
      if (pos.status === 'open' || pos.status === 'active') {
        s.openPnl += Number(pos.pnl || 0);
      }

      // M2M: All PNL from today (open + closed today)
      const isToday = pos.entry_time >= today || (pos.exit_time && pos.exit_time >= today);
      if (isToday) {
        s.m2m += Number(pos.pnl || 0);
      }

      // Weekly PNL: PNL from the last 7 days
      const isThisWeek = pos.entry_time >= oneWeekAgo || (pos.exit_time && pos.exit_time >= oneWeekAgo);
      if (isThisWeek) {
        s.weeklyPnl += Number(pos.pnl || 0);
      }

      // Margin Used
      if (pos.status === 'open' || pos.status === 'active') {
        s.marginUsed += Number(pos.margin_required || 0);
      }
    });

    // 4. Merge stats into profiles
    const users = (profiles ?? []).map(p => ({
      ...p,
      ...(statsMap[p.id] || { openPnl: 0, m2m: 0, weeklyPnl: 0, marginUsed: 0 })
    }));

    return Response.json(users, { status: 200 });
  } catch (error: any) {
    console.error('[GET /api/admin/users] Error:', error);
    return Response.json({ error: 'Internal server error', detail: error.message }, { status: 500 });
  }
}

// Profile fields extracted from the request body (excluding email and password)
const PROFILE_FIELDS = [
  'full_name',
  'phone',
  'role',
  'parent_id',
  'segments',
  'active',
  'read_only',
  'demo_user',
  'intraday_sq_off',
  'auto_sqoff',
  'sqoff_method',
  'trading_mode',
  'mode_locked_until',
] as const;

export async function POST(request: Request): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 2.1–2.7
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient, callerUser } = authResult;

    const callerRole = getRole(callerUser);
    if (callerRole === 'broker') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Step 2: Parse JSON body
    // Validates: Requirement 6.4
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: 'Invalid request body' }, { status: 400 });
    }

    // Step 3: Validate required fields
    // Validates: Requirement 3.8
    const { email, password } = body;
    if (!email || !password) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Step 4: Validate password length
    // Validates: Requirement 3.9
    if (typeof password === 'string' && password.length < 8) {
      return Response.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      );
    }

    // Extract profile fields from body
    const profileFields: Record<string, unknown> = {};
    for (const field of PROFILE_FIELDS) {
      if (field in body && body[field] !== '') {
        profileFields[field] = body[field];
      }
    }

    // Generate a unique 6-character uppercase alphanumeric client_id
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let client_id = '';
    let isUnique = false;
    while (!isUnique) {
      client_id = '';
      for (let i = 0; i < 6; i++) {
        client_id += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      // Check if it exists
      const { data: existing } = await adminClient.from('profiles').select('id').eq('client_id', client_id).single();
      if (!existing) {
        isUnique = true;
      }
    }
    profileFields['client_id'] = client_id;

    // Step 5: Create auth user
    // Validates: Requirements 3.2, 3.4
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email: email as string,
      password: password as string,
      email_confirm: true,
      user_metadata: { username: body.username },
    });

    if (createError || !createData?.user) {
      console.error('[POST /api/admin/users] Auth error:', createError);
      return Response.json(
        { error: createError?.message ?? 'Failed to create user' },
        { status: 422 },
      );
    }

    const newUser = createData.user;

    // Workaround: Supabase createUser can fail if 'role' is in user_metadata during creation.
    // We update it immediately after.
    await adminClient.auth.admin.updateUserById(newUser.id, {
      user_metadata: { role: body.role, username: body.username }
    });

    // Step 6: Update profile row (already created by auth trigger)
    // Validates: Requirements 3.3, 3.5
    const { error: insertError } = await adminClient
      .from('profiles')
      .update({ email: email as string, ...profileFields })
      .eq('id', newUser.id);

    if (insertError) {
      console.error('[POST /api/admin/users] Insert error:', insertError);
      // Rollback: attempt to delete the auth user
      await adminClient.auth.admin.deleteUser(newUser.id);
      return Response.json(
        { error: `Database error: ${insertError.message}` },
        { status: 500 },
      );
    }

    // Step 6.5: Initialize default segment_settings and scalper_segment_settings for active segments if specified
    const activeSegments = body.segments;
    if (Array.isArray(activeSegments) && activeSegments.length > 0) {
      const defaultSettingsRows = [];
      const defaultScalperSettingsRows = [];
      for (const seg of activeSegments) {
        for (const side of ['BUY', 'SELL'] as const) {
          defaultSettingsRows.push({
            user_id: newUser.id,
            segment: seg,
            side,
            commission_type: 'Per Crore',
            commission_value: 4500,
            profit_hold_sec: 120,
            loss_hold_sec: 0,
            strike_range: 0,
            max_lot: 50,
            max_order_lot: 50,
            intraday_leverage: 50,
            intraday_type: 'Multiplier',
            holding_leverage: 5,
            holding_type: 'Multiplier',
            entry_buffer: 0.003,
            exit_buffer: 0.0017,
            trade_allowed: true,
          });

          defaultScalperSettingsRows.push({
            user_id: newUser.id,
            segment: seg,
            side,
            commission_type: 'Per Crore',
            commission_value: 8500,
            profit_hold_sec: 15,
            loss_hold_sec: 0,
            strike_range: 0,
            max_lot: 50,
            max_order_lot: 50,
            intraday_leverage: 50,
            intraday_type: 'Multiplier',
            holding_leverage: 5,
            holding_type: 'Multiplier',
            entry_buffer: 0.003,
            exit_buffer: 0.0017,
            trade_allowed: true,
          });
        }
      }

      if (defaultSettingsRows.length > 0) {
        const [segInitRes, scalperInitRes] = await Promise.all([
          adminClient.from('segment_settings').insert(defaultSettingsRows),
          adminClient.from('scalper_segment_settings').insert(defaultScalperSettingsRows)
        ]);

        if (segInitRes.error || scalperInitRes.error) {
          console.error('[POST /api/admin/users] Settings initialization error:', segInitRes.error || scalperInitRes.error);
          // Rollback: delete the profiles row and auth user
          await adminClient.from('profiles').delete().eq('id', newUser.id);
          await adminClient.auth.admin.deleteUser(newUser.id);
          return Response.json(
            { error: `Database error (Segment Settings): ${(segInitRes.error || scalperInitRes.error)?.message}` },
            { status: 500 },
          );
        }
      }
    }

    // Step 7: Return 201 with id, client_id, and email
    // Validates: Requirement 3.6
    return Response.json({ id: newUser.id, client_id: client_id, email: newUser.email }, { status: 201 });
  } catch (err: any) {
    // Outer catch: unhandled exceptions
    // Validates: Requirement 6.1
    console.error('[POST /api/admin/users] Unexpected error:', err);
    return Response.json({ error: `Internal error: ${err.message || err}` }, { status: 500 });
  }
}
