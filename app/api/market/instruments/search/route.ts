/**
 * GET /api/market/instruments/search?q=<query>
 *
 * Public endpoint — searches the instruments table for live market instruments.
 * Used by the watchlist search to surface real option chain strikes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSharedKiteSession } from '@/lib/kiteSession';
import { getUserFromRequest } from '@/lib/adminClient';
import {
  applyForexFilter,
  applyCryptoWhitelist,
  applyExpiryFilter,
  type Instrument,
} from '@/lib/filterEngine';

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
 * Checks local database cache first, and falls back to Kite REST on-demand for missing.
 */
async function fetchLivePrices(kiteIds: string[], request: NextRequest): Promise<Record<string, number>> {
  if (kiteIds.length === 0) return {};
  const priceMap: Record<string, number> = {};
  const foundKiteIds = new Set<string>();

  try {
    // 1. Fetch from Ticker Daemon in-memory quotes API
    try {
      const tickerUrl = process.env.NEXT_PUBLIC_TICKER_URL || (process.env.NODE_ENV === 'production' ? 'https://marginapexx-production.up.railway.app' : 'http://localhost:8080');
      const params = new URLSearchParams({ symbols: kiteIds.join(',') });
      const resTicker = await fetch(`${tickerUrl}/quotes?${params}`, { cache: 'no-store' });
      if (resTicker.ok) {
        const json = await resTicker.json();
        if (json.success && json.data) {
          for (const [key, val] of Object.entries(json.data)) {
            priceMap[key] = (val as any).last_price;
            foundKiteIds.add(key);
          }
        }
      }
    } catch (tickerErr) {
      console.warn('[fetchLivePrices] Failed to query Ticker Daemon, falling back to REST:', tickerErr);
    }

    // 2. Identify missing instruments
    const missingKiteIds = kiteIds.filter(id => !foundKiteIds.has(id));

    // 3. Fallback on-demand fetch from Kite REST API for missing instruments
    if (missingKiteIds.length > 0) {
      const apiKey = process.env.KITE_API_KEY;
      if (!apiKey) return priceMap;

      let accessToken = request.cookies.get('kite_access_token')?.value;
      if (!accessToken) {
        const session = await getSharedKiteSession();
        accessToken = session?.accessToken;
      }
      if (!accessToken) return priceMap;

      const batchSize = 100;
      const batches: string[][] = [];
      for (let i = 0; i < missingKiteIds.length; i += batchSize) {
        batches.push(missingKiteIds.slice(i, i + batchSize));
      }

      const results = await Promise.all(
        batches.map(async (batch) => {
          const params = new URLSearchParams();
          batch.forEach(id => params.append('i', id));

          try {
            const res = await fetch(`https://api.kite.trade/quote?${params.toString()}`, {
              headers: {
                'X-Kite-Version': '3',
                'Authorization': `token ${apiKey}:${accessToken}`,
              },
              cache: 'no-store',
            });

            if (res.ok) {
              const json = await res.json();
              return json.data || {};
            }
          } catch (err) {
            console.error('[Search Quotes Fallback] error:', err);
          }
          return {};
        })
      );

      const instrumentUpserts: any[] = [];

      for (const resData of results) {
        for (const [id, quote] of Object.entries(resData)) {
          if (!quote) continue;
          const ltp = (quote as any).last_price ?? 0;
          priceMap[id] = ltp;

          const parts = id.split(':');
          const exchange = parts[0] || 'NSE';
          const tradingsymbol = parts[1] || '';

          instrumentUpserts.push({
            id,
            instrument_token: (quote as any).instrument_token || 0,
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
            await supabase.from('instruments').upsert(instrumentUpserts, { onConflict: 'id' });
          } catch (err) {
            console.error('[fetchLivePrices] Background cache error:', err);
          }
        })();
      }
    }

    return priceMap;
  } catch (err) {
    console.error('[fetchLivePrices] Unexpected error:', err);
    return priceMap;
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
      const today = new Date().toISOString().split('T')[0];

      let dbQuery = supabase
        .from('instruments')
        .select('tradingsymbol, name, exchange, instrument_type, segment, strike_price, option_type, expiry, underlying_symbol')
        .eq('underlying_symbol', parsed.underlying)
        .eq('strike_price', parsed.strike)
        .or(`expiry.gte.${today},expiry.is.null`)
        .order('expiry', { ascending: true })
        .limit(150);

      if (parsed.optionType) {
        dbQuery = dbQuery.eq('option_type', parsed.optionType);
      }

      ({ data, error } = await dbQuery);
    }

    // Fallback: tradingsymbol ilike (spaces removed)
    if (!data || data.length === 0) {
      const qNoSpace = q.replace(/\s+/g, '').toUpperCase();
      const today = new Date().toISOString().split('T')[0];
      ({ data, error } = await supabase
        .from('instruments')
        .select('tradingsymbol, name, exchange, instrument_type, segment, strike_price, option_type, expiry, underlying_symbol')
        .or(`tradingsymbol.ilike.%${qNoSpace}%,tradingsymbol.ilike.%${q}%,name.ilike.%${q}%`)
        .or(`expiry.gte.${today},expiry.is.null`)
        .order('expiry', { ascending: true })
        .limit(150));
    }

    if (error) {
      console.error('[GET /api/market/instruments/search] Error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    let rows: any[] = data ?? [];

    // Filter rows to ensure they actually match the search terms in a meaningful way.
    // This avoids matching "25" to all 2025 options because of "25" in their internal Zerodha tradingsymbol (e.g. NIFTY2532822300PE).
    const searchTerms = q.toLowerCase().split(/\s+/);
    rows = rows.filter((r: any) => {
      const dispName = buildDisplayName(
        r.tradingsymbol,
        r.underlying_symbol || r.name || r.tradingsymbol,
        r.strike_price ?? null,
        r.option_type ?? null,
        null
      ).toLowerCase();
      const symbol = r.tradingsymbol.toLowerCase();
      const name = (r.name || '').toLowerCase();

      return searchTerms.every(term => {
        // If the term is numeric and it's an option instrument with a strike price, it should match the strike price
        if (/^\d+$/.test(term) && r.strike_price !== null) {
          return String(r.strike_price).includes(term);
        }
        return dispName.includes(term) || name.includes(term) || symbol.includes(term);
      });
    });

    // Apply Filter Engine rules server-side before returning results
    const today = new Date().toISOString().split('T')[0];

    // Split by segment type, filter, then reassemble
    const forexRows = rows.filter((r: any) => r.exchange === 'CDS' || r.segment === 'CDS');
    const cryptoRows = rows.filter((r: any) => r.segment === 'CRYPTO');
    const optionRows = rows.filter((r: any) =>
      !['CDS', 'CRYPTO'].includes(r.exchange) &&
      r.segment !== 'CDS' && r.segment !== 'CRYPTO' &&
      (r.option_type === 'CE' || r.option_type === 'PE')
    );
    const otherRows = rows.filter((r: any) =>
      r.exchange !== 'CDS' && r.segment !== 'CDS' &&
      r.segment !== 'CRYPTO' &&
      r.option_type !== 'CE' && r.option_type !== 'PE'
    );

    // 1. Forex: keep only futures (exclude CE/PE)
    const filteredForex = applyForexFilter(forexRows as Instrument[]);

    // 2. Crypto: keep only whitelist (BTC, ETH, DOGE)
    const filteredCrypto = applyCryptoWhitelist(cryptoRows as Instrument[]);

    // 3. Options: keep only current (nearest active) expiry
    let filteredOptions = optionRows as Instrument[];
    if (filteredOptions.length > 0) {
      const expiries = [...new Set(filteredOptions.map((r: any) => r.expiry).filter(Boolean))] as string[];
      const activeExpiries = applyExpiryFilter(expiries, today);
      if (activeExpiries.length > 0) {
        const activeSet = new Set(activeExpiries);
        filteredOptions = filteredOptions.filter((r: any) => !r.expiry || activeSet.has(r.expiry));
      }
    }

    rows = [...filteredForex, ...filteredCrypto, ...filteredOptions, ...otherRows];

    // Fetch live prices for all results
    const kiteIds = rows.map((inst: any) => `${inst.exchange}:${inst.tradingsymbol}`);
    const priceMap = await fetchLivePrices(kiteIds, request);

    // Map to watchlist-compatible shape
    const results = rows.map((inst: any) => {
      let segmentLabel = '';
      if (inst.instrument_type === 'OPTSTK') {
        segmentLabel = `${inst.exchange} - Stock Options`;
      } else if (inst.instrument_type === 'OPTIDX' || inst.instrument_type === 'CE' || inst.instrument_type === 'PE') {
        segmentLabel = `${inst.exchange} - Options`;
      } else if (inst.instrument_type === 'FUTSTK') {
        segmentLabel = `${inst.exchange} - Stock Futures`;
      } else if (['FUT', 'MAPPED_FUT', 'FUTIDX', 'FUTCOM', 'FUTCUR'].includes(inst.instrument_type)) {
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

    // Helper function to map UI display segment to DB key segment
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

    // Enforce allowed segments if user is authenticated
    const authHeader = request.headers.get('Authorization');
    let allowedSegments: string[] = [];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      if (token) {
        const { data: userData } = await supabase.auth.getUser(token);
        if (userData?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('segments')
            .eq('id', userData.user.id)
            .single();
          if (profile?.segments && profile.segments.length > 0) {
            allowedSegments = profile.segments;
          }
        }
      }
    }

    let filteredResults = results;
    if (allowedSegments.length > 0) {
      const allowedUpper = allowedSegments.map(s => s.toUpperCase());
      filteredResults = results.filter((item: any) => {
        const dbSeg = mapSegmentToDbSegment(item.segment);
        return allowedUpper.includes(dbSeg.toUpperCase());
      });
    }

    return NextResponse.json(filteredResults);
  } catch (err: any) {
    console.error('[GET /api/market/instruments/search] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
