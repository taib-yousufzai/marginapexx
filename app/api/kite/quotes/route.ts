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

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated with Kite' }, { status: 401 });
  }

  // Get instruments from query string, e.g. ?instruments=NSE:NIFTY+50&instruments=BSE:SENSEX
  const { searchParams } = request.nextUrl;
  const instruments = searchParams.getAll('instruments');

  if (instruments.length === 0) {
    return NextResponse.json({ error: 'No instruments specified' }, { status: 400 });
  }

  try {
    // Build query string — Kite accepts repeated i= params
    const params = new URLSearchParams();
    instruments.forEach(inst => params.append('i', inst));

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

      if (response.status === 403) {
        return NextResponse.json({ error: 'Kite session expired. Please reconnect.' }, { status: 403 });
      }

      return NextResponse.json({ error: 'Failed to fetch quotes' }, { status: response.status });
    }

    const data = await response.json() as { data: Record<string, KiteQuote> };
    return NextResponse.json(data);
  } catch (err) {
    console.error('Kite quotes fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
