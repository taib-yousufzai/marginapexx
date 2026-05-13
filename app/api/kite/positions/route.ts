/**
 * Kite Positions API
 * GET /api/kite/positions
 *
 * Proxies Kite Connect's /portfolio/positions endpoint server-side so the
 * access_token (stored in an HTTP-only cookie) is never exposed to the browser.
 *
 * Returns: { net: KitePosition[], day: KitePosition[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSharedKiteSession } from '@/lib/kiteSession';

export interface KitePosition {
  tradingsymbol: string;
  exchange: string;
  instrument_token: number;
  product: string;
  quantity: number;
  overnight_quantity: number;
  multiplier: number;
  average_price: number;
  close_price: number;
  last_price: number;
  value: number;
  pnl: number;
  m2m: number;
  unrealised: number;
  realised: number;
  buy_quantity: number;
  buy_price: number;
  buy_value: number;
  sell_quantity: number;
  sell_price: number;
  sell_value: number;
  day_buy_quantity: number;
  day_buy_price: number;
  day_buy_value: number;
  day_sell_quantity: number;
  day_sell_price: number;
  day_sell_value: number;
}

async function doFetchPositions(apiKey: string, accessToken: string) {
  return fetch('https://api.kite.trade/portfolio/positions', {
    headers: {
      'X-Kite-Version': '3',
      Authorization: `token ${apiKey}:${accessToken}`,
    },
    cache: 'no-store',
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Kite API not configured' }, { status: 500 });
  }

  // Resolve token: cookie first, then shared DB session
  let accessToken = request.cookies.get('kite_access_token')?.value;
  const tokenSource = accessToken ? 'cookie' : 'db';

  if (!accessToken) {
    const sharedSession = await getSharedKiteSession();
    if (sharedSession) accessToken = sharedSession.accessToken;
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated with Kite' }, { status: 401 });
  }

  try {
    let response = await doFetchPositions(apiKey, accessToken);

    // If cookie token was rejected, transparently retry with fresh DB token
    if ((response.status === 403 || response.status === 401) && tokenSource === 'cookie') {
      console.warn('[Kite Positions] Cookie token rejected — retrying with fresh DB token...');
      const freshSession = await getSharedKiteSession();
      if (freshSession) {
        response = await doFetchPositions(apiKey, freshSession.accessToken);
      }
    }

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch positions' }, { status: response.status });
    }

    const data = await response.json() as {
      status: string;
      data: { net: KitePosition[]; day: KitePosition[] };
    };

    return NextResponse.json(data.data);
  } catch (err) {
    console.error('Kite positions fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
