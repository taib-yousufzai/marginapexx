import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '@/lib/adminClient';
import { getRedisClient } from '@/lib/redis';

/**
 * PATCH /api/positions/[id]
 * 
 * Updates an internal platform position (e.g., stop loss, target).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminClient();

    // Fields that can be updated by the user on their position
    const allowedUpdates: Record<string, any> = {};
    if ('stop_loss' in body) allowedUpdates.stop_loss = body.stop_loss !== null ? parseFloat(body.stop_loss) : null;
    if ('target' in body) allowedUpdates.target = body.target !== null ? parseFloat(body.target) : null;

    const { data: pos, error: posErr } = await admin
      .from('positions')
      .select('symbol, side, status, entry_price')
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'open')
      .single();

    if (posErr || !pos) {
      return NextResponse.json({ error: 'Could not fetch position. It might already be closed.' }, { status: 400 });
    }

    let ltp = 0;
    if (Object.keys(allowedUpdates).length > 0) {
      try {
        const redis = getRedisClient();
        const possibleKeys = [
          `NFO:${pos.symbol}`, `BFO:${pos.symbol}`, `MCX:${pos.symbol}`, `NSE:${pos.symbol}`, `BSE:${pos.symbol}`
        ];
        const cachedValues = await redis.hmget('market:quotes', ...possibleKeys);
        for (const raw of cachedValues) {
          if (raw) {
            try {
              const q = JSON.parse(raw);
              if (q && q.last_price !== undefined && q.last_price > 0) {
                ltp = q.last_price;
                break;
              }
            } catch {}
          }
        }
      } catch (e) {
        console.warn('Redis fetch error in position update:', e);
      }
      
      if (!ltp) ltp = body.ltp ? Number(body.ltp) : Number(pos.entry_price);

      if (allowedUpdates.stop_loss !== undefined && allowedUpdates.stop_loss !== null && !isNaN(allowedUpdates.stop_loss)) {
        if (pos.side === 'BUY' && allowedUpdates.stop_loss >= ltp) {
          return NextResponse.json({ error: `Stop loss must be lower than the current market price (₹${ltp.toFixed(2)})` }, { status: 400 });
        }
        if (pos.side === 'SELL' && allowedUpdates.stop_loss <= ltp) {
          return NextResponse.json({ error: `Stop loss must be higher than the current market price (₹${ltp.toFixed(2)})` }, { status: 400 });
        }
      }

      if (allowedUpdates.target !== undefined && allowedUpdates.target !== null && !isNaN(allowedUpdates.target)) {
        if (pos.side === 'BUY' && allowedUpdates.target <= ltp) {
          return NextResponse.json({ error: `Target must be higher than the current market price (₹${ltp.toFixed(2)})` }, { status: 400 });
        }
        if (pos.side === 'SELL' && allowedUpdates.target >= ltp) {
          return NextResponse.json({ error: `Target must be lower than the current market price (₹${ltp.toFixed(2)})` }, { status: 400 });
        }
      }
    }

    const { data, error } = await admin
      .from('positions')
      .update(allowedUpdates)
      .eq('id', id)
      .eq('user_id', user.id)
      .eq('status', 'open')
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: 'Could not update position. It might already be closed.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, position: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
