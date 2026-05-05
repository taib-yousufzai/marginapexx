/**
 * Kite Quotes API
 * GET /api/kite/quotes?instruments=NSE:NIFTY+50,NSE:RELIANCE,...
 *
 * Proxies Kite Connect's quote API server-side so the access_token
 * (stored in an HTTP-only cookie) is never exposed to the browser.
 *
 * Returns: { data: Record<string, KiteQuote> }
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
  oi_day_high: number;
  oi_day_low: number;
  lower_circuit_limit: number;
  upper_circuit_limit: number;
  depth: {
    buy: { price: number; quantity: number; orders: number }[];
    sell: { price: number; quantity: number; orders: number }[];
  };
}

async function getFallbackQuotes(instruments: string[]) {
  try {
    const admin = getAdminClient();
    const { data, error } = await admin
      .from('market_quotes')
      .select('*')
      .in('id', instruments);
      
    if (error) {
      console.error('Error fetching fallback quotes:', error);
      return null;
    }
    
    if (!data || data.length === 0) return null;
    
    const mappedData: Record<string, Partial<KiteQuote>> = {};
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
    console.error('Fallback query failed:', err);
    return null;
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Kite API not configured' }, { status: 500 });
  }

  // Read access token from HTTP-only cookie
  let accessToken = request.cookies.get('kite_access_token')?.value;
  
  if (!accessToken) {
    console.log('[Kite Quotes] No cookie found, checking shared session...');
    const sharedSession = await getSharedKiteSession();
    if (sharedSession) {
      accessToken = sharedSession.accessToken;
    }
  }

  // Get instruments from query string, e.g. ?instruments=NSE:NIFTY+50&instruments=BSE:SENSEX
  const { searchParams } = request.nextUrl;
  const instruments = searchParams.getAll('instruments');

  if (instruments.length === 0) {
    return NextResponse.json({ error: 'No instruments specified' }, { status: 400 });
  }

  if (!accessToken) {
    console.log('[Kite Quotes] No access token, falling back to database...');
    const fallback = await getFallbackQuotes(instruments);
    if (fallback) {
      return NextResponse.json(fallback);
    }
    return NextResponse.json({ error: 'Not authenticated with Kite' }, { status: 401 });
  }

  try {
    // 1. Fetch any mappings from our database for the requested generic instruments
    const admin = getAdminClient();
    const { data: mappings } = await admin
      .from('instruments')
      .select('id, tradingsymbol, exchange')
      .in('id', instruments);
      
    // 2. Build the exact instrument keys required by Kite Connect
    const realToRequestedMap: Record<string, string> = {};
    const kiteRequestInstruments: string[] = [];

    const mappedRecords = mappings || [];
    
    for (const reqId of instruments) {
       const mapped = mappedRecords.find(m => m.id === reqId);
       if (mapped && mapped.exchange) {
           // For mapped pseudo-instruments, ask Kite for the true expiring symbol
           const kiteId = `${mapped.exchange}:${mapped.tradingsymbol}`;
           realToRequestedMap[kiteId] = reqId;
           kiteRequestInstruments.push(kiteId);
       } else {
           // Standard instrument, ask Kite directly
           realToRequestedMap[reqId] = reqId;
           kiteRequestInstruments.push(reqId);
       }
    }

    // 3. Build query string with the EXACT kite strings
    const params = new URLSearchParams();
    kiteRequestInstruments.forEach(inst => params.append('i', inst));

    const response = await fetch(`https://api.kite.trade/quote?${params.toString()}`, {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${apiKey}:${accessToken}`,
      },
      // Don't cache — we want fresh prices
      cache: 'no-store',
    });

    if (!response.ok) {
      const body = await response.text();
      console.error('Kite quote API error:', response.status, body);

      console.log('[Kite Quotes] API failed, falling back to database...');
      const fallback = await getFallbackQuotes(kiteRequestInstruments);
      if (fallback && fallback.data) {
        // Map fallback keys back to requested generic names
        const mappedFallback: Record<string, KiteQuote> = {};
        for (const [kiteId, quote] of Object.entries(fallback.data)) {
           const reqId = realToRequestedMap[kiteId];
           if (reqId && quote) {
              mappedFallback[reqId] = quote as KiteQuote;
           }
        }
        return NextResponse.json({ data: mappedFallback });
      }

      if (response.status === 403) {
        return NextResponse.json({ error: 'Kite session expired. Please reconnect.' }, { status: 403 });
      }

      return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: response.status });
    }

    const data = await response.json() as { data: Record<string, KiteQuote> };
    
    // 4. Map the true Kite response keys back to the requested generic names
    const mappedResponseData: Record<string, KiteQuote> = {};
    for (const [kiteId, quote] of Object.entries(data.data || {})) {
       const reqId = realToRequestedMap[kiteId];
       if (reqId) {
          mappedResponseData[reqId] = quote;
       }
    }
    
    data.data = mappedResponseData;
    return NextResponse.json(data);
  } catch (err) {
    console.error('Kite quotes fetch error:', err);
    console.log('[Kite Quotes] Fetch exception, falling back to database...');
    const fallback = await getFallbackQuotes(instruments);
    if (fallback) {
      return NextResponse.json(fallback);
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
