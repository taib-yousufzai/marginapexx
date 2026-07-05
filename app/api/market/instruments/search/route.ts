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
const UNDERLYINGS = ['MIDCPNIFTY', 'BANKNIFTY', 'FINNIFTY', 'NIFTY', 'SENSEX', 'BANKEX', 'CRUDEOILM', 'CRUDEOIL', 'NATGASMINI', 'NATURALGAS', 'SILVERM', 'SILVER', 'GOLDM', 'GOLD'];

/**
 * Try to parse a query like "nifty 24040" or "banknifty 48500 ce"
 * into { underlying, strike, optionType }
 */
function parseOptionQuery(q: string): { underlying: string; strike: number; optionType?: string } | null {
  const upper = q.toUpperCase().trim();

  // Smart guesser for pure numeric queries like "23600" or "48500 ce"
  const numOnlyMatch = upper.match(/^(\d+(?:\.\d+)?)\s*(CE|PE)?$/);
  if (numOnlyMatch) {
    const num = parseFloat(numOnlyMatch[1]);
    const optType = numOnlyMatch[2];

    let guessed = '';
    // Nifty is around 21k - 27k
    if (num >= 20000 && num <= 27000) guessed = 'NIFTY';
    // BankNifty is around 40k - 60k
    else if (num >= 40000 && num <= 60000) guessed = 'BANKNIFTY';
    // Sensex is around 70k - 90k
    else if (num >= 70000 && num <= 90000) guessed = 'SENSEX';
    // Midcap Nifty is around 9k - 15k
    else if (num >= 9000 && num <= 15000) guessed = 'MIDCPNIFTY';

    if (guessed) {
      return {
        underlying: guessed,
        strike: num,
        optionType: optType || undefined,
      };
    }
  }

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
    const tab = searchParams.get('tab') || 'All';

    if (q.length < 1) {
      return NextResponse.json([]);
    }

    let data: any[] | null = null;
    let error: any = null;

    // Smart parse: "nifty 24040" → underlying + strike query
    const parsed = parseOptionQuery(q);

    const applyTabFilter = (query: any) => {
      if (tab === 'All') return query;
      if (tab.includes('-OPT')) return query.not('option_type', 'is', null);
      if (tab.includes('-FUT')) return query.is('option_type', null).in('instrument_type', ['FUTIDX', 'FUTSTK', 'FUT', 'MAPPED_FUT', 'FUTCOM', 'FUTCUR']);
      if (tab === 'NSE-EQ') return query.eq('instrument_type', 'EQ');
      if (tab === 'CRYPTO') return query.eq('segment', 'CRYPTO');
      if (tab === 'FOREX') return query.eq('exchange', 'CDS');
      if (tab === 'COMEX') return query.eq('segment', 'COMEX');
      return query;
    };

    if (parsed) {
      const today = new Date().toISOString().split('T')[0];

      let dbQuery = supabase
        .from('instruments')
        .select('tradingsymbol, name, exchange, instrument_type, segment, strike_price, option_type, expiry, underlying_symbol')
        .eq('name', parsed.underlying)
        .eq('strike_price', parsed.strike)
        .or(`expiry.gte.${today},expiry.is.null`)
        .order('expiry', { ascending: true })
        .limit(150);

      if (parsed.optionType) {
        dbQuery = dbQuery.eq('option_type', parsed.optionType);
      }

      dbQuery = applyTabFilter(dbQuery);

      ({ data, error } = await dbQuery);
    }

    // Fallback: tradingsymbol ilike (spaces removed)
    if (!data || data.length === 0) {
      const qNoSpace = q.replace(/\s+/g, '').toUpperCase();
      const today = new Date().toISOString().split('T')[0];

      let dbQuery = supabase
        .from('instruments')
        .select('tradingsymbol, name, exchange, instrument_type, segment, strike_price, option_type, expiry, underlying_symbol');
        
      if (/^\d+(\.\d+)?$/.test(q)) {
        dbQuery = dbQuery.or(`tradingsymbol.ilike.${qNoSpace}%,name.ilike.${q}%,strike_price.eq.${q}`);
      } else {
        dbQuery = dbQuery.or(`tradingsymbol.ilike.${qNoSpace}%,name.ilike.${q}%`);
      }

      dbQuery = dbQuery
        .or(`expiry.gte.${today},expiry.is.null`)
        .order('expiry', { ascending: true })
        .limit(150);

      dbQuery = applyTabFilter(dbQuery);

      ({ data, error } = await dbQuery);
    }

    if (error) {
      console.error('[GET /api/market/instruments/search] Error:', error);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }

    let rows: any[] = data ?? [];

    // Filter rows to ensure they actually match the search terms in a meaningful way.
    // This avoids matching "25" to all 2025 options because of "25" in their internal Zerodha tradingsymbol (e.g. NIFTY2532822300PE).
    let searchTerms = q.toLowerCase().split(/\s+/);
    if (parsed) {
      // Re-construct the search terms based on the parse to ensure correct filtering
      // e.g. "banknifty55400ce" -> ["banknifty", "55400", "ce"]
      const newQ = `${parsed.underlying} ${parsed.strike} ${parsed.optionType || ''}`.toLowerCase().trim();
      searchTerms = newQ.split(/\s+/);
    }

    function wordStartMatch(text: string, term: string): boolean {
      if (!text) return false;
      const t = text.toLowerCase();
      if (t.startsWith(term)) return true;
      const words = t.split(/[\s\-_\/]/);
      return words.some(w => w.startsWith(term));
    }

    rows = rows.filter((r: any) => {
      const dispName = buildDisplayName(
        r.tradingsymbol,
        r.underlying_symbol || r.name || r.tradingsymbol,
        r.strike_price ?? null,
        r.option_type ?? null,
        null
      ).toLowerCase();
      const symbol = (r.tradingsymbol || '').toLowerCase();
      const name = (r.name || '').toLowerCase();

      return searchTerms.every(term => {
        // If the term is numeric and it's an option instrument with a strike price, it should match the strike price
        if (/^\d+$/.test(term) && r.strike_price !== null) {
          return String(r.strike_price).startsWith(term);
        }
        return wordStartMatch(dispName, term) || wordStartMatch(name, term) || wordStartMatch(symbol, term);
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

    // Prioritize EQ and exact matches in otherRows
    otherRows.sort((a: any, b: any) => {
      const qLower = q.toLowerCase();
      const aSym = (a.tradingsymbol || '').toLowerCase();
      const bSym = (b.tradingsymbol || '').toLowerCase();
      if (aSym === qLower && bSym !== qLower) return -1;
      if (bSym === qLower && aSym !== qLower) return 1;
      if (a.instrument_type === 'EQ' && b.instrument_type !== 'EQ') return -1;
      if (b.instrument_type === 'EQ' && a.instrument_type !== 'EQ') return 1;
      return 0;
    });

    rows = [...otherRows, ...filteredCrypto, ...filteredForex, ...filteredOptions];

    // Fetch live prices for all results
    const kiteIds = rows.map((inst: any) => `${inst.exchange}:${inst.tradingsymbol}`);
    const priceMap = await fetchLivePrices(kiteIds, request);

    // Map to watchlist-compatible shape
    const results = rows.map((inst: any) => {
      let segmentLabel = '';
      const exch = inst.exchange === 'NFO' ? 'NSE' : inst.exchange === 'BFO' ? 'BSE' : inst.exchange;
      const isIndex = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'].includes(inst.name);
      const type = inst.instrument_type;

      if (type === 'OPTSTK' || (!isIndex && (type === 'CE' || type === 'PE' || type === 'OPT'))) {
        segmentLabel = `${exch} - Stock Options`;
      } else if (type === 'OPTIDX' || (isIndex && (type === 'CE' || type === 'PE' || type === 'OPT'))) {
        segmentLabel = `${exch} - Options`;
      } else if (type === 'FUTSTK' || (!isIndex && ['FUT', 'MAPPED_FUT'].includes(type) && ['NSE', 'BSE'].includes(exch))) {
        segmentLabel = `${exch} - Stock Futures`;
      } else if (['FUT', 'MAPPED_FUT', 'FUTIDX', 'FUTCOM', 'FUTCUR'].includes(type)) {
        segmentLabel = `${exch} - Futures`;
      } else if (type === 'EQ') {
        segmentLabel = `${exch} - Equity`;
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

    return NextResponse.json(results);
  } catch (err: any) {
    console.error('[GET /api/market/instruments/search] Unexpected error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
