import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSharedKiteSession } from '@/lib/kiteSession';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Resolve a symbol to an instrument_token.
 * Runs strategies in parallel for speed.
 */
async function resolveInstrumentToken(symbol: string): Promise<number | null> {
  // Fast path: symbol contains ':' (e.g. "NFO:NIFTY2661623700CE") — exact id match
  if (symbol.includes(':')) {
    const { data } = await supabase
      .from('instruments')
      .select('instrument_token')
      .eq('id', symbol)
      .single();
    return data?.instrument_token ?? null;
  }

  // Slow path: short symbol like "GOLD_FUT" — run ALL strategies in parallel
  const exchanges = ['NSE', 'NFO', 'MCX', 'BSE', 'BFO', 'CDS'];
  const hasUnderscore = symbol.includes('_');
  const baseName = hasUnderscore ? symbol.split('_')[0] : symbol;

  // Build all queries to run in parallel
  const queries: PromiseLike<number | null>[] = [];

  // Strategy 1: Exact id match
  queries.push(
    supabase.from('instruments').select('instrument_token').eq('id', symbol).single()
      .then(r => r.data?.instrument_token ?? null)
  );

  // Strategy 2: tradingsymbol match
  queries.push(
    supabase.from('instruments').select('instrument_token').eq('tradingsymbol', symbol).limit(1).single()
      .then(r => r.data?.instrument_token ?? null)
  );

  // Strategy 3: Exchange prefix matches (all in parallel)
  for (const exchange of exchanges) {
    queries.push(
      supabase.from('instruments').select('instrument_token').eq('id', `${exchange}:${symbol}`).single()
        .then(r => r.data?.instrument_token ?? null)
    );
  }

  // Strategy 4a: Mapped continuous contracts (for underscored symbols)
  if (hasUnderscore) {
    for (const exchange of exchanges) {
      queries.push(
        supabase.from('instruments').select('instrument_token')
          .eq('id', `${exchange}:${baseName}`).eq('instrument_type', 'MAPPED_FUT').single()
          .then(r => r.data?.instrument_token ?? null)
      );
    }
  }

  // Strategy 4b: Fuzzy tradingsymbol match (for underscored symbols)
  if (hasUnderscore) {
    const fuzzyPattern = symbol.replace(/_/g, '%');
    queries.push(
      supabase.from('instruments').select('instrument_token, instrument_type')
        .ilike('tradingsymbol', fuzzyPattern).in('exchange', exchanges)
        .order('instrument_type', { ascending: true }).limit(5)
        .then(r => {
          if (!r.data?.length) return null;
          const mapped = r.data.find((m: any) => m.instrument_type === 'MAPPED_FUT');
          return (mapped || r.data[0]).instrument_token;
        })
    );
  }

  // Run all queries in parallel, return first non-null result
  // Priority: exact > tradingsymbol > prefix > mapped > fuzzy
  const results = await Promise.all(queries);
  return results.find(r => r !== null) ?? null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const interval = searchParams.get('interval') || 'day';
    const toVal = searchParams.get('to') || new Date().toISOString().slice(0, 10);
    let fromVal = searchParams.get('from');
    if (!fromVal) {
      const fromDate = new Date();
      if (interval.includes('minute') || interval.includes('min') || interval === '60m' || interval === '30m' || interval === '15m' || interval === '5m' || interval === '1m') {
        fromDate.setDate(fromDate.getDate() - 7); // 7 days ago for intraday
      } else {
        fromDate.setFullYear(fromDate.getFullYear() - 1); // 1 year ago for daily/weekly
      }
      fromVal = fromDate.toISOString().slice(0, 10);
    }

    if (!symbol) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const from = fromVal;
    const to = toVal;

    // Run session fetch and symbol resolution in PARALLEL (they're independent)
    const [session, instrumentToken] = await Promise.all([
      getSharedKiteSession(),
      resolveInstrumentToken(symbol)
    ]);

    if (!session) {
      return NextResponse.json({ error: 'No active Kite session found' }, { status: 401 });
    }
    if (!instrumentToken) {
      return NextResponse.json({ error: `Instrument not found for symbol: ${symbol}` }, { status: 404 });
    }

    // Fetch from Kite Historical API
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
