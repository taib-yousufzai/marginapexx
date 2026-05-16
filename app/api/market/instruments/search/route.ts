/**
 * GET /api/market/instruments/search?q=<query>
 *
 * Public endpoint — searches the instruments table for live market instruments.
 * Used by the watchlist search to surface real option chain strikes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSharedKiteSession } from '@/lib/kiteSession';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Known underlying symbols for smart parsing
const UNDERLYINGS = ['MIDCPNIFTY', 'BANKNIFTY', 'FINNIFTY', 'NIFTY', 'SENSEX', 'BANKEX', 'CRUDEOIL', 'NATURALGAS', 'SILVER', 'GOLD'];

/**
 * Try to parse a query like "nifty 24040" or "banknifty 48500 ce"
 * into { underlying, strike, optionType }
 */
function parseOptionQuery(q: string): { underlying: string; strike: number; optionType?: string } | null {
  const upper = q.toUpperCase().trim();
  const underlying = UNDERLYINGS.find(u => upper.startsWith(u));
  if (!underlying) return null;
  const rest = upper.slice(underlying.length).trim();
  if (!rest) return null;
  const match = rest.match(/^(\d+(?:\.\d+)?)\s*(CE|PE)?$/);
  if (!match) return null;
  return {
    underlying,
    strike: parseFloat(match[1]),
    optionType: match[2] || undefined,
  };
}

/**
 * Build a human-readable display name from a Zerodha tradingsymbol.
 * e.g. NIFTY26MAY24050CE  →  NIFTY 24050 CE  (19 May 26)
 *      NIFTY2651924050CE  →  NIFTY 24050 CE  (19 May 26)
 */
function buildDisplayName(tradingsymbol: string, underlying: string, strike: number | null, optionType: string | null, expiry: string | null): string {
  if (strike && optionType) {
    const expLabel = expiry ? ` (${expiry})` : '';
    return `${underlying} ${strike} ${optionType}${expLabel}`;
  }
  return tradingsymbol;
}

/**
 * Fetch live last_price for a list of kite IDs like "NFO:NIFTY26MAY24050CE"
 */
async function fetchLivePrices(kiteIds: string[], request: NextRequest): Promise<Record<string, number>> {
  try {
    const apiKey = process.env.KITE_API_KEY;
    if (!apiKey || kiteIds.length === 0) return {};

    let accessToken = request.cookies.get('kite_access_token')?.value;
    if (!accessToken) {
      const session = await getSharedKiteSession();
      accessToken = session?.accessToken;
    }
    if (!accessToken) return {};

    const params = new URLSearchParams();
    kiteIds.forEach(id => params.append('i', id));

    const res = await fetch(`https://api.kite.trade/quote?${params.toString()}`, {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
      },
      cache: 'no-store',
    });

    if (!res.ok) return {};
    const json = await res.json();
    const priceMap: Record<string, number> = {};
    for (const [id, quote] of Object.entries(json.data || {})) {
      priceMap[id] = (quote as any).last_price ?? 0;
    }
    return priceMap;
  } catch {
    return {};
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get('q') || '').trim();

    if (q.length < 2) {
      return NextResponse.json([]);
    }

    let data: any[] | null = null;
    let error: any = null;

    // Smart parse: "nifty 24040" → underlying + strike query
    const parsed = parseOptionQuery(q);

    if (parsed) {
      let dbQuery = supabase
        .from('instruments')
        .select('tradingsymbol, name, exchange, instrument_type, segment, strike_price, option_type, expiry, underlying_symbol')
        .eq('underlying_symbol', parsed.underlying)
        .eq('strike_price', parsed.strike)
        .order('expiry', { ascending: true })
        .limit(50);

      if (parsed.optionType) {
        dbQuery = dbQuery.eq('option_type', parsed.optionType);
      }

      ({ data, error } = await dbQuery);
    }

    // Fallback: tradingsymbol ilike (spaces removed)
    if (!data || data.length === 0) {
      const qNoSpace = q.replace(/\s+/g, '').toUpperCase();
      ({ data, error } = await supabase
        .from('instruments')
        .select('tradingsymbol, name, exchange, instrument_type, segment, strike_price, option_type, expiry, underlying_symbol')
        .or(`tradingsymbol.ilike.%${qNoSpace}%,tradingsymbol.ilike.%${q}%,name.ilike.%${q}%`)
        .order('expiry', { ascending: true })
        .limit(50));
    }

    if (error) {
      console.error('[GET /api/market/instruments/search] Error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    const rows = data ?? [];

    // Fetch live prices for all results
    const kiteIds = rows.map((inst: any) => `${inst.exchange}:${inst.tradingsymbol}`);
    const priceMap = await fetchLivePrices(kiteIds, request);

    // Map to watchlist-compatible shape
    const results = rows.map((inst: any) => {
      let segmentLabel = '';
      if (inst.instrument_type === 'CE' || inst.instrument_type === 'PE') {
        segmentLabel = `${inst.exchange} - Options`;
      } else if (['FUT', 'MAPPED_FUT', 'FUTIDX', 'FUTSTK', 'FUTCOM', 'FUTCUR'].includes(inst.instrument_type)) {
        segmentLabel = `${inst.exchange} - Futures`;
      } else if (inst.instrument_type === 'EQ') {
        segmentLabel = `${inst.exchange} - Equity`;
      } else {
        segmentLabel = inst.segment || inst.exchange || '';
      }

      const kiteId = `${inst.exchange}:${inst.tradingsymbol}`;
      const livePrice = priceMap[kiteId] ?? 0;

      const displayName = buildDisplayName(
        inst.tradingsymbol,
        inst.underlying_symbol || inst.name || inst.tradingsymbol,
        inst.strike_price ?? null,
        inst.option_type ?? null,
        null,
      );

      return {
        name: displayName,
        symbol: inst.tradingsymbol,
        kiteSymbol: kiteId,
        price: livePrice,
        change: '0%',
        segment: segmentLabel,
        contractDate: inst.expiry || '',
        open: 0,
        high: 0,
        low: 0,
        close: 0,
      };
    });

    return NextResponse.json(results);
  } catch (err: any) {
    console.error('[GET /api/market/instruments/search] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
