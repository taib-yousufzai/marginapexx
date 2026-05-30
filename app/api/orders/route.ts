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
 * Resolves from local market_quotes DB cache first, falling back on-demand.
 * Returns a map of instrument -> last_price.
 */
async function fetchKiteQuotes(instruments: string[]): Promise<Record<string, number>> {
  if (instruments.length === 0) return {};
  const result: Record<string, number> = {};

  try {
    const admin = getAdminClient();

    // 1. Fetch available quotes from database market_quotes
    const { data: dbQuotes, error: dbError } = await admin
      .from('market_quotes')
      .select('id, last_price')
      .in('id', instruments);

    const foundKiteIds = new Set<string>();
    if (!dbError && dbQuotes) {
      for (const row of dbQuotes) {
        result[row.id] = Number(row.last_price);
        foundKiteIds.add(row.id);
      }
    }

    // 2. Identify missing instruments
    const missingKiteIds = instruments.filter(id => !foundKiteIds.has(id));

    // 3. Fallback on-demand fetch from Kite REST API for missing instruments only
    if (missingKiteIds.length > 0) {
      const apiKey = process.env.KITE_API_KEY;
      if (!apiKey) return result;
      const session = await getSharedKiteSession();
      if (!session) return result;

      const params = new URLSearchParams();
      missingKiteIds.forEach(i => params.append('i', i));

      const res = await fetch(`https://api.kite.trade/quote?${params}`, {
        headers: {
          'X-Kite-Version': '3',
          Authorization: `token ${apiKey}:${session.accessToken}`,
        },
        cache: 'no-store',
      });

      if (!res.ok) return result;

      const data = await res.json() as { data?: Record<string, { last_price: number; instrument_token?: number; ohlc?: { close?: number } }> };
      const instrumentUpserts: any[] = [];
      const dbUpserts: any[] = [];

      for (const inst of missingKiteIds) {
        const quote = data.data?.[inst];
        if (quote) {
          result[inst] = quote.last_price;

          const parts = inst.split(':');
          const exchange = parts[0] || 'NSE';
          const tradingsymbol = parts[1] || '';

          instrumentUpserts.push({
            id: inst,
            instrument_token: quote.instrument_token || 0,
            tradingsymbol,
            exchange,
            instrument_type: exchange === 'NFO' || exchange === 'MCX' || exchange === 'CDS' ? 'FUTOPT' : 'EQ',
            segment: exchange,
            updated_at: new Date().toISOString()
          });

          dbUpserts.push({
            id: inst,
            last_price: quote.last_price,
            close: quote.ohlc?.close || 0,
            quote_timestamp: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        }
      }

      // Cache missing instruments and quotes asynchronously in background
      if (instrumentUpserts.length > 0) {
        (async () => {
          try {
            await admin.from('instruments').upsert(instrumentUpserts, { onConflict: 'id' });
            await admin.from('market_quotes').upsert(dbUpserts, { onConflict: 'id' });
          } catch (err) {
            console.error('[fetchKiteQuotes] Background cache error:', err);
          }
        })();
      }
    }

    return result;
  } catch (err) {
    console.error('[fetchKiteQuotes] Error:', err);
    return result;
  }
}

/**
 * Map UI display segment to database segment key.
 */
function mapSegmentToDbSegment(s: string): string {
  if (!s) return '';
  const trimmed = s.trim();
  if (trimmed === 'NSE - Futures' || trimmed === 'BSE - Futures') return 'INDEX-FUT';
  if (trimmed === 'NSE - Options' || trimmed === 'BSE - Options') return 'INDEX-OPT';
  if (trimmed === 'NSE - Stock Futures' || trimmed === 'BSE - Stock Futures') return 'STOCK-FUT';
  if (trimmed === 'NSE - Stock Options' || trimmed === 'BSE - Stock Options') return 'STOCK-OPT';
  if (trimmed === 'MCX - Futures') return 'MCX-FUT';
  if (trimmed === 'MCX - Options') return 'MCX-OPT';
  if (trimmed === 'NSE - Equity' || trimmed === 'BSE - Equity') return 'NSE-EQ';
  if (trimmed === 'Crypto' || trimmed === 'CRYPTO') return 'CRYPTO';
  if (trimmed === 'Forex' || trimmed === 'FOREX' || trimmed === 'CDS - Futures' || trimmed === 'CDS - Options') return 'FOREX';
  if (trimmed === 'COMEX - Futures' || trimmed === 'COMEX - Options' || trimmed === 'COMEX' || trimmed === 'COI') return 'COMEX';
  return trimmed;
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

  const { symbol, kite_instrument, segment, side, order_type, product_type, qty, lots, client_price, trigger_price, stop_loss, target, is_exit } = body;

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

  const dbSegment = mapSegmentToDbSegment(segment);
  const admin = getAdminClient();
  const kiteInst = kite_instrument || symbol;

  // Identify all instruments needed for this order to batch the Kite API call
  const instrumentsToFetch = [kiteInst];
  const isOption = dbSegment.includes('OPT');
  const underlyingId = dbSegment.includes('BANK') ? 'NSE:NIFTY BANK' : 'NSE:NIFTY 50';
  if (isOption && underlyingId !== kiteInst) {
    instrumentsToFetch.push(underlyingId);
  }

  // 4-6 + 8-9: Run all independent DB queries AND the Kite LTP fetch in parallel.
  // This is the key optimization — previously these were sequential (~4 round-trips).
  const [profileResult, segSettingResult, scalperSegSettingResult, quotesMap] = await Promise.all([
    // Profile
    admin.from('profiles')
      .select('id, active, read_only, segments, parent_id, balance, trading_mode')
      .eq('id', user.id)
      .single(),

    // Segment settings (we don't know parent_id yet, so we'll refetch if needed)
    admin.from('segment_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('segment', dbSegment)
      .eq('side', side)
      .maybeSingle(),

    // Scalper segment settings
    admin.from('scalper_segment_settings')
      .select('*')
      .eq('user_id', user.id)
      .eq('segment', dbSegment)
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
  if (allowedSegments.length > 0 && !allowedSegments.includes(dbSegment)) {
    return NextResponse.json({ error: `Trading not allowed in segment: ${segment}` }, { status: 403 });
  }

  // 6. Segment settings — choose based on active trading mode
  const isScalper = profile.trading_mode === 'scalper';
  let segSetting = isScalper ? scalperSegSettingResult.data : segSettingResult.data;

  if (!segSetting && profile.parent_id && profile.parent_id !== user.id) {
    const targetTable = isScalper ? 'scalper_segment_settings' : 'segment_settings';
    const { data } = await admin
      .from(targetTable)
      .select('*')
      .eq('user_id', profile.parent_id)
      .eq('segment', dbSegment)
      .eq('side', side)
      .maybeSingle();
    segSetting = data;
  }

  // If there are still no settings in database, construct safety fallback defaults based on segment
  if (!segSetting) {
    const segUpper = dbSegment.toUpperCase();
    let intraday_leverage = 50;
    let holding_leverage = 5;
    if (segUpper.includes('FOREX') || segUpper.includes('CDS')) {
      intraday_leverage = 100;
      holding_leverage = 10;
    } else if (segUpper.includes('CRYPTO')) {
      intraday_leverage = 10;
      holding_leverage = 1;
    }
    
    segSetting = {
      id: '',
      user_id: user.id,
      segment: dbSegment,
      side: side as 'BUY' | 'SELL',
      trade_allowed: true,
      max_lot: 50,
      max_order_lot: 50,
      intraday_leverage,
      holding_leverage,
      intraday_type: 'Multiplier',
      holding_type: 'Multiplier',
      entry_buffer: 0.003,
      exit_buffer: 0.0017,
      strike_range: 0,
      commission_type: 'Per Crore',
      commission_value: isScalper ? 8500 : (segUpper.includes('FOREX') || segUpper.includes('CDS') ? 2000 : (segUpper.includes('CRYPTO') ? 1000 : 4500)),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // 7. Validate lot / qty limits & Strike Range
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

  // 8. Balance check — use the balance from the profile query
  const balance = Number(profile.balance ?? 0);
  const targetProductType = product_type ?? 'INTRADAY';
  const leverage = targetProductType === 'CARRY'
    ? (segSetting.holding_leverage ?? 1)
    : (segSetting.intraday_leverage ?? 1);
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
    if (side === 'BUY') {
      // Always buy at Asking Price (LTP * 1.001) + Margin (LTP * entry_buffer)
      fillPrice = baseLtp * (1.001 + entryBuffer);
    } else {
      // Always sell at Bid Price (LTP * 0.999)
      fillPrice = baseLtp * (1 - 0.001);
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
    p_segment:      dbSegment,
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
    p_target:       target ? parseFloat(target.toString()) : null,
    p_is_exit:      is_exit ?? false
  });

  if (rpcErr) {
    console.error('[POST /api/orders] RPC error:', rpcErr);
    return NextResponse.json({ error: rpcErr.message || 'Order execution failed. Please try again.' }, { status: 400 });
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
