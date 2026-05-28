import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '@/lib/adminClient';

/**
 * GET /api/positions
 * 
 * Returns all internal platform positions for the authenticated user.
 * product_type is pulled from the matching entry order (first EXECUTED order for that symbol+side).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminClient();

    // Fetch positions and orders in parallel
    const [posResult, ordResult] = await Promise.all([
      admin.from('positions').select('*').eq('user_id', user.id).order('updated_at', { ascending: false }),
      admin.from('orders').select('symbol, side, product_type').eq('user_id', user.id).eq('status', 'EXECUTED').order('created_at', { ascending: true }),
    ]);

    if (posResult.error) throw posResult.error;

    // Build a map: "SYMBOL|SIDE" -> product_type (first executed order wins) as fallback
    const productTypeMap: Record<string, string> = {};
    for (const o of (ordResult.data ?? [])) {
      const key = `${o.symbol}|${o.side}`;
      if (!productTypeMap[key]) productTypeMap[key] = o.product_type ?? 'INTRADAY';
    }

    // Attach product_type to each position, prioritizing position's own stored product_type
    const positions = (posResult.data ?? []).map(p => ({
      ...p,
      product_type: p.product_type || productTypeMap[`${p.symbol}|${p.side}`] || 'INTRADAY',
    }));

    return NextResponse.json({ positions });
  } catch (error: any) {
    console.error('[Positions API] Error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
