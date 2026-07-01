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
      .select('holding_leverage, intraday_leverage, holding_type, intraday_type')
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

    let leverageType: string = segSetting 
      ? (product_type === 'CARRY' ? (segSetting.holding_type || 'Multiplier') : (segSetting.intraday_type || 'Multiplier'))
      : 'Multiplier';

    let newMarginRequired = 0;
    const exposure = Number(pos.qty_open) * Number(pos.entry_price);
    
    if (leverageType === '%') {
      newMarginRequired = exposure * (finalLeverage / 100);
    } else if (leverageType === 'Fixed') {
      // For fixed leverage, it's based on lots. We fetch lot size if possible, or fallback to qty.
      let symbolLotSize = 1;
      const n = (pos.symbol || '').toUpperCase();
      if (n.includes('BANKNIFTY') || n.includes('BANKEX')) symbolLotSize = 30;
      else if (n.includes('FINNIFTY')) symbolLotSize = 60;
      else if (n.includes('MIDCP') || n.includes('MIDCAP')) symbolLotSize = 120;
      else if (n.includes('SENSEX')) symbolLotSize = 20;
      else if (n.includes('NIFTY')) symbolLotSize = 65;
      else if (n.includes('GOLDM')) symbolLotSize = 10;
      else if (n.includes('GOLD')) symbolLotSize = 100;
      else if (n.includes('SILVERM')) symbolLotSize = 5;
      else if (n.includes('SILVER')) symbolLotSize = 30;
      else if (n.includes('CRUDEOILM')) symbolLotSize = 10;
      else if (n.includes('CRUDEOIL')) symbolLotSize = 100;
      else if (n.includes('NATGASMINI')) symbolLotSize = 250;
      else if (n.includes('NATURALGAS')) symbolLotSize = 1250;
      
      const lotsUsed = Number(pos.qty_open) / symbolLotSize;
      newMarginRequired = lotsUsed * finalLeverage;
    } else {
      newMarginRequired = exposure / finalLeverage;
    }
    const currentPositionMargin = Number(pos.margin_required || 0);
    const marginDifference = newMarginRequired - currentPositionMargin;

    // 3. If converting requires more margin, perform a free margin check
    if (marginDifference > 0) {
      const { data: allOpenPos } = await admin.from('positions')
        .select('locked_margin, margin_required, pnl')
        .eq('user_id', user.id)
        .eq('status', 'open');

      const totalUsedMargin = (allOpenPos || []).reduce((acc, p) => acc + Number(p.locked_margin || p.margin_required || 0), 0);
      const totalFloatingLoss = (allOpenPos || []).reduce((acc, p) => {
        const pnl = Number(p.pnl || 0);
        return acc + (pnl < 0 ? pnl : 0);
      }, 0);
      const balance = Number(profile.balance || 0);
      const freeMargin = (balance + totalFloatingLoss);

      if (freeMargin < marginDifference) {
        return NextResponse.json({
          error: `Insufficient margin. Available free margin: ₹${freeMargin.toFixed(2)}, Required additional margin: ₹${marginDifference.toFixed(2)}`
        }, { status: 400 });
      }
    }

    // 4. Update the position row itself in the positions table
    const { error: posUpdateErr } = await admin.from('positions')
      .update({ 
        product_type,
        margin_required: newMarginRequired,
        locked_margin: newMarginRequired
      })
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
