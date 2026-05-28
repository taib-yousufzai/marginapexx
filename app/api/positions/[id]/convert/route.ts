import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '@/lib/adminClient';

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

  try {
    const body = await request.json();
    const { product_type } = body;
    if (!product_type || !['INTRADAY', 'CARRY'].includes(product_type)) {
      return NextResponse.json({ error: 'Invalid or missing product type' }, { status: 400 });
    }

    const admin = getAdminClient();

    // 1. Fetch position to get user_id, symbol, and side
    const { data: pos, error: posErr } = await admin.from('positions')
      .select('*')
      .eq('id', positionId)
      .eq('user_id', user.id)
      .single();

    if (posErr || !pos) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 });
    }

    // 2. Update the position row itself in the positions table
    const { error: posUpdateErr } = await admin.from('positions')
      .update({ product_type })
      .eq('id', positionId)
      .eq('user_id', user.id);

    if (posUpdateErr) {
      console.error('[Positions Convert API] Error updating position:', posUpdateErr);
      return NextResponse.json({ error: 'Failed to convert position product type' }, { status: 500 });
    }

    // 3. Update all EXECUTED orders for this user, symbol, and side (as fallback / consistency)
    const { error: ordErr } = await admin.from('orders')
      .update({ product_type })
      .eq('user_id', user.id)
      .eq('symbol', pos.symbol)
      .eq('side', pos.side)
      .eq('status', 'EXECUTED');

    if (ordErr) {
      console.error('[Positions Convert API] Error updating orders:', ordErr);
    }

    return NextResponse.json({ success: true, product_type }, { status: 200 });
  } catch (err: any) {
    console.error('[Positions Convert API] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
