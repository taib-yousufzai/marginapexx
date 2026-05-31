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

    // 1. Fetch position and profile
    const [{ data: pos, error: posErr }, { data: profile, error: profileErr }] = await Promise.all([
      admin.from('positions')
        .select('*')
        .eq('id', positionId)
        .eq('user_id', user.id)
        .single(),
      admin.from('profiles')
        .select('parent_id, balance')
        .eq('id', user.id)
        .single()
    ]);

    if (posErr || !pos) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 });
    }
    if (profileErr || !profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    // 2. Calculate the new leverage and required margin
    const lookupId = profile.parent_id ?? user.id;
    const { data: segSetting } = await admin.from('segment_settings')
      .select('holding_leverage, intraday_leverage')
      .eq('user_id', lookupId)
      .eq('segment', pos.settlement || '')
      .eq('side', pos.side)
      .maybeSingle();

    let finalLeverage: number | null = segSetting 
      ? (product_type === 'CARRY' ? Number(segSetting.holding_leverage) : Number(segSetting.intraday_leverage))
      : null;

    if (!finalLeverage || finalLeverage <= 0) {
      const settlement = (pos.settlement || '').toUpperCase();
      if (settlement.includes('FOREX') || settlement.includes('CDS')) {
        finalLeverage = product_type === 'CARRY' ? 10 : 100;
      } else if (settlement.includes('CRYPTO')) {
        finalLeverage = product_type === 'CARRY' ? 1 : 10;
      } else {
        finalLeverage = product_type === 'CARRY' ? 5 : 50;
      }
    }

    const newMarginRequired = (Number(pos.qty_open) * Number(pos.entry_price)) / finalLeverage;
    const currentPositionMargin = Number(pos.margin_required || 0);
    const marginDifference = newMarginRequired - currentPositionMargin;

    // 3. If converting requires more margin, perform a free margin check
    if (marginDifference > 0) {
      const { data: allOpenPos } = await admin.from('positions')
        .select('margin_required, pnl')
        .eq('user_id', user.id)
        .eq('status', 'open');

      const totalUsedMargin = (allOpenPos || []).reduce((acc, p) => acc + Number(p.margin_required || 0), 0);
      const totalFloatingPnl = (allOpenPos || []).reduce((acc, p) => acc + Number(p.pnl || 0), 0);
      const balance = Number(profile.balance || 0);
      const freeMargin = (balance + totalFloatingPnl) - totalUsedMargin;

      if (freeMargin < marginDifference) {
        return NextResponse.json({
          error: `Insufficient margin. Available free margin: ₹${freeMargin.toFixed(2)}, Required additional margin: ₹${marginDifference.toFixed(2)}`
        }, { status: 400 });
      }
    }

    // 4. Update the position row itself in the positions table
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
