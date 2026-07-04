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
import { requireAuth as apiRequireAuth } from '@/lib/api-middleware';
import { getSharedKiteSession } from '@/lib/kiteSession';
import { positionStore, parseOptionSymbol } from '../../../lib/positionStore';
import { calculateMarginPortion } from '@/lib/marginCalculator';
import type {
  PlaceOrderRequest,
  PlaceOrderResponse,
  MyOrder,
} from '@/lib/types/order';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Fetch the Binance LTP for a crypto symbol using the same
 * Redis → Ticker Daemon → Binance REST cascade as the Kite path.
 */
async function fetchBinanceQuote(symbol: string): Promise<{ltp: number, bid: number, ask: number} | null> {
  let cleanSym = symbol.replace('/', '').toUpperCase();
  if (!cleanSym.endsWith('USDT')) cleanSym = cleanSym + 'USDT';

  // 1. Redis cache (Ticker Daemon writes Binance prices here too)
  try {
    const { getRedisClient } = await import('@/lib/redis');
    const redis = getRedisClient();
    const cached = await redis.hget('market:quotes', cleanSym);
    if (cached) {
      const q = JSON.parse(cached);
      if (q && q.last_price !== undefined) {
        return {
          ltp: Number(q.last_price),
          bid: Number(q.bid || q.last_price * 0.9995),
          ask: Number(q.ask || q.last_price * 1.0005)
        };
      }
    }
  } catch { /* fall through */ }

  // 2. Ticker Daemon in-memory endpoint
  try {
    const tickerUrl = process.env.NEXT_PUBLIC_TICKER_URL || (process.env.NODE_ENV === 'production' ? 'https://marginapexx-production.up.railway.app' : 'http://localhost:8080');
    const params = new URLSearchParams({ symbols: cleanSym });
    const resTicker = await fetch(`${tickerUrl}/quotes?${params}`, { cache: 'no-store' });
    if (resTicker.ok) {
      const json = await resTicker.json();
      if (json.success && json.data && json.data[cleanSym]) {
        const q = json.data[cleanSym];
        return {
          ltp: Number(q.last_price),
          bid: Number(q.bid || q.last_price * 0.9995),
          ask: Number(q.ask || q.last_price * 1.0005)
        };
      }
    }
  } catch { /* fall through */ }

  // 3. Direct Binance REST fallback
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${cleanSym}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.price) {
      const ltp = parseFloat(data.price);
      return { ltp, bid: ltp * 0.9995, ask: ltp * 1.0005 };
    }
    return null;
  } catch (err) {
    console.error('[fetchBinanceQuote] Error:', err);
    return null;
  }
}

/**
 * Fetch the Kite LTP for one or more instruments server-side.
 * Resolves from local market_quotes DB cache first, falling back on-demand.
 * Returns a map of instrument -> last_price.
 */
