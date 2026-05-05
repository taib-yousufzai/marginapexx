/**
 * GET /api/market/comex?symbols=GC=F,SI=F,HG=F,CL=F
 *
 * Server-side proxy that fetches commodity prices from Yahoo Finance.
 * Running server-side avoids CORS issues and requires no API key.
 *
 * Supported Yahoo Finance symbols:
 *   GC=F  → Gold COMEX Futures
 *   SI=F  → Silver COMEX Futures
 *   HG=F  → Copper COMEX Futures
 *   CL=F  → WTI Crude Oil Futures
 *   NG=F  → Natural Gas Futures
 *   PL=F  → Platinum Futures
 *   PA=F  → Palladium Futures
 */

import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface YahooQuote {
  symbol: string;
  regularMarketPrice?: number;
  regularMarketPreviousClose?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  currency?: string;
  shortName?: string;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const symbolsParam = searchParams.get('symbols') ?? 'GC=F,SI=F,HG=F,CL=F';
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);

  if (symbols.length === 0) {
    return NextResponse.json({ error: 'No symbols provided' }, { status: 400 });
  }

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&fields=regularMarketPrice,regularMarketPreviousClose,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow,regularMarketChange,regularMarketChangePercent,regularMarketVolume,currency,shortName`;

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      next: { revalidate: 30 }, // cache 30 s
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Yahoo Finance error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const rawQuotes: YahooQuote[] = data?.quoteResponse?.result ?? [];

    const quotes: Record<string, {
      symbol: string;
      lastPrice: number;
      change: number;
      changePercent: number;
      open: number;
      high: number;
      low: number;
      close: number;
      volume: number;
      currency: string;
      name: string;
    }> = {};

    for (const q of rawQuotes) {
      quotes[q.symbol] = {
        symbol:        q.symbol,
        lastPrice:     q.regularMarketPrice        ?? 0,
        change:        q.regularMarketChange       ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        open:          q.regularMarketOpen         ?? 0,
        high:          q.regularMarketDayHigh      ?? 0,
        low:           q.regularMarketDayLow       ?? 0,
        close:         q.regularMarketPreviousClose ?? 0,
        volume:        q.regularMarketVolume       ?? 0,
        currency:      q.currency                  ?? 'USD',
        name:          q.shortName                 ?? q.symbol,
      };
    }

    return NextResponse.json({ quotes }, {
      headers: {
        'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
      },
    });
  } catch (err) {
    console.error('[/api/market/comex] fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch commodity data' }, { status: 500 });
  }
}
