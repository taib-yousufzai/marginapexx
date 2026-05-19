/**
 * Internal Order API — MarginApex platform orders
 *
 * GET  /api/orders          → user's own order history (from Supabase)
 * POST /api/orders          → place a new order through MarginApex
 *
 * All order placement runs through this endpoint. Zerodha is NEVER called
 * to place orders — it is used read-only to fetch the LTP for fill price
 * computation only.
 *
 * Fill price = Kite LTP ± segment_settings.entry_buffer / exit_buffer
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '@/lib/adminClient';
import { getSharedKiteSession } from '@/lib/kiteSession';
import type {
  PlaceOrderRequest,
  PlaceOrderResponse,
  MyOrder,
} from '@/lib/types/order';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch the Kite LTP for one or more instruments server-side.
 * Returns a map of instrument -> last_price.
 */
async function fetchKiteQuotes(instruments: string[]): Promise<Record<string, number>> {
  if (instruments.length === 0) return {};
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) return {};

  try {
    const session = await getSharedKiteSession();
    if (!session) return {};

    const params = new URLSearchParams();
    instruments.forEach(i => params.append('i', i));

    const res = await fetch(`https://api.kite.trade/quote?${params}`, {
      headers: {
        'X-Kite-Version': '3',
        Authorization: `token ${apiKey}:${session.accessToken}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) return {};

    const data = await res.json() as { data?: Record<string, { last_price: number }> };
    const result: Record<string, number> = {};
    for (const inst of instruments) {
      if (data.data?.[inst]) {
        result[inst] = data.data[inst].last_price;
      }
    }
    return result;
  } catch {
    return {};
  }
}

// ─── GET /api/orders ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const admin = getAdminClient();
    const { searchParams } = request.nextUrl;
    const page  = parseInt(searchParams.get('page')  ?? '1',  10);
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    const { data, error } = await admin
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;

    const orders: MyOrder[] = (data ?? []).map((r: Record<string, unknown>) => ({
      id:           r.id as string,
      symbol:       r.symbol as string,
      segment:      (r.segment as string) ?? '',
      side:         r.side as 'BUY' | 'SELL',
      status:       r.status as MyOrder['status'],
      qty:          Number(r.qty),
      lots:         Number(r.lots ?? 0),
      fill_price:   Number(r.fill_price ?? r.price),
      ltp_at_entry: Number(r.ltp_at_entry ?? 0),
      order_type:   (r.order_type as MyOrder['order_type']) ?? 'MARKET',
      product_type: (r.product_type as MyOrder['product_type']) ?? 'INTRADAY',
      info:         (r.info as string) ?? null,
      created_at:   r.created_at as string,
    }));

    return NextResponse.json({ orders, page, limit });
  } catch (err) {
    console.error('[GET /api/orders]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST /api/orders ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authenticate
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Parse body
  let body: PlaceOrderRequest;
  try {
    body = await request.json() as PlaceOrderRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { symbol, kite_instrument, segment, side, order_type, product_type, qty, lots, client_price, trigger_price, stop_loss, target } = body;

  // 3. Basic field validation
  if (!symbol || !side || !qty || !segment) {
    return NextResponse.json({ error: 'Missing required fields: symbol, side, qty, segment' }, { status: 400 });
  }
  if (!['BUY', 'SELL'].includes(side)) {
    return NextResponse.json({ error: 'Invalid side' }, { status: 400 });
  }
  if (qty <= 0) {
    return NextResponse.json({ error: 'Quantity must be positive' }, { status: 400 });
  }

  const admin = getAdminClient();
  const kiteInst = kite_instrument || symbol;

  // Identify all instruments needed for this order to batch the Kite API call
  const instrumentsToFetch = [kiteInst];
  const isOption = segment.includes('OPT');
  const underlyingId = segment.includes('BANK') ? 'NSE:NIFTY BANK' : 'NSE:NIFTY 50';
  if (isOption && underlyingId !== kiteInst) {
    instrumentsToFetch.push(underlyingId);
  }

  // 4-6 + 8-9: Run all independent DB queries AND the Kite LTP fetch in parallel.
  // This is the key optimization — previously these were sequential (~4 round-trips).
  const [profileResult, segSettingResult, quotesMap] = await Promise.all([
    // Profile
    admin.from('profiles')
      .select('id, active, read_only, segments, parent_id, balance')
      .eq('id', user.id)
      .single(),

    // Segment settings (we don't know parent_id yet, so we'll refetch if needed)
    admin.from('segment_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('segment', segment)
      .eq('side', side)
      .maybeSingle(),

    // Kite LTP — batch fetch all needed quotes in one call
    fetchKiteQuotes(instrumentsToFetch),
  ]);

  const kiteLtp = quotesMap[kiteInst] ?? null;

  // 4. Profile checks
  const { data: profile, error: profileErr } = profileResult;
  if (profileErr || !profile) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 403 });
  }
  if (!profile.active) {
    return NextResponse.json({ error: 'Account is inactive' }, { status: 403 });
  }
  if (profile.read_only) {
    return NextResponse.json({ error: 'Account is in read-only mode' }, { status: 403 });
  }

  // 5. Segment permission check
  const allowedSegments: string[] = profile.segments ?? [];
  if (allowedSegments.length > 0 && !allowedSegments.includes(segment)) {
    return NextResponse.json({ error: `Trading not allowed in segment: ${segment}` }, { status: 403 });
  }

  // 6. Segment settings — if parallel fetch missed parent_id broker settings, retry once
  let segSetting = segSettingResult.data;
  if (!segSetting && profile.parent_id && profile.parent_id !== user.id) {
    const { data } = await admin
      .from('segment_settings')
      .select('*')
      .eq('user_id', profile.parent_id)
      .eq('segment', segment)
      .eq('side', side)
      .maybeSingle();
    segSetting = data;
  }

  // 7. Validate lot / qty limits & Strike Range
  if (segSetting) {
    if (!segSetting.trade_allowed) {
      return NextResponse.json({ error: `${side} orders not allowed in ${segment}` }, { status: 403 });
    }
    const maxQty = (segSetting.max_order_lot as number) * (lots > 0 ? qty / lots : 1);
    if (qty > maxQty) {
      return NextResponse.json({
        error: `Order exceeds maximum allowed quantity of ${maxQty} units`,
      }, { status: 400 });
    }

    // Strike Range check — reuse the already-fetched quotes (no second Kite call)
    if (isOption && segSetting.strike_range > 0 && kiteLtp) {
      const strikePrice = parseFloat(symbol.match(/\d+/)?.[0] || '0');
      if (strikePrice > 0) {
        const spot = quotesMap[underlyingId];
        if (spot) {
          const diff = Math.abs(strikePrice - spot);
          if (diff > segSetting.strike_range) {
            return NextResponse.json({
              error: `Strike price ${strikePrice} is outside the allowed range of ${segSetting.strike_range} from spot (${spot.toFixed(2)})`,
            }, { status: 403 });
          }
        }
      }
    }
  }

  // 8. Balance check — use the balance from the profile query
  const balance = Number(profile.balance ?? 0);
  const leverage      = segSetting?.intraday_leverage ?? 1;
  const exposure      = qty * client_price;
  const requiredMargin = exposure / leverage;

  if (balance < requiredMargin) {
    return NextResponse.json({
      error: `Insufficient margin. Available: ₹${balance.toFixed(2)}, Required: ₹${requiredMargin.toFixed(2)}`,
    }, { status: 400 });
  }

  // 9. Fill price — use the already-fetched kiteLtp (no second Kite call)
  const baseLtp = kiteLtp ?? client_price;
  if (!baseLtp || baseLtp <= 0) {
    return NextResponse.json({ error: 'Could not determine market price. Try again.' }, { status: 503 });
  }

  // 10. Compute fill price (LTP ± buffer from segment_settings)
  let fillPrice: number;
  const isImmediate = (order_type ?? 'MARKET') === 'MARKET';

  if (order_type === 'LIMIT' || order_type === 'SL' || order_type === 'GTT') {
    fillPrice = client_price;
  } else if (order_type === 'SLM') {
    fillPrice = trigger_price ? Number(trigger_price) : client_price;
  } else {
    const entryBuffer = segSetting?.entry_buffer ?? 0.003;
    const exitBuffer  = segSetting?.exit_buffer  ?? 0.0017;
    if (side === 'BUY') {
      fillPrice = baseLtp * (1 + entryBuffer);
    } else {
      fillPrice = baseLtp * (1 - exitBuffer);
    }
  }

  fillPrice = Math.round(fillPrice * 100) / 100; // 2 dp

  // 11. Atomic write via Postgres RPC
  const targetOrderType = order_type ?? 'MARKET';
  const rpcOrderType = targetOrderType === 'SLM' ? 'SL' : targetOrderType;

  const { data: orderId, error: rpcErr } = await admin.rpc('place_order', {
    p_user_id:      user.id,
    p_symbol:       symbol,
    p_kite_inst:    kiteInst,
    p_segment:      segment,
    p_side:         side,
    p_order_type:   rpcOrderType,
    p_product_type: product_type ?? 'INTRADAY',
    p_qty:          qty,
    p_lots:         lots ?? 0,
    p_ltp:          baseLtp,
    p_fill_price:   fillPrice,
    p_info:         null,
    p_trigger_price: trigger_price ? parseFloat(trigger_price.toString()) : null,
    p_stop_loss:    stop_loss ? parseFloat(stop_loss.toString()) : null,
    p_target:       target ? parseFloat(target.toString()) : null
  });

  if (rpcErr) {
    console.error('[POST /api/orders] RPC error:', rpcErr);
    return NextResponse.json({ error: 'Order execution failed. Please try again.' }, { status: 500 });
  }

  // Update order_type to 'SLM' in the database if it was an SLM order
  if (targetOrderType === 'SLM' && orderId) {
    const { error: updateErr } = await admin
      .from('orders')
      .update({ order_type: 'SLM' })
      .eq('id', orderId);
    if (updateErr) {
      console.error('[POST /api/orders] Failed to restore SLM order type:', updateErr);
    }
  }

  const response: PlaceOrderResponse = {
    order_id:   orderId as string,
    status:     isImmediate ? 'EXECUTED' : 'PENDING',
    fill_price: fillPrice,
    message:    isImmediate 
      ? `${side} order executed at ₹${fillPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
      : `${side} ${order_type} order placed (Pending) at ₹${fillPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
  };

  return NextResponse.json(response, { status: 201 });
}
