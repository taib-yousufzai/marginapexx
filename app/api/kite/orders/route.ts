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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Kite API not configured' }, { status: 500 });
  }

  let accessToken = request.cookies.get('kite_access_token')?.value;

  if (!accessToken) {
    console.log('[Kite Orders] No cookie found, checking shared session...');
    const sharedSession = await getSharedKiteSession();
    if (sharedSession) {
      accessToken = sharedSession.accessToken;
    }
  }

  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated with Kite' }, { status: 401 });
  }

  try {
    const response = await fetch('https://api.kite.trade/orders', {
      headers: {
        'X-Kite-Version': '3',
        Authorization: `token ${apiKey}:${accessToken}`,
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      if (response.status === 403) {
        return NextResponse.json(
          { error: 'Kite session expired. Please reconnect.' },
          { status: 403 },
        );
      }
      return NextResponse.json({ error: 'Failed to fetch orders' }, { status: response.status });
    }

    const data = await response.json() as { status: string; data: KiteOrder[] };
    return NextResponse.json({ orders: data.data });
  } catch (err) {
    console.error('Kite orders fetch error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
