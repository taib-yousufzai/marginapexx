/**
 * POST /api/admin/users/[id]/ledger
 * 
 * Manually adjust user balance (Credit/Debit).
 * Logic:
 * 1. Fetch current profile.
 * 2. Insert APPROVED transaction — the transactions_balance_sync DB trigger updates profiles.balance.
 * 3. Insert into ledger_entries table with the selected entry_type.
 * 4. Log to act_logs.
 */

import { requireAdmin } from '../../../_auth';
import { getRole } from '../../../../../../lib/auth';
import type { EntryType, Direction } from '../../../../../../lib/ledger';

const VALID_ENTRY_TYPES: EntryType[] = ['DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT', 'CORRECTION', 'REFUND'];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient, callerUser } = authResult;

    const resolvedParams = await Promise.resolve(params);
    const userId = resolvedParams.id;

    const body = await request.json();
    const { amount, type, remark, description, entry_type } = body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return Response.json({ error: 'Invalid amount' }, { status: 400 });
    }

    if (!entry_type || !VALID_ENTRY_TYPES.includes(entry_type as EntryType)) {
      return Response.json({ error: 'Invalid entry_type' }, { status: 400 });
    }

    // remarks (description) is optional — no validation error when absent

    // 1. Fetch current profile details
    const { data: profile, error: fError } = await adminClient
      .from('profiles')
      .select('client_id, email, full_name, demo_user, balance, parent_id')
      .eq('id', userId)
      .single();

    if (fError || !profile) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const callerRole = getRole(callerUser);
    // if (callerRole === 'broker' && profile.parent_id !== callerUser.id) {
    //   return Response.json({ error: 'Forbidden' }, { status: 403 });
    // }

    const currentBalance = Number(profile.balance || 0);
    const adjustment = Number(amount);
    const newBalance = type === 'Credit' ? currentBalance + adjustment : currentBalance - adjustment;

    // 2. Create pay_request (always, for Deposit/Withdrawal History)
    let payRequestId = null;
    const prType = type === 'Credit' ? 'DEPOSIT' : 'WITHDRAWAL';
    
    const { data: pr, error: prError } = await adminClient
      .from('pay_requests')
      .insert({
        user_id: userId,
        type: prType,
        amount: adjustment,
        status: 'APPROVED',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (prError) {
      console.error('[POST ledger] pay_requests insert error:', prError.message);
      return Response.json({ error: 'Failed to record pay request' }, { status: 500 });
    }
    payRequestId = pr.id;

    // 3. Insert transaction record with status APPROVED.
    // The transactions_balance_sync trigger will automatically update profiles.balance
    // when the APPROVED transaction is inserted — do NOT manually update balance here
    // or the amount will be applied twice.
    const transType = type === 'Credit' ? 'DEPOSIT' : 'WITHDRAWAL';
    const { error: tError } = await adminClient
      .from('transactions')
      .insert({
        user_id: userId,
        type: transType,
        amount: adjustment,
        status: 'APPROVED',
        ref_id: payRequestId ? payRequestId.toString() : `${remark}: ${description || 'Manual Adjustment'}`,
        created_at: new Date().toISOString(),
      });

    if (tError) {
      console.error('[POST ledger] Transaction insert error:', tError.message);
      return Response.json({ error: 'Failed to record transaction' }, { status: 500 });
    }

    // 4. Insert into ledger_entries with the selected entry_type and direction.
    const validEntryType = entry_type as EntryType;
    const direction: Direction = type === 'Credit' ? 'CREDIT' : 'DEBIT';
    const { error: leError } = await adminClient
      .from('ledger_entries')
      .insert({
        user_id: userId,
        entry_type: validEntryType,
        direction,
        amount: adjustment,
        remarks: description || null,
        pay_request_id: payRequestId,
        balance_after: newBalance,
        created_at: new Date().toISOString(),
      });

    if (leError) {
      console.error('[POST ledger] Ledger entry insert error:', leError.message);
      return Response.json({ error: 'Failed to record ledger entry' }, { status: 500 });
    }

    // 4. Fetch user positions to compute snapshot metrics (brokerage, margin used, open pnl, m2m, etc.)
    const { data: positions, error: posError } = await adminClient
      .from('positions')
      .select('status, brokerage, settlement, pnl, entry_time, exit_time')
      .eq('user_id', userId);

    let totalBrokerage = 0;
    let marginUsed = 0;
    let openPnL = 0;
    let m2m = 0;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    if (!posError && positions) {
      for (const pos of positions) {
        totalBrokerage += Number(pos.brokerage || 0);
        if (pos.status === 'open' || pos.status === 'active') {
          marginUsed += Math.abs(Number(pos.settlement || 0));
          openPnL += Number(pos.pnl || 0);
        }
        const isToday = pos.entry_time >= today || (pos.exit_time && pos.exit_time >= today);
        if (isToday) {
          m2m += Number(pos.pnl || 0);
        }
      }
    } else if (posError) {
      console.error('[POST ledger] Error fetching positions for stats:', posError.message);
    }

    const logReason = `[${type} - ${remark}] Note: ${(description || '').trim()} | Balance: ₹${newBalance.toFixed(2)} | Margin Used: ₹${marginUsed.toFixed(2)} | Brokerage: ₹${totalBrokerage.toFixed(2)} | Open PnL: ₹${openPnL.toFixed(2)} | M2M: ₹${m2m.toFixed(2)} | Demo: ${profile.demo_user ? 'Yes' : 'No'}`;

    // 4. Log action to act_logs
    const { error: logError } = await adminClient.from('act_logs').insert({
      type: 'ADMIN_ACTION',
      user_id: callerUser.id,
      target_user_id: userId,
      reason: logReason,
      price: type === 'Credit' ? adjustment : -adjustment,
      created_at: new Date().toISOString(),
    });

    if (logError) {
      console.error('[POST ledger] act_log insert error:', logError.message);
    }

    return Response.json({ 
      success: true, 
      newBalance,
      message: `Successfully added ${type} of ₹${adjustment}`
    }, { status: 200 });

  } catch (error: any) {
    console.error('[POST ledger] Unexpected error:', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
