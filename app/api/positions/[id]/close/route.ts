/**
 * POST /api/positions/[id]/close
 *
 * Closes an open position for the authenticated user.
 * - Fetches Kite LTP for exit price computation (server-side)
 * - Applies exit_buffer from segment_settings
 * - Calls close_position() Postgres RPC atomically:
 *     → updates position to 'closed'
 *     → records exit order
 *     → writes PNL_CREDIT / PNL_DEBIT transaction
 *     → logs to act_logs
 *
 * Also used by broker force-close (broker panel calls with user's position id).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '@/lib/adminClient';
import { getSharedKiteSession } from '@/lib/kiteSession';
import type { ClosePositionResponse } from '@/lib/types/order';

async function fetchKiteLtp(instrument: string): Promise<number | null> {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) return null;
  try {
    const session = await getSharedKiteSession();
    if (!session) return null;
    const params = new URLSearchParams({ i: instrument });
    const res = await fetch(`https://api.kite.trade/quote?${params}`, {
      headers: {
        'X-Kite-Version': '3',
        Authorization: `token ${apiKey}:${session.accessToken}`,
      },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json() as { data?: Record<string, { last_price: number }> };
    return data.data?.[instrument]?.last_price ?? null;
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: positionId } = await params;
  if (!positionId) {
    return NextResponse.json({ error: 'Missing position id' }, { status: 400 });
  }

  const admin = getAdminClient();

  // Load the position — must belong to this user and be open
  const { data: pos, error: posErr } = await admin
    .from('positions')
    .select('*')
    .eq('id', positionId)
    .eq('user_id', user.id)
    .eq('status', 'open')
    .single();

  if (posErr || !pos) {
    return NextResponse.json({ error: 'Position not found or already closed' }, { status: 404 });
  }

  // Load segment settings for exit buffer
  const { data: profile } = await admin
    .from('profiles')
    .select('parent_id')
    .eq('id', user.id)
    .single();

  const lookupId = profile?.parent_id ?? user.id;
  const { data: segSetting } = await admin
    .from('segment_settings')
    .select('exit_buffer')
    .eq('user_id', lookupId)
    .eq('segment', pos.settlement ?? '')
    .eq('side', pos.side)
    .maybeSingle();

  const exitBuffer = segSetting?.exit_buffer ?? 0.0017;

  // Fetch LTP from Kite
  const kiteLtp = pos.symbol ? await fetchKiteLtp(pos.symbol) : null;
  const baseLtp = kiteLtp ?? Number(pos.ltp ?? pos.entry_price);

  // Exit price: opposite buffer to entry
  // BUY position exits as SELL → markdown
  // SELL position exits as BUY → markup
  let exitPrice: number;
  if (pos.side === 'BUY') {
    exitPrice = baseLtp * (1 - exitBuffer);
  } else {
    exitPrice = baseLtp * (1 + exitBuffer);
  }
  exitPrice = Math.round(exitPrice * 100) / 100;

  // Call the atomic RPC
  const { data: pnl, error: rpcErr } = await admin.rpc('close_position', {
    p_position_id: positionId,
    p_user_id:     user.id,
    p_ltp:         baseLtp,
    p_exit_price:  exitPrice,
    p_closed_by:   'USER',
  });

  if (rpcErr) {
    console.error('[POST /api/positions/[id]/close] RPC error:', rpcErr);
    return NextResponse.json({ error: 'Failed to close position. Please try again.' }, { status: 500 });
  }

  const response: ClosePositionResponse = {
    pnl:        Number(pnl),
    exit_price: exitPrice,
    message:    `Position closed at ₹${exitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}. P&L: ₹${Number(pnl).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
  };

  return NextResponse.json(response, { status: 200 });
}
