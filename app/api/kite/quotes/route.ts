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
    const batchSize = 100;
    const allRows: any[] = [];

    for (let i = 0; i < instruments.length; i += batchSize) {
      const chunk = instruments.slice(i, i + batchSize);
      const { data, error } = await admin
        .from('market_quotes')
        .select('*')
        .in('id', chunk);
        
      if (error) {
        console.error(`Error fetching fallback quotes batch (${i}-${i + batchSize}):`, error);
        continue;
      }
      if (data) allRows.push(...data);
    }
    
    if (allRows.length === 0) return null;
    
    const mappedData: Record<string, Partial<KiteQuote>> = {};
    for (const row of allRows) {
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

async function handleQuotesRequest(instruments: string[], request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Kite API not configured' }, { status: 500 });
  }

  let accessToken = request.cookies.get('kite_access_token')?.value;
  if (!accessToken) {
    const sharedSession = await getSharedKiteSession();
    if (sharedSession) accessToken = sharedSession.accessToken;
  }

  if (instruments.length === 0) {
    return NextResponse.json({ error: 'No instruments specified' }, { status: 400 });
  }

  if (!accessToken) {
    console.log('[Kite Quotes] No access token, falling back to database...');
    const fallback = await getFallbackQuotes(instruments);
    if (fallback) return NextResponse.json(fallback);
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // 1. Batch fetch mappings from DB (Supabase .in filter has URL length limits)
    const admin = getAdminClient();
    const mappedRecords: any[] = [];
    const dbBatchSize = 100;

    for (let i = 0; i < instruments.length; i += dbBatchSize) {
      const chunk = instruments.slice(i, i + dbBatchSize);
      const { data, error } = await admin
        .from('instruments')
        .select('id, tradingsymbol, exchange')
        .in('id', chunk);
      
      if (error) {
        console.error(`[Kite Quotes] DB mapping error batch ${i}:`, error);
        continue;
      }
      if (data) mappedRecords.push(...data);
    }

    // 2. Build the exact instrument keys required by Kite Connect
    const realToRequestedMap: Record<string, string> = {};
    const kiteRequestInstruments: string[] = [];

    for (const reqId of instruments) {
       const mapped = mappedRecords.find(m => m.id === reqId);
       if (mapped && mapped.exchange) {
           const kiteId = `${mapped.exchange}:${mapped.tradingsymbol}`;
           realToRequestedMap[kiteId] = reqId;
           kiteRequestInstruments.push(kiteId);
       } else {
           realToRequestedMap[reqId] = reqId;
           kiteRequestInstruments.push(reqId);
       }
    }

    // 3. Request from Kite in batches (Kite limit is usually ~500 per call, we use 200 for safety)
    const kiteBatchSize = 200;
    const allKiteData: Record<string, KiteQuote> = {};
    
    for (let i = 0; i < kiteRequestInstruments.length; i += kiteBatchSize) {
      const chunk = kiteRequestInstruments.slice(i, i + kiteBatchSize);
      const params = new URLSearchParams();
      chunk.forEach(inst => params.append('i', inst));

      const response = await fetch(`https://api.kite.trade/quote?${params.toString()}`, {
        headers: {
          'X-Kite-Version': '3',
          'Authorization': `token ${apiKey}:${accessToken}`,
        },
        cache: 'no-store',
      });

      if (!response.ok) {
        console.error(`[Kite Quotes] Kite API batch error (${response.status}) at index ${i}`);
        continue;
      }

      const json = await response.json();
      if (json.data) {
        Object.assign(allKiteData, json.data);
      }
    }

    // 4. Map the true Kite response keys back to the requested generic names
    const finalMappedData: Record<string, KiteQuote> = {};
    for (const [kiteId, quote] of Object.entries(allKiteData)) {
       const reqId = realToRequestedMap[kiteId];
       if (reqId) finalMappedData[reqId] = quote;
    }
    
    // If we got NO data from Kite, try fallback for everything
    if (Object.keys(finalMappedData).length === 0) {
      const fallback = await getFallbackQuotes(instruments);
      if (fallback) return NextResponse.json(fallback);
    }

    return NextResponse.json({ data: finalMappedData });
  } catch (err) {
    console.error('Kite quotes fetch error:', err);
    const fallback = await getFallbackQuotes(instruments);
    if (fallback) return NextResponse.json(fallback);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    const instruments = body.instruments || [];
    return handleQuotesRequest(instruments, request);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
}
