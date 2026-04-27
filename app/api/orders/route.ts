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
 * Fetch the Kite LTP for a single instrument key server-side.
 * Falls back to null if Kite is not connected or returns an error.
 */
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

  const { symbol, kite_instrument, segment, side, order_type, product_type, qty, lots, client_price } = body;

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

  // 4. Load user profile — check active, not read_only
  const { data: profile, error: profileErr } = await admin
    .from('profiles')
    .select('id, active, read_only, segments, parent_id')
    .eq('id', user.id)
    .single();

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

  // 6. Load segment settings for this user (or their broker's defaults)
  const lookupId = profile.parent_id ?? user.id;
  const { data: segSetting } = await admin
    .from('segment_settings')
    .select('*')
    .eq('user_id', lookupId)
    .eq('segment', segment)
    .eq('side', side)
    .maybeSingle();

  // 7. Validate lot / qty limits
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
  }

  // 8. Margin check — balance = SUM(approved transactions)
  const { data: txData, error: txErr } = await admin
    .from('transactions')
    .select('type, amount')
    .eq('user_id', user.id)
    .eq('status', 'APPROVED');

  if (txErr) {
    return NextResponse.json({ error: 'Failed to load balance' }, { status: 500 });
  }

  let balance = 0;
  for (const tx of txData ?? []) {
    if (tx.type === 'DEPOSIT' || tx.type === 'PNL_CREDIT') {
      balance += Number(tx.amount);
    } else {
      balance -= Number(tx.amount);
    }
  }

  // Required margin = exposure / leverage
  const leverage      = segSetting?.intraday_leverage ?? 1;
  const exposure      = qty * client_price;
  const requiredMargin = exposure / leverage;

  if (balance < requiredMargin) {
    return NextResponse.json({
      error: `Insufficient margin. Available: ₹${balance.toFixed(2)}, Required: ₹${requiredMargin.toFixed(2)}`,
    }, { status: 400 });
  }

  // 9. Fetch LTP from Kite (server-side) — fall back to client_price if unavailable
  const kiteInst = kite_instrument || symbol;
  const kiteLtp  = await fetchKiteLtp(kiteInst);
  const baseLtp  = kiteLtp ?? client_price;

  if (!baseLtp || baseLtp <= 0) {
    return NextResponse.json({ error: 'Could not determine market price. Try again.' }, { status: 503 });
  }

  // 10. Compute fill price (LTP ± buffer from segment_settings)
  const entryBuffer = segSetting?.entry_buffer ?? 0.003;
  const exitBuffer  = segSetting?.exit_buffer  ?? 0.0017;
  let fillPrice: number;

  if (side === 'BUY') {
    // Buys fill at a slight markup (platform spread revenue)
    fillPrice = baseLtp * (1 + entryBuffer);
  } else {
    // Sells fill at a slight markdown
    fillPrice = baseLtp * (1 - exitBuffer);
  }

  fillPrice = Math.round(fillPrice * 100) / 100; // 2 dp

  // 11. Atomic write via Postgres RPC
  const { data: orderId, error: rpcErr } = await admin.rpc('place_order', {
    p_user_id:      user.id,
    p_symbol:       symbol,
    p_kite_inst:    kiteInst,
    p_segment:      segment,
    p_side:         side,
    p_order_type:   order_type ?? 'MARKET',
    p_product_type: product_type ?? 'INTRADAY',
    p_qty:          qty,
    p_lots:         lots ?? 0,
    p_ltp:          baseLtp,
    p_fill_price:   fillPrice,
    p_info:         null,
  });

  if (rpcErr) {
    console.error('[POST /api/orders] RPC error:', rpcErr);
    return NextResponse.json({ error: 'Order execution failed. Please try again.' }, { status: 500 });
  }

  const response: PlaceOrderResponse = {
    order_id:   orderId as string,
    status:     'EXECUTED',
    fill_price: fillPrice,
    message:    `${side} order executed at ₹${fillPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`,
  };

  return NextResponse.json(response, { status: 201 });
}
