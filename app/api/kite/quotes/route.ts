/**
 * Kite Quotes API
 * GET /api/kite/quotes?instruments=NSE:NIFTY+50,NSE:RELIANCE,...
 * 
 * Optimized version:
 * 1. Bypasses DB lookup for instruments already in "EXCHANGE:SYMBOL" format.
 * 2. Fetches from Kite in batches.
 * 3. Falls back to stored market_quotes if Kite fails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSharedKiteSession } from '@/lib/kiteSession';
import { getAdminClient } from '@/lib/adminClient';

export interface KiteQuote {
  instrument_token: number;
  timestamp: string;
  last_price: number;
  last_quantity: number;
  average_price: number;
  volume: number;
  buy_quantity: number;
  sell_quantity: number;
  ohlc: {
    open: number;
    high: number;
    low: number;
    close: number;
  };
  net_change: number;
  oi: number;
}

async function fetchKiteQuotesBatch(
  kiteRequestInstruments: string[],
  apiKey: string,
  accessToken: string,
): Promise<{ data: Record<string, any>; tokenExpired: boolean }> {
  const allKiteData: Record<string, any> = {};
  let tokenExpired = false;

  const batchSize = 100;
  const batches: string[][] = [];
  for (let i = 0; i < kiteRequestInstruments.length; i += batchSize) {
    batches.push(kiteRequestInstruments.slice(i, i + batchSize));
  }

  const results = await Promise.all(
    batches.map(async (batch) => {
      const params = new URLSearchParams();
      batch.forEach(inst => params.append('i', inst));

      try {
        const response = await fetch(`https://api.kite.trade/quote?${params.toString()}`, {
          headers: {
            'X-Kite-Version': '3',
            'Authorization': `token ${apiKey}:${accessToken}`,
          },
          cache: 'no-store',
        });

        if (response.status === 403 || response.status === 401) {
          return { data: null, expired: true };
        } else if (response.ok) {
          const json = await response.json();
          return { data: json.data || {}, expired: false };
        }
      } catch (err) {
        console.error('[Kite Quotes] Batch fetch error:', err);
      }
      return { data: {}, expired: false };
    })
  );

  for (const res of results) {
    if (res.expired) tokenExpired = true;
    if (res.data) Object.assign(allKiteData, res.data);
  }

  return { data: allKiteData, tokenExpired };
}

async function handleQuotesRequest(instruments: string[], request: NextRequest): Promise<NextResponse> {
  if (instruments.length === 0) {
    return NextResponse.json({ data: {} });
  }

  try {
    const admin = getAdminClient();
    const realToRequestedMap: Record<string, string> = {};
    const directKiteIds: string[] = [];
    const dbRequestIds: string[] = [];

    // Separate direct IDs (with colon e.g. NSE:RELIANCE) from DB ID numbers
    for (const id of instruments) {
      if (id.includes(':')) {
        directKiteIds.push(id);
        realToRequestedMap[id] = id;
      } else {
        dbRequestIds.push(id);
      }
    }

    // Resolve internal DB IDs to Kite IDs
    if (dbRequestIds.length > 0) {
      const { data } = await admin
        .from('instruments')
        .select('id, tradingsymbol, exchange')
        .in('id', dbRequestIds);

      if (data) {
        for (const row of data) {
          const kiteId = `${row.exchange}:${row.tradingsymbol}`;
          realToRequestedMap[kiteId] = row.id;
          directKiteIds.push(kiteId);
        }
      }
      
      // Keep unresolved ones as-is as fallback
      for (const id of dbRequestIds) {
        if (!Object.values(realToRequestedMap).includes(id)) {
          realToRequestedMap[id] = id;
          directKiteIds.push(id);
        }
      }
    }

    // 1. Fetch from database market_quotes table (populated in real-time by WebSockets Ticker Daemon)
    const { data: dbQuotes, error: dbError } = await admin
      .from('market_quotes')
      .select('*')
      .in('id', directKiteIds);

    const finalMappedData: Record<string, any> = {};
    const foundKiteIds = new Set<string>();

    if (!dbError && dbQuotes) {
      for (const row of dbQuotes) {
        const reqId = realToRequestedMap[row.id];
        if (!reqId) continue;

        foundKiteIds.add(row.id);
        finalMappedData[reqId] = {
          timestamp: row.quote_timestamp,
          last_price: Number(row.last_price),
          volume: Number(row.volume || 0),
          ohlc: {
            open: Number(row.open || 0),
            high: Number(row.high || 0),
            low: Number(row.low || 0),
            close: Number(row.close || 0),
          },
          net_change: Number(row.last_price) - Number(row.close || 0),
        };
      }
    }

    // 2. Find missing instruments that aren't in the database cache yet
    const missingKiteIds = directKiteIds.filter(id => !foundKiteIds.has(id));

    // 3. Fallback: Fetch missing instruments from Kite REST API on-demand
    if (missingKiteIds.length > 0) {
      let accessToken = request.cookies.get('kite_access_token')?.value;
      if (!accessToken) {
        const sharedSession = await getSharedKiteSession();
        accessToken = sharedSession?.accessToken;
      }
      const apiKey = process.env.KITE_API_KEY;

      if (accessToken && apiKey) {
        const { data: kiteData, tokenExpired } = await fetchKiteQuotesBatch(missingKiteIds, apiKey, accessToken);
        
        let activeKiteData = kiteData;
        if (tokenExpired) {
          const freshSession = await getSharedKiteSession();
          if (freshSession && freshSession.accessToken !== accessToken) {
            const retry = await fetchKiteQuotesBatch(missingKiteIds, apiKey, freshSession.accessToken);
            activeKiteData = retry.data;
          }
        }

        if (activeKiteData && Object.keys(activeKiteData).length > 0) {
          const instrumentUpserts: any[] = [];
          const dbUpserts: any[] = [];

          for (const [kiteId, quote] of Object.entries(activeKiteData)) {
            const reqId = realToRequestedMap[kiteId];
            if (!reqId || !quote) continue;

            const closePrice = quote.ohlc?.close || 0;
            const netChange = quote.net_change ?? (quote.last_price - closePrice);

            finalMappedData[reqId] = {
              timestamp: quote.timestamp,
              last_price: quote.last_price,
              volume: quote.volume || 0,
              ohlc: {
                open: quote.ohlc?.open || 0,
                high: quote.ohlc?.high || 0,
                low: quote.ohlc?.low || 0,
                close: closePrice,
              },
              net_change: netChange,
            };

            const parts = kiteId.split(':');
            const exchange = parts[0] || 'NSE';
            const tradingsymbol = parts[1] || '';

            instrumentUpserts.push({
              id: kiteId,
              instrument_token: quote.instrument_token || 0,
              tradingsymbol: tradingsymbol,
              exchange: exchange,
              instrument_type: exchange === 'NFO' || exchange === 'MCX' || exchange === 'CDS' ? 'FUTOPT' : 'EQ',
              segment: exchange,
              updated_at: new Date().toISOString()
            });

            dbUpserts.push({
              id: kiteId,
              last_price: quote.last_price,
              open: quote.ohlc?.open || 0,
              high: quote.ohlc?.high || 0,
              low: quote.ohlc?.low || 0,
              close: closePrice,
              volume: quote.volume || 0,
              quote_timestamp: quote.timestamp || new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }

          // Cache on-demand fetched instruments and quotes in background
          if (instrumentUpserts.length > 0) {
            (async () => {
              try {
                // Upsert instruments first to satisfy foreign key
                const { error: instErr } = await admin
                  .from('instruments')
                  .upsert(instrumentUpserts, { onConflict: 'id' });

                if (instErr) {
                  console.error('[Quotes API] Background instruments upsert error:', instErr);
                  return;
                }

                // Now upsert quotes
                const { error: quoteErr } = await admin
                  .from('market_quotes')
                  .upsert(dbUpserts, { onConflict: 'id' });

                if (quoteErr) {
                  console.error('[Quotes API] Background cache upsert error:', quoteErr);
                }
              } catch (err) {
                console.error('[Quotes API] Background cache sync error:', err);
              }
            })();
          }
        }
      }
    }

    return NextResponse.json({ data: finalMappedData });
  } catch (err) {
    console.error('[Quotes API] Error:', err);
    return NextResponse.json({ data: {} });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const instruments = searchParams.getAll('instruments');
  return handleQuotesRequest(instruments, request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    return handleQuotesRequest(body.instruments || [], request);
  } catch {
    return NextResponse.json({ data: {} });
  }
}
