/**
 * Kite Orders API
 * GET /api/kite/orders
 *
 * Proxies Kite Connect's GET /orders endpoint server-side so the
 * access_token (stored in an HTTP-only cookie) is never exposed to the browser.
 *
 * Returns: { orders: KiteOrder[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSharedKiteSession } from '@/lib/kiteSession';

export interface KiteOrder {
  order_id: string;
  parent_order_id: string | null;
  exchange_order_id: string | null;
  placed_by: string;
  variety: string;
  status: string;
  status_message: string | null;
  status_message_raw: string | null;
  order_timestamp: string;
  exchange_update_timestamp: string | null;
  exchange_timestamp: string | null;
  modified: boolean;
  exchange: string;
  tradingsymbol: string;
  instrument_token: number;
  order_type: string;
  transaction_type: string;
  validity: string;
  product: string;
  quantity: number;
  disclosed_quantity: number;
  price: number;
  trigger_price: number;
  average_price: number;
  filled_quantity: number;
  pending_quantity: number;
  cancelled_quantity: number;
  market_protection: number;
  tag: string | null;
}

async function doFetchOrders(apiKey: string, accessToken: string) {
  return fetch('https://api.kite.trade/orders', {
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
    let response = await doFetchOrders(apiKey, accessToken);

    // If cookie token was rejected, transparently retry with fresh DB token
    if ((response.status === 403 || response.status === 401) && tokenSource === 'cookie') {
      console.warn('[Kite Orders] Cookie token rejected — retrying with fresh DB token...');
      const freshSession = await getSharedKiteSession();
      if (freshSession) {
        response = await doFetchOrders(apiKey, freshSession.accessToken);
      }
    }

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: response.status });
    }

    const data = await response.json() as { status: string; data: KiteOrder[] };
    return NextResponse.json({ orders: data.data });
  } catch (err) {
    console.error('Kite orders fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
