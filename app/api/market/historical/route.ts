import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSharedKiteSession } from '@/lib/kiteSession';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol'); // e.g. "NSE:INFY"
    const interval = searchParams.get('interval') || 'day';
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (!symbol || !from || !to) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // 1. Get the active Kite session
    const session = await getSharedKiteSession();
    if (!session) {
      return NextResponse.json({ error: 'No active Kite session found' }, { status: 401 });
    }

    // 2. Resolve symbol to instrument_token
    // The id in the instruments table is typically the full string e.g. "NSE:INFY"
    const { data: instrument, error: dbError } = await supabase
      .from('instruments')
      .select('instrument_token')
      .eq('id', symbol)
      .single();

    if (dbError || !instrument?.instrument_token) {
      return NextResponse.json({ error: `Instrument not found for symbol: ${symbol}` }, { status: 404 });
    }

    const instrumentToken = instrument.instrument_token;

    // 3. Fetch from Kite Historical API
    const url = `https://api.kite.trade/instruments/historical/${instrumentToken}/${interval}?from=${from}&to=${to}`;
    
    const response = await fetch(url, {
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${process.env.KITE_API_KEY || process.env.NEXT_PUBLIC_KITE_API_KEY}:${session.accessToken}`
      }
    });

    const data = await response.json();

    if (!response.ok || data.status !== 'success') {
      return NextResponse.json({ error: 'Kite API error', details: data }, { status: response.status || 500 });
    }

    return NextResponse.json(data.data);

  } catch (error: any) {
    console.error('Historical API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', message: error.message }, { status: 500 });
  }
}
