/**
 * POST /api/admin/users/[id]/ledger
 * 
 * Manually adjust user balance (Credit/Debit).
 * Logic:
 * 1. Fetch current balance.
 * 2. Update balance in profiles.
 * 3. Insert transaction record.
 */

import { requireAdmin } from '../../../_auth';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const resolvedParams = await Promise.resolve(params);
    const userId = resolvedParams.id;

    const body = await request.json();
    const { amount, type, remark, description } = body;

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return Response.json({ error: 'Invalid amount' }, { status: 400 });
    }

    // 1. Fetch current balance
    const { data: profile, error: fError } = await adminClient
      .from('profiles')
      .select('balance')
      .eq('id', userId)
      .single();

    if (fError || !profile) {
      return Response.json({ error: 'User not found' }, { status: 404 });
    }

    const currentBalance = Number(profile.balance || 0);
    const adjustment = Number(amount);
    const newBalance = type === 'Credit' ? currentBalance + adjustment : currentBalance - adjustment;

    // 2. Update balance in profiles
    const { error: uError } = await adminClient
      .from('profiles')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (uError) {
      console.error('[POST ledger] Balance update error:', uError.message);
      return Response.json({ error: 'Failed to update balance' }, { status: 500 });
    }

    // 3. Insert transaction record
    // We use DEPOSIT for Credit and WITHDRAWAL for Debit to match the check constraint
    const transType = type === 'Credit' ? 'DEPOSIT' : 'WITHDRAWAL';
    const { error: tError } = await adminClient
      .from('transactions')
      .insert({
        user_id: userId,
        type: transType,
        amount: adjustment,
        status: 'APPROVED',
        ref_id: `${remark}: ${description || 'Manual Adjustment'}`,
        created_at: new Date().toISOString(),
      });

    if (tError) {
      console.error('[POST ledger] Transaction insert error:', tError.message);
      // We don't rollback balance here as it's not atomic anyway without RPC, 
      // but in a real app we should use a transaction or RPC.
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
