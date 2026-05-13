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

async function getFallbackQuotes(instruments: string[]) {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from('market_quotes')
      .select('*')
      .in('id', instruments);
        
    if (error || !data) return null;
    
    const mappedData: Record<string, any> = {};
    for (const row of data) {
      mappedData[row.id] = {
        timestamp: row.quote_timestamp,
        last_price: Number(row.last_price),
        volume: Number(row.volume),
        ohlc: {
          open: Number(row.open),
          high: Number(row.high),
          low: Number(row.low),
          close: Number(row.close),
        },
        net_change: Number(row.last_price) - Number(row.close),
      };
    }
    return { data: mappedData };
  } catch (err) {
    return null;
  }
}

async function fetchKiteQuotesBatch(
  kiteRequestInstruments: string[],
  apiKey: string,
  accessToken: string,
): Promise<{ data: Record<string, any>; tokenExpired: boolean }> {
  const allKiteData: Record<string, any> = {};
  let tokenExpired = false;

  const params = new URLSearchParams();
  kiteRequestInstruments.forEach(inst => params.append('i', inst));

  try {
    const response = await fetch(`https://api.kite.trade/quote?${params.toString()}`, {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
      },
      cache: 'no-store',
    });

    if (response.status === 403 || response.status === 401) {
      tokenExpired = true;
    } else if (response.ok) {
      const json = await response.json();
      if (json.data) Object.assign(allKiteData, json.data);
    }
  } catch (err) {
    console.error('[Kite Quotes] Fetch error:', err);
  }

  return { data: allKiteData, tokenExpired };
}

async function handleQuotesRequest(instruments: string[], request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey || instruments.length === 0) {
    return NextResponse.json({ data: {} });
  }

  // Get token
  let accessToken = request.cookies.get('kite_access_token')?.value;
  if (!accessToken) {
    const sharedSession = await getSharedKiteSession();
    accessToken = sharedSession?.accessToken;
  }

  if (!accessToken) {
    const fallback = await getFallbackQuotes(instruments);
    return NextResponse.json(fallback || { data: {} });
  }

  try {
    const realToRequestedMap: Record<string, string> = {};
    const kiteRequestInstruments: string[] = [];
    const dbRequestIds: string[] = [];

    // Separate direct IDs (with colon) from DB IDs (no colon)
    for (const id of instruments) {
      if (id.includes(':')) {
        kiteRequestInstruments.push(id);
        realToRequestedMap[id] = id;
      } else {
        dbRequestIds.push(id);
      }
    }

    // Resolve DB IDs to Kite IDs if needed
    if (dbRequestIds.length > 0) {
      const admin = getAdminClient();
      const { data } = await admin
        .from('instruments')
        .select('id, tradingsymbol, exchange')
        .in('id', dbRequestIds);

      if (data) {
        for (const row of data) {
          const kiteId = `${row.exchange}:${row.tradingsymbol}`;
          realToRequestedMap[kiteId] = row.id;
          kiteRequestInstruments.push(kiteId);
        }
      }
      
      // Add missing ones as-is just in case
      for (const id of dbRequestIds) {
        if (!Object.values(realToRequestedMap).includes(id)) {
          realToRequestedMap[id] = id;
          kiteRequestInstruments.push(id);
        }
      }
    }

    // Fetch from Kite
    let { data: allKiteData, tokenExpired } = await fetchKiteQuotesBatch(
      kiteRequestInstruments, apiKey, accessToken
    );

    // If expired, try shared session as fallback
    if (tokenExpired) {
      const freshSession = await getSharedKiteSession();
      if (freshSession && freshSession.accessToken !== accessToken) {
        const retry = await fetchKiteQuotesBatch(kiteRequestInstruments, apiKey, freshSession.accessToken);
        allKiteData = retry.data;
      }
    }

    // Map back to requested IDs
    const finalMappedData: Record<string, any> = {};
    for (const [kiteId, quote] of Object.entries(allKiteData)) {
      const reqId = realToRequestedMap[kiteId];
      if (reqId) finalMappedData[reqId] = quote;
    }

    // Fallback if no data
    if (Object.keys(finalMappedData).length === 0) {
      const fallback = await getFallbackQuotes(instruments);
      if (fallback) return NextResponse.json(fallback);
    }

    return NextResponse.json({ data: finalMappedData });
  } catch (err) {
    const fallback = await getFallbackQuotes(instruments);
    return NextResponse.json(fallback || { data: {} });
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