async function fetchKiteQuotes(instruments: string[]): Promise<Record<string, number>> {
  if (instruments.length === 0) return {};
  const result: Record<string, number> = {};
  const foundKiteIds = new Set<string>();

  try {
    const admin = getAdminClient();

    // 1. Fetch from Redis Hash cache — use HMGET for a single round-trip
    try {
      const { getRedisClient } = await import('@/lib/redis');
      const redis = getRedisClient();
      const cachedValues = await redis.hmget('market:quotes', ...instruments);
      instruments.forEach((inst, idx) => {
        const raw = cachedValues[idx];
        if (raw) {
          try {
            const q = JSON.parse(raw);
            if (q && q.last_price !== undefined) {
              result[inst] = q.last_price;
              foundKiteIds.add(inst);
            }
          } catch { /* malformed cache entry — fall through */ }
        }
      });
    } catch (redisErr) {
      console.warn('[fetchKiteQuotes] Failed to query Redis, falling back:', redisErr);
    }

    // 2. Fetch available quotes from Ticker Daemon for remaining instruments
    const remainingKiteIds = instruments.filter(id => !foundKiteIds.has(id));
    if (remainingKiteIds.length > 0) {
      try {
        const tickerUrl = process.env.NEXT_PUBLIC_TICKER_URL || (process.env.NODE_ENV === 'production' ? 'https://marginapexx-production.up.railway.app' : 'http://localhost:8080');
        const params = new URLSearchParams({ symbols: remainingKiteIds.join(',') });
        const resTicker = await fetch(`${tickerUrl}/quotes?${params}`, { cache: 'no-store' });
        if (resTicker.ok) {
          const json = await resTicker.json();
          if (json.success && json.data) {
            for (const [key, val] of Object.entries(json.data)) {
              result[key] = (val as any).last_price;
              foundKiteIds.add(key);
            }
          }
        }
      } catch (tickerErr) {
        console.warn('[fetchKiteQuotes] Failed to query Ticker Daemon, falling back to REST:', tickerErr);
      }
    }

    // 3. Identify missing instruments
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
        }
      }

      // Cache missing instruments in background (excluding raw ticks)
      if (instrumentUpserts.length > 0) {
        (async () => {
          try {
            await admin.from('instruments').upsert(instrumentUpserts, { onConflict: 'id' });
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
  if (['NSE - Futures', 'BSE - Futures', 'NFO - Futures', 'BFO - Futures'].includes(trimmed)) return 'INDEX-FUT';
  if (['NSE - Options', 'BSE - Options', 'NFO - Options', 'BFO - Options'].includes(trimmed)) return 'INDEX-OPT';
  if (['NSE - Stock Futures', 'BSE - Stock Futures', 'NFO - Stock Futures', 'BFO - Stock Futures'].includes(trimmed)) return 'STOCK-FUT';
  if (['NSE - Stock Options', 'BSE - Stock Options', 'NFO - Stock Options', 'BFO - Stock Options'].includes(trimmed)) return 'STOCK-OPT';
  if (trimmed === 'MCX - Futures') return 'MCX-FUT';
  if (trimmed === 'MCX - Options') return 'MCX-OPT';
  if (['NSE - Equity', 'BSE - Equity'].includes(trimmed)) return 'NSE-EQ';
  if (trimmed === 'Crypto' || trimmed === 'CRYPTO') return 'CRYPTO';
  if (trimmed === 'Forex' || trimmed === 'FOREX' || trimmed === 'CDS - Futures' || trimmed === 'CDS - Options') return 'FOREX';
  if (trimmed === 'COMEX - Futures' || trimmed === 'COMEX - Options' || trimmed === 'COMEX' || trimmed === 'COI') return 'COMEX';
  return trimmed;
}

function getLotSize(symbol: string, dbSettings?: { symbol: string; lot_size: number }[]): number {
  const n = symbol.toUpperCase();
  if (dbSettings && Array.isArray(dbSettings)) {
    const sortedSettings = [...dbSettings].sort((a, b) => b.symbol.length - a.symbol.length);
    const match = sortedSettings.find(s => n.includes(s.symbol.toUpperCase()));
    if (match) return Number(match.lot_size);
  }
  if (n.includes('BANKNIFTY') || n.includes('BANKEX')) return 15;
  if (n.includes('FINNIFTY')) return 25;
  if (n.includes('MIDCP') || n.includes('MIDCAP')) return 50;
  if (n.includes('SENSEX')) return 10;
  if (n.includes('NIFTY')) return 25;
  if (n.includes('GOLDM')) return 10;
  if (n.includes('GOLD')) return 100;
  if (n.includes('SILVERM')) return 5;
  if (n.includes('SILVER')) return 30;
  if (n.includes('CRUDEOILM')) return 10;
  if (n.includes('CRUDEOIL')) return 100;
  if (n.includes('NATGASMINI')) return 250;
  if (n.includes('NATURALGAS')) return 1250;
  return 1;
}

function mapSymbolToSegment(symbol: string): string {
  const n = symbol.toUpperCase();
  if (n.includes('GOLD') || n.includes('SILVER') || n.includes('CRUDE') || n.includes('NATGAS') || n.includes('NATURALGAS')) {
    return 'COMEX';
  }
  if (n.includes('FUT') || n.includes('FUTURES')) {
    if (n.includes('NIFTY') || n.includes('SENSEX') || n.includes('BANKEX') || n.includes('FINNIFTY') || n.includes('MIDCP') || n.includes('MIDCAP')) {
      return 'INDEX-FUT';
    }
    return 'STOCK-FUT';
  }
  if (n.includes('CE') || n.includes('PE')) {
    if (n.includes('NIFTY') || n.includes('SENSEX') || n.includes('BANKEX') || n.includes('FINNIFTY') || n.includes('MIDCP') || n.includes('MIDCAP')) {
      return 'INDEX-OPT';
    }
    return 'STOCK-OPT';
  }
  return 'NSE-EQ'; // fallback default
}

// ─── GET /api/orders ──────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const authResult = await apiRequireAuth(request, ['VIEW_OWN_ORDERS']);
  if (authResult instanceof Response) return authResult as NextResponse;
  const { callerUser: user } = authResult;

  try {
    const admin = getAdminClient();
    const { searchParams } = request.nextUrl;
    const page  = parseInt(searchParams.get('page')  ?? '1',  10);
    const limit = parseInt(searchParams.get('limit') ?? '50', 10);
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    // Fetch orders and open positions in parallel
    const [ordersRes, posRes] = await Promise.all([
      admin
        .from('orders')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, to),
      admin
        .from('positions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'open')
    ]);

    if (ordersRes.error) throw ordersRes.error;

    const dbOrders = ordersRes.data ?? [];
    const openPositions = posRes.data ?? [];

    const orders: MyOrder[] = dbOrders.map((r: Record<string, unknown>) => ({
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
      brokerage:    Number(r.brokerage ?? 0),
      client_price: r.client_price !== null ? Number(r.client_price) : undefined,
      trigger_price: r.trigger_price !== null ? Number(r.trigger_price) : undefined,
      stop_loss:    r.stop_loss !== null ? Number(r.stop_loss) : undefined,
      target:       r.target !== null ? Number(r.target) : undefined,
      created_at:   r.created_at as string,
    }));

    // Dynamically synthesize virtual pending orders for positions with SL/Target
    const virtualOrders: MyOrder[] = [];
    for (const pos of openPositions) {
      const stopLoss = pos.stop_loss ? Number(pos.stop_loss) : (pos.sl ? Number(pos.sl) : null);
      const target = pos.target ? Number(pos.target) : (pos.tp ? Number(pos.tp) : null);

      if (stopLoss !== null && stopLoss > 0 && target !== null && target > 0) {
        virtualOrders.push({
          id: `pos-gtt-${pos.id}`,
          symbol: pos.symbol,
          segment: pos.settlement || '',
          side: pos.side === 'BUY' ? 'SELL' : 'BUY',
          status: 'PENDING',
          qty: Number(pos.qty_open),
          lots: Number(pos.lots ?? 0) || (pos.qty_open > 0 ? 1 : 0),
          fill_price: 0,
          ltp_at_entry: Number(pos.avg_price ?? pos.entry_price),
          order_type: 'GTT',
          product_type: (pos.product_type as any) ?? 'INTRADAY',
          info: 'GTT (Exit)',
          brokerage: 0,
          trigger_price: stopLoss,
          stop_loss: stopLoss,
          target: target,
          created_at: pos.created_at || new Date().toISOString(),
        });
      } else {
        if (stopLoss !== null && stopLoss > 0) {
          virtualOrders.push({
            id: `pos-sl-${pos.id}`,
            symbol: pos.symbol,
            segment: pos.settlement || '',
            side: pos.side === 'BUY' ? 'SELL' : 'BUY', // Stop loss exit is opposite side
            status: 'PENDING',
            qty: Number(pos.qty_open),
            lots: Number(pos.lots ?? 0) || (pos.qty_open > 0 ? 1 : 0),
            fill_price: stopLoss,
            ltp_at_entry: Number(pos.avg_price ?? pos.entry_price),
            order_type: 'SL',
            product_type: (pos.product_type as any) ?? 'INTRADAY',
            info: 'Stop Loss (Exit)',
            brokerage: 0,
            trigger_price: stopLoss,
            stop_loss: stopLoss,
            created_at: pos.created_at || new Date().toISOString(),
          });
        }
  
        if (target !== null && target > 0) {
          virtualOrders.push({
            id: `pos-target-${pos.id}`,
            symbol: pos.symbol,
            segment: pos.settlement || '',
            side: pos.side === 'BUY' ? 'SELL' : 'BUY', // Target exit is opposite side
            status: 'PENDING',
            qty: Number(pos.qty_open),
            lots: Number(pos.lots ?? 0) || (pos.qty_open > 0 ? 1 : 0),
            fill_price: target,
            ltp_at_entry: Number(pos.avg_price ?? pos.entry_price),
            order_type: 'LIMIT',
            product_type: (pos.product_type as any) ?? 'INTRADAY',
            info: 'Target (Exit)',
            brokerage: 0,
            client_price: target,
            target: target,
            created_at: pos.created_at || new Date().toISOString(),
          });
        }
      }
    }

    // Combine and sort by created_at descending (so latest is at top)
    const combinedOrders = [...virtualOrders, ...orders];
    combinedOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({ orders: combinedOrders, page, limit });
  } catch (err) {
    console.error('[GET /api/orders]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── POST /api/orders ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Authenticate
  let user = await getUserFromRequest(request);
  if (!user) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Webhook ')) {
      const token = authHeader.slice(8).trim();
      const admin = getAdminClient();
      const { data } = await admin
        .from('profiles')
        .select('id')
        .eq('webhook_token', token)
        .maybeSingle();
      if (data) {
        user = { id: data.id } as any;
      }
    }
  }
  if (!user) {
    if (process.env.NODE_ENV === 'development') {
      user = { id: 'dfa9b057-9187-4054-9ae6-9179c620666e' } as any; // Mock user ID for testing
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // 2. Parse body
  let body: PlaceOrderRequest;
  try {
    body = await request.json() as PlaceOrderRequest;
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { symbol: rawSymbol, kite_instrument, segment, side, order_type, product_type, qty, lots, client_price, trigger_price, stop_loss, target, is_exit } = body;

  // Normalize crypto symbol: positions may be stored as 'ETH' or 'ETH/USDT'
  // but exit orders arrive as 'ETHUSDT' from the Binance feed. Strip the USDT
  // suffix so the RPC can find the open position.
  let symbol = rawSymbol;

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

  let dbSegment = mapSegmentToDbSegment(segment);
  const symUp = symbol.toUpperCase();
  if (symUp.includes('GOLD') || symUp.includes('SILVER') || symUp.includes('CRUDE') || symUp.includes('NATGAS') || symUp.includes('NATURALGAS')) {
    const isOptionSymbol = symUp.endsWith('CE') || symUp.endsWith('PE');
    dbSegment = isOptionSymbol ? 'MCX-OPT' : 'COMEX';
  }
  
  const admin = getAdminClient();

  // ── Step A: Fetch profile first (we need parent_id + trading_mode for the next batch) ──
  const profileResult = await admin.from('profiles')
    .select('id, active, read_only, segments, parent_id, balance, trading_mode')
    .eq('id', user.id)
    .single();

  const profile = profileResult.data;
  if (profileResult.error || !profile) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 403 });
  }
  if (!profile.active) {
    return NextResponse.json({ error: 'Account is inactive' }, { status: 403 });
  }
  if (profile.read_only) {
    return NextResponse.json({ error: 'Account is in read-only mode' }, { status: 403 });
  }

  const isScalper = profile.trading_mode === 'scalper';
  const targetTable = isScalper ? 'scalper_segment_settings' : 'segment_settings';
  const parentId = profile.parent_id && profile.parent_id !== user.id ? profile.parent_id : null;

  const kiteInst = kite_instrument || symbol;
  const instrumentsToFetch = [kiteInst];
  const isOption = dbSegment.includes('OPT');
  const underlyingId = dbSegment.includes('BANK') ? 'NSE:NIFTY BANK' : 'NSE:NIFTY 50';
  if (isOption && underlyingId !== kiteInst) {
    instrumentsToFetch.push(underlyingId);
  }

  // ── Step B: Fire ALL remaining independent queries in one parallel batch ──
  // This includes: user seg settings, parent seg settings (speculative), positions,
  // LTP fetch, script settings, blocked scripts, and market hours — all at once.
  const segUpper = dbSegment.toUpperCase();
  let segmentId = 'nse';
  if (segUpper.includes('MCX') || segUpper.includes('COMEX')) segmentId = 'mcx';
  else if (segUpper.includes('BSE') || segUpper.includes('BFO')) segmentId = 'bse';
  else if (segUpper.includes('CDS') || segUpper.includes('FOREX')) segmentId = 'forex';

  const [
    segSettingsResult,
    parentSegSettingsResult,
    positionsResult,
    quotesMap,
    scriptSettingsResult,
    blockedScriptsResult,
    tradingHoursResult,
    pendingOrdersResult,
  ] = await Promise.all([
    // User's own segment settings (both sides)
    admin.from(targetTable)
      .select('*')
      .eq('user_id', user.id)
      .eq('segment', dbSegment),

    // Parent segment settings fetched speculatively in the same round-trip —
    // avoids a second sequential DB call on the hot path for sub-accounts.
    parentId
      ? admin.from(targetTable).select('*').eq('user_id', parentId).eq('segment', dbSegment)
      : Promise.resolve({ data: [] as any[], error: null }),

    // Open positions for lot-limit and margin checks
    admin.from('positions')
      .select('id, symbol, qty_open, status, entry_price, side, product_type, entry_time, locked_margin, margin_required, pnl')
      .eq('user_id', user.id)
      .in('status', ['open', 'OPEN', 'active', 'ACTIVE']),

    // LTP — Binance for crypto, Kite/Redis/Ticker Daemon for everything else
    (async () => {
      if (dbSegment === 'CRYPTO') {
        const q = await fetchBinanceQuote(symbol);
        return q ? { [kiteInst]: q.ltp, [`${kiteInst}_bid`]: q.bid, [`${kiteInst}_ask`]: q.ask } : {};
      }
      return fetchKiteQuotes(instrumentsToFetch);
    })(),

    // Script settings for lot size lookup
    admin.from('script_settings').select('symbol, lot_size'),

    // Blocked scripts for this user
    admin.from('user_blocked_scripts')
      .select('symbol')
      .eq('user_id', user.id)
      .eq('symbol', symbol)
      .maybeSingle(),

    // Market hours — non-crypto only; resolve immediately for crypto
    segUpper.includes('CRYPTO')
      ? Promise.resolve({ data: null, error: null })
      : admin.from('trading_hours')
          .select('name, start_time, end_time, is_active')
          .eq('id', segmentId)
          .maybeSingle(),
          
    // Pending orders for lot-limit checks
    admin.from('orders')
      .select('id, symbol, qty, lots, status, side, segment, is_exit')
      .eq('user_id', user.id)
      .eq('status', 'PENDING'),
  ]);

  // Market hours check (result already fetched in parallel above)
  if (!segUpper.includes('CRYPTO')) {
    try {
      const segmentHour = tradingHoursResult.data;
      if (!tradingHoursResult.error && segmentHour) {
        if (!segmentHour.is_active) {
          return NextResponse.json({ error: 'market is closed' }, { status: 400 });
        }
        const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const dayOfWeek = nowIST.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return NextResponse.json({ error: 'market is closed' }, { status: 400 });
        }
        const currentHHMM = `${String(nowIST.getHours()).padStart(2, '0')}:${String(nowIST.getMinutes()).padStart(2, '0')}`;
        if (currentHHMM < segmentHour.start_time || currentHHMM >= segmentHour.end_time) {
          return NextResponse.json({ error: 'market is closed' }, { status: 400 });
        }
      }
    } catch (err) {
      console.error('[POST /api/orders] Market hours check error:', err);
    }
  }

  const openPositions = positionsResult?.data ?? [];
  const pendingOrders = pendingOrdersResult?.data ?? [];
  const dbScriptSettings = (scriptSettingsResult?.data as any[]) ?? [];
  const blockedScript = blockedScriptsResult?.data;

  // Resolve crypto symbol form: if exiting, we must match the exact form stored in the DB (e.g. 'BTC', 'BTCUSDT', or 'BTC/USDT')
  if (is_exit && dbSegment === 'CRYPTO') {
    const base = symbol.toUpperCase().replace(/USDT$/, '').replace(/\/USDT$/, '');
    const withoutUsdt = base;
    const withUsdt = base + 'USDT';
    const slashForm = base + '/USDT';

    // Find a matching position regardless of which of the 3 formats was sent
    const matchedPos = openPositions.find((p: any) => 
      p.symbol === withoutUsdt || p.symbol === withUsdt || p.symbol === slashForm
    );

    if (matchedPos && matchedPos.symbol !== symbol) {
      symbol = matchedPos.symbol; // use the form stored in DB
    }
  }

  // LTP from parallel fetch
  let kiteLtp = quotesMap[kiteInst] ?? null;
  let kiteBid = quotesMap[`${kiteInst}_bid`] ?? kiteLtp;
  let kiteAsk = quotesMap[`${kiteInst}_ask`] ?? kiteLtp;

  if (!kiteLtp || kiteLtp <= 0) {
    if (client_price && client_price > 0) {
      kiteLtp = client_price;
      kiteBid = client_price;
      kiteAsk = client_price;
      console.warn(`[orders] Market quote not found for ${kiteInst}, falling back to client_price: ${client_price}`);
    } else {
      return NextResponse.json({ error: 'Could not determine market price. Try again.' }, { status: 503 });
    }
  }

  // 5. Segment and Script permission check
  const allowedSegments: string[] = profile.segments ?? [];
  if (allowedSegments.length > 0 && !allowedSegments.includes(dbSegment)) {
    return NextResponse.json({ error: 'Trading Not Allowed In This Script. Please Contact Admin.' }, { status: 403 });
  }

  if (blockedScript) {
    return NextResponse.json({ error: 'Trading Not Allowed In This Script. Please Contact Admin.' }, { status: 403 });
  }

  // 6. Segment settings — already fetched in parallel (user + parent speculatively)
  const settingsList = segSettingsResult.data || [];
  const parentSettingsList = parentSegSettingsResult.data || [];

  let buySetting = settingsList.find((s: any) => s.side === 'BUY') || parentSettingsList.find((s: any) => s.side === 'BUY');
  let sellSetting = settingsList.find((s: any) => s.side === 'SELL') || parentSettingsList.find((s: any) => s.side === 'SELL');
  let intraday_leverage = 10;
  let holding_leverage = 10;
  if (segUpper.includes('FOREX') || segUpper.includes('CDS')) {
    intraday_leverage = 100;
    holding_leverage = 10;
  } else if (segUpper.includes('CRYPTO')) {
    intraday_leverage = 10;
    holding_leverage = 1;
  }

  if (!buySetting) {
    buySetting = {
      id: '',
      user_id: user.id,
      segment: dbSegment,
      side: 'BUY',
      trade_allowed: true, // segment-permission check above already gates access
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
      top_limit: 0,
      min_limit: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
  if (!sellSetting) {
    sellSetting = {
      id: '',
      user_id: user.id,
      segment: dbSegment,
      side: 'SELL',
      trade_allowed: true, // segment-permission check above already gates access
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
      top_limit: 0,
      min_limit: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const segSetting = side === 'BUY' ? buySetting : sellSetting;

  // 7. Validate lot / qty limits & Strike Range
  if (!segSetting.trade_allowed) {
    return NextResponse.json({ error: 'Trading Not Allowed In This Script. Please Contact Admin.' }, { status: 403 });
  }

  const symbolLotSize = lots > 0 ? (qty / lots) : getLotSize(symbol, dbScriptSettings);
  const maxQty = (segSetting.max_order_lot as number) * symbolLotSize;
  if (qty > maxQty) {
    return NextResponse.json({
      error: `Order exceeds maximum allowed order limit of ${segSetting.max_order_lot} lots (${maxQty} units)`,
    }, { status: 400 });
  }

  // Verify cumulative segment limits (max_lot)
  let totalOpenLots = 0;
  if (openPositions.length > 0) {
    for (const pos of openPositions) {
      const posSegment = mapSymbolToSegment(pos.symbol);
      if (posSegment === dbSegment) {
        const size = getLotSize(pos.symbol, dbScriptSettings);
        totalOpenLots += Number(pos.qty_open) / size;
      }
    }
  }

  // Include PENDING entry orders in the segment limit check
  if (pendingOrders.length > 0) {
    for (const po of pendingOrders) {
      if (po.is_exit) continue; // Skip pending exit orders
      if (po.segment === dbSegment || mapSymbolToSegment(po.symbol) === dbSegment) {
        const size = getLotSize(po.symbol, dbScriptSettings);
        const poLots = Number(po.lots) > 0 ? Number(po.lots) : (Number(po.qty) / size);
        totalOpenLots += poLots;
      }
    }
  }

  const newOrderLots = lots > 0 ? lots : (qty / symbolLotSize);
  if (!is_exit && (totalOpenLots + newOrderLots > (segSetting.max_lot as number))) {
    return NextResponse.json({
      error: `Order exceeds maximum segment limit of ${segSetting.max_lot} lots. Current open/pending positions: ${totalOpenLots.toFixed(2)} lots.`,
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

  // 8. Balance check — use FREE MARGIN (balance - sum of locked margins)
  const balance = Number(profile.balance ?? 0);
  const targetProductType = product_type ?? 'INTRADAY';
  const leverageVal = targetProductType === 'CARRY'
    ? (segSetting.holding_leverage ?? 10)
    : (segSetting.intraday_leverage ?? 10);
  const leverageType = targetProductType === 'CARRY'
    ? (segSetting.holding_type ?? 'Multiplier')
    : (segSetting.intraday_type ?? 'Multiplier');

  // 9. Base LTP from server
  if (!kiteLtp || kiteLtp <= 0) {
    return NextResponse.json({ error: 'Could not determine market price. Try again.' }, { status: 503 });
  }
  const baseLtp = kiteLtp;

  // Use server price for margin check so it's always accurate regardless of UI staleness
  const marginPrice = (order_type === 'LIMIT' || order_type === 'SL' || order_type === 'GTT')
    ? client_price   // pending orders: use the user's specified price
    : baseLtp;       // MARKET/SLM: use live server price
  const exposure      = qty * marginPrice;
  
  let marginPortion = 0;
  if (!is_exit) {
    marginPortion = calculateMarginPortion({
      segment: segment.toUpperCase(),
      side,
      leverageType,
      leverage: leverageVal,
      totalQty: qty,
      lotSize: symbolLotSize,
      baseExposure: exposure
    });
  }

  const entryBufferRatio = ((side === 'SELL' ? sellSetting.entry_buffer : buySetting.entry_buffer) ?? 0) / 100;
  const exitBufferRatio = ((side === 'SELL' ? sellSetting.exit_buffer : buySetting.exit_buffer) ?? 0) / 100;
  const entryBufferCost = exposure * entryBufferRatio;
  const exitBufferCost = exposure * exitBufferRatio;

  let intradayCharge = 0;
  let carryCharge = 0;
  let gttCharge = 0;

  const lotsUsed = lots > 0 ? lots : (qty / symbolLotSize);

  // Calculate base charge based on product type (or forced CARRY for GTT)
  if (targetProductType === 'CARRY' || order_type === 'GTT') {
    const carryCommType = segSetting.carry_commission_type || segSetting.commission_type || 'Per Crore';
    const carryCommVal = Number(segSetting.carry_commission_value ?? segSetting.commission_value ?? 0);
    if (carryCommType === 'Per Crore') carryCharge = (exposure * carryCommVal) / 10000000;
    else if (carryCommType === 'Per Lot') carryCharge = lotsUsed * carryCommVal;
    else if (carryCommType === 'Per Trade' || carryCommType === 'Flat') carryCharge = carryCommVal;
    else carryCharge = exposure * 0.001;
  } else {
    const intradayCommType = segSetting.commission_type || 'Per Crore';
    const intradayCommVal = Number(segSetting.commission_value ?? 0);
    if (intradayCommType === 'Per Crore') intradayCharge = (exposure * intradayCommVal) / 10000000;
    else if (intradayCommType === 'Per Lot') intradayCharge = lotsUsed * intradayCommVal;
    else if (intradayCommType === 'Per Trade' || intradayCommType === 'Flat') intradayCharge = intradayCommVal;
    else intradayCharge = exposure * 0.001;
  }

  // GTT
  if (order_type === 'GTT') {
    const gttCommType = segSetting.gtt_commission_type || 'Per Trade';
    const gttCommVal = Number(segSetting.gtt_commission_value ?? 10);
    if (gttCommType === 'Per Crore') gttCharge = (exposure * gttCommVal) / 10000000;
    else if (gttCommType === 'Per Lot') gttCharge = lotsUsed * gttCommVal;
    else if (gttCommType === 'Per Trade' || gttCommType === 'Flat') gttCharge = gttCommVal;
  }

  // Since brokerage might be zeroed out later for Crypto, we capture it as required margin first
  // However, we MUST use a `let` variable because we re-assign `brokerage = 0` below
  let brokerage = (intradayCharge + carryCharge + gttCharge) * 2;

  const requiredMargin = marginPortion + brokerage;

  // Free Margin = Balance + Floating PnL - Sum(locked_margins from all open positions)
  // Consistent with marginSquareOff.ts and liquidationEngine.ts.
  // Floating PnL from the DB-cached pos.pnl is used here as an approximation;
  // the live liquidation engine uses real-time LTP-based PnL for the trigger.
  const totalLockedMargin = openPositions.reduce(
    (sum: number, p: any) => sum + Number(p.locked_margin || p.margin_required || 0), 0
  );
  const totalFloatingLoss = openPositions.reduce(
    (sum: number, p: any) => {
      const pnl = Number(p.pnl || 0);
      return sum + (pnl < 0 ? pnl : 0);
    }, 0
  );
  const freeMargin = balance + totalFloatingLoss;

  if (freeMargin < requiredMargin) {
    return NextResponse.json({
      error: `Insufficient margin. Free Margin: ₹${freeMargin.toFixed(2)}, Required: ₹${requiredMargin.toFixed(2)} (Balance: ₹${balance.toFixed(2)}, Used: ₹${totalLockedMargin.toFixed(2)})`,
    }, { status: 400 });
  }


  // Validate Limit price constraints relative to LTP
  if (order_type === 'LIMIT') {
    if (side === 'BUY' && client_price >= baseLtp) {
      return NextResponse.json({ error: 'Limit price must be lower than the current market price (LTP).' }, { status: 400 });
    }
    if (side === 'SELL' && client_price <= baseLtp) {
      return NextResponse.json({ error: 'Limit price must be higher than the current market price (LTP).' }, { status: 400 });
    }
  } else if (order_type === 'GTT' && !is_exit) {
    if (side === 'BUY' && client_price > baseLtp) {
      return NextResponse.json({ error: 'Limit price must be lower than or equal to the current market price (LTP).' }, { status: 400 });
    }
    if (side === 'SELL' && client_price < baseLtp) {
      return NextResponse.json({ error: 'Limit price must be higher than or equal to the current market price (LTP).' }, { status: 400 });
    }
  }

  // Validate SL and SLM trigger price constraints relative to LTP
  if (order_type === 'SL' || order_type === 'SLM') {
    const trigPrice = trigger_price ? parseFloat(trigger_price.toString()) : null;
    if (trigPrice !== null && !isNaN(trigPrice)) {
      if (is_exit) {
        // Exit stop loss order:
        // - Exiting LONG (SELL order): trigger price must be below market price (LTP) to act as stop loss
        // - Exiting SHORT (BUY order): trigger price must be above market price (LTP) to act as stop loss
        if (side === 'BUY' && trigPrice <= baseLtp) {
          return NextResponse.json({ error: 'Stop loss trigger price must be above the current market price for short exits.' }, { status: 400 });
        }
        if (side === 'SELL' && trigPrice >= baseLtp) {
          return NextResponse.json({ error: 'Stop loss trigger price must be below the current market price for long exits.' }, { status: 400 });
        }
      } else {
        // Entry order:
        // - SLM entry on MarginApex executes immediately as a MARKET order and sets the trigger price as the position's stop loss.
        //   Thus, BUY SLM = LONG position (SL below market), SELL SLM = SHORT position (SL above market).
        // - SL entry is a pending breakout order.
        //   Thus, BUY SL = pending buy above market, SELL SL = pending sell below market.
        if (order_type === 'SLM') {
          if (side === 'BUY' && trigPrice >= baseLtp) {
            return NextResponse.json({ error: 'Stop loss price must be below the current market price.' }, { status: 400 });
          }
          if (side === 'SELL' && trigPrice <= baseLtp) {
            return NextResponse.json({ error: 'Stop loss price must be above the current market price.' }, { status: 400 });
          }
        } else { // SL order type
          if (side === 'BUY' && trigPrice <= baseLtp) {
            return NextResponse.json({ error: 'Trigger price must be above the current market price for stop limit buy.' }, { status: 400 });
          }
          if (side === 'SELL' && trigPrice >= baseLtp) {
            return NextResponse.json({ error: 'Trigger price must be below the current market price for stop limit sell.' }, { status: 400 });
          }
        }
      }
    }
  }

  // Validate Target and Stop Loss rules
  const orderTarget = target ? parseFloat(target.toString()) : null;
  const orderSL = stop_loss ? parseFloat(stop_loss.toString()) : null;
  const refPrice = ['LIMIT', 'SL', 'GTT'].includes(order_type ?? 'MARKET') ? client_price : baseLtp;

  // Resolve reference entry price and position side (Long vs Short)
  const activePosition = openPositions.find(
    (p: any) => p.symbol === symbol && p.product_type === targetProductType
  );

  const refEntry = (is_exit && activePosition) ? Number(activePosition.entry_price) : refPrice;
  const isLong = (is_exit && activePosition) ? (activePosition.side === 'BUY') : (side === 'BUY');

  // Enforce Anti-Scalping hold duration for manual market exits
  if (is_exit && activePosition && (order_type === 'MARKET' || order_type === 'SLM')) {
    const profitHoldSec = segSetting?.profit_hold_sec ?? 120;
    const lossHoldSec = segSetting?.loss_hold_sec ?? 0;

    // Use displayed P&L (entry_price is the buffered fill price) to determine profit/loss.
    // Matches what the user sees on screen and what the close route enforces.
    const pnlValue = activePosition.side === 'BUY'
      ? (baseLtp - Number(activePosition.entry_price)) * Number(activePosition.qty_open)
      : (Number(activePosition.entry_price) - baseLtp) * Number(activePosition.qty_open);

    const durationSec = Math.floor((Date.now() - new Date(activePosition.entry_time).getTime()) / 1000);
    const requiredHold = pnlValue > 0 ? profitHoldSec : lossHoldSec;

    if (durationSec < requiredHold) {
      return NextResponse.json({
        error: `Anti-Scalping: Minimum hold time of ${requiredHold}s required for this trade. Elapsed: ${durationSec}s.`,
      }, { status: 403 });
    }
  }

  if (is_exit) {
    if (isLong) {
      if (orderTarget !== null && orderTarget <= baseLtp) {
        return NextResponse.json({ error: 'Target price must be above the current market price (LTP).' }, { status: 400 });
      }
      if (orderSL !== null && orderSL >= baseLtp) {
        return NextResponse.json({ error: 'Stop loss price must be below the current market price (LTP).' }, { status: 400 });
      }
    } else {
      if (orderTarget !== null && orderTarget >= baseLtp) {
        return NextResponse.json({ error: 'Target price must be below the current market price (LTP).' }, { status: 400 });
      }
      if (orderSL !== null && orderSL <= baseLtp) {
        return NextResponse.json({ error: 'Stop loss price must be above the current market price (LTP).' }, { status: 400 });
      }
    }
  } else {
    // First-time purchase validations
    const hasLimitPrice = ['LIMIT', 'SL', 'GTT'].includes(order_type ?? 'MARKET');
    if (isLong) {
      if (orderSL !== null) {
        if (orderSL >= baseLtp) {
          return NextResponse.json({ error: 'Stop loss price must be below the current market price (LTP).' }, { status: 400 });
        }
        if (hasLimitPrice && orderSL >= client_price) {
          return NextResponse.json({ error: 'Stop loss price must be below the limit price.' }, { status: 400 });
        }
      }
      if (orderTarget !== null && orderTarget < baseLtp) {
        return NextResponse.json({ error: 'Target price must be above or equal to the current market price (LTP).' }, { status: 400 });
      }
    } else {
      if (orderSL !== null) {
        if (orderSL <= baseLtp) {
          return NextResponse.json({ error: 'Stop loss price must be above the current market price (LTP).' }, { status: 400 });
        }
        if (hasLimitPrice && orderSL <= client_price) {
          return NextResponse.json({ error: 'Stop loss price must be above the limit price.' }, { status: 400 });
        }
      }
      if (orderTarget !== null && orderTarget > baseLtp) {
        return NextResponse.json({ error: 'Target price must be below or equal to the current market price (LTP).' }, { status: 400 });
      }
    }
  }

  // Segment Price Limits validation (top_limit and min_limit)
  const topLimit = Number(segSetting.top_limit ?? 0);
  const minLimit = Number(segSetting.min_limit ?? 0);
  if (['LIMIT', 'SL', 'GTT'].includes(order_type ?? 'MARKET')) {
    if (side === 'BUY') {
      if (topLimit > 0) {
        const maxAllowed = baseLtp * (1 + topLimit / 100);
        if (client_price > maxAllowed) {
          return NextResponse.json({
            error: `Maximum price allowed is ₹${maxAllowed.toFixed(2)}`
          }, { status: 400 });
        }
      }

      if (minLimit > 0) {
        const minAllowed = baseLtp * (1 - minLimit / 100);
        if (client_price < minAllowed) {
          return NextResponse.json({
            error: `Minimum price allowed is ₹${minAllowed.toFixed(2)}`
          }, { status: 400 });
        }
      }
    } else { // SELL side
      if (topLimit > 0) {
        const maxAllowed = baseLtp * (1 + topLimit / 100);
        if (client_price > maxAllowed) {
          return NextResponse.json({
            error: `Maximum price allowed is ₹${maxAllowed.toFixed(2)}`
          }, { status: 400 });
        }
      }

      if (minLimit > 0) {
        const minAllowed = baseLtp * (1 - minLimit / 100);
        if (client_price < minAllowed) {
          return NextResponse.json({
            error: `Minimum price allowed is ₹${minAllowed.toFixed(2)}`
          }, { status: 400 });
        }
      }
    }
  }

  // 10. Compute fill price (LTP ± buffer from segment_settings)
  let fillPrice: number;
  let bufferFee = 0;
  const isImmediate = (order_type ?? 'MARKET') === 'MARKET' || order_type === 'SLM';

  if (order_type === 'LIMIT' || order_type === 'SL' || order_type === 'GTT') {
    fillPrice = client_price;
  } else {
    const buyEntryBuffer = (buySetting?.entry_buffer ?? 0.3) / 100;
    const buyBidBuffer = (buySetting?.bid_buffer ?? 0.3) / 100;
    const buyExitBuffer = (buySetting?.exit_buffer ?? 0.17) / 100;
    const sellEntryBuffer = (sellSetting?.entry_buffer ?? 0.3) / 100;
    const sellBidBuffer = (sellSetting?.bid_buffer ?? 0.3) / 100;
    const sellExitBuffer = (sellSetting?.exit_buffer ?? 0.17) / 100;

    let priceWithBuffer = baseLtp;
    
    // Check if the custom calculation is enabled for this side
    const isCustomCalc = side === 'BUY' ? buySetting?.use_custom_calc : sellSetting?.use_custom_calc;

    if (dbSegment === 'CRYPTO' && isCustomCalc) {
      const brokeragePerUnit = qty > 0 ? (brokerage / qty) : 0;
      
      if (side === 'BUY') {
        if (is_exit) {
          // Buy to close: bid + bid buffer + exit buffer + brokerage
          priceWithBuffer = kiteBid * (1 + sellBidBuffer + sellExitBuffer) + brokeragePerUnit;
        } else {
          // Long Entry: bid + bid buffer + entry buffer + brokerage
          priceWithBuffer = kiteBid * (1 + buyBidBuffer + buyEntryBuffer) + brokeragePerUnit;
        }
      } else {
        if (is_exit) {
          // Sell to close: ask - bid buffer - exit buffer - brokerage
          priceWithBuffer = kiteAsk * (1 - buyBidBuffer - buyExitBuffer) - brokeragePerUnit;
        } else {
          // Short Entry: ask - bid buffer - entry buffer - brokerage
          priceWithBuffer = kiteAsk * (1 - sellBidBuffer - sellEntryBuffer) - brokeragePerUnit;
        }
      }
      
      // Since brokerage is now baked into the execution price, we set it to 0 so the wallet doesn't get double charged.
      brokerage = 0;
      bufferFee = 0;
      fillPrice = priceWithBuffer;
    } else {
      if (side === 'BUY') {
        if (is_exit) {
          // Exiting SELL/Short (Buying back) executes at: Ask * (1 + exitBuffer) of SELL side settings
          priceWithBuffer = baseLtp * (1 + sellExitBuffer);
        } else {
          // Long Entry (Buying) executes at: Ask * (1 + entryBuffer) of BUY side settings
          priceWithBuffer = baseLtp * (1 + buyEntryBuffer);
        }
      } else {
        if (is_exit) {
          // Exiting BUY/Long (Selling to close) executes at: Bid * (1 - bidBuffer) of BUY side settings
          priceWithBuffer = baseLtp * (1 - buyBidBuffer);
        } else {
          // Short Entry (Selling) executes at: Bid * (1 - bidBuffer) of SELL side settings
          priceWithBuffer = baseLtp * (1 - sellBidBuffer);
        }
      }

      // Fill price is the actual execution price (ask for BUY, bid for SELL).
      // Buffer is baked into the fill price so avg_price reflects what the user paid.
      bufferFee = 0;
      fillPrice = priceWithBuffer;
    }
  }

  fillPrice = Math.round(fillPrice * 100) / 100; // 2 dp

  // 11. Atomic write via Postgres RPC
  const targetOrderType = order_type ?? 'MARKET';
  
  // To make SLM execute immediately and create a position, we tell the DB it's a MARKET order
  const rpcOrderType = targetOrderType === 'SLM' ? 'MARKET' : targetOrderType;

  let resolvedTriggerPrice = trigger_price ? parseFloat(trigger_price.toString()) : null;
  let resolvedStopLoss = stop_loss ? parseFloat(stop_loss.toString()) : null;

  // For SLM, the UI sends the Stop Loss price in the trigger_price field.
  if (targetOrderType === 'SLM') {
    if (resolvedTriggerPrice !== null) {
      resolvedStopLoss = resolvedTriggerPrice;
      resolvedTriggerPrice = null; // Clear trigger price since it's a market order now
    }
  }

  const parsedOption = parseOptionSymbol(symbol);
  
  const executeDbCall = async () => {
    const { data: oId, error: rpcErr } = await admin.rpc('place_order', {
      p_user_id:      user.id,
      p_symbol:       symbol,
      p_kite_inst:    kiteInst,
      p_segment:      dbSegment,
      p_side:         side,
      p_order_type:   rpcOrderType,
      p_product_type: product_type ?? 'INTRADAY',
      p_qty:          Number(qty),
      p_lots:         Number(lots ?? 0),
      p_ltp:          baseLtp,
      p_fill_price:   fillPrice,
      p_info:         null,
      p_trigger_price: resolvedTriggerPrice,
      p_stop_loss:    resolvedStopLoss,
      p_target:       target ? parseFloat(target.toString()) : null,
      p_is_exit:      is_exit ?? false,
      p_buffer_fee:   bufferFee
    });
    if (rpcErr) {
      throw new Error(rpcErr.message || 'Order execution failed. Please try again.');
    }

    // Append margin/brokerage info to act_log in the background — user doesn't wait for this
    (async () => {
      try {
        const { data: actLog, error: actLogError } = await admin
          .from('act_logs')
          .select('id, reason')
          .eq('user_id', user.id)
          .eq('symbol', symbol)
          .in('type', ['ORDER_EXECUTION', 'ORDER_PLACED'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (actLog && !actLogError) {
          const marginStr = ` | Margin Req: ₹${requiredMargin.toFixed(2)} | Bkg: ₹${brokerage.toFixed(2)} | Buf: ₹${bufferFee.toFixed(2)}`;
          await admin
            .from('act_logs')
            .update({ reason: actLog.reason + marginStr })
            .eq('id', actLog.id);
        }
      } catch { /* non-critical — don't fail the order */ }
    })();

    return oId as string;
  };

  let orderId: string;
  try {
    if (parsedOption) {
      const incomingOrder = {
        position_key: {
          strike_price: parsedOption.strike,
          option_type: parsedOption.optionType,
        },
        action: (is_exit ?? false)
          ? (side === 'BUY' ? 'SELL_EXIT' : 'BUY_EXIT')
          : (side === 'BUY' ? 'BUY' : 'SELL'),
        quantity: qty,
      } as any;
      orderId = await positionStore.applyOrder(user.id, incomingOrder, executeDbCall);
    } else {
      orderId = await executeDbCall();
    }
  } catch (err: any) {
    console.error('[POST /api/orders] Order execution error:', err);
    return NextResponse.json({ error: err.message || 'Order execution failed. Please try again.' }, { status: 400 });
  }

  // Update order_type to 'SLM' in the database if it was an SLM order asynchronously
  if (targetOrderType === 'SLM' && orderId) {
    admin
      .from('orders')
      .update({ order_type: 'SLM' })
      .eq('id', orderId)
      .then(({ error: updateErr }) => {
        if (updateErr) {
          console.error('[POST /api/orders] Failed to restore SLM order type:', updateErr);
        }
      });
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
