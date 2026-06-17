import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient } from '@/lib/adminClient';

export interface ScannerResult {
  symbol: string;
  name: string;
  exchange: string;
  segment: string;
  instrument_type: string;
  last_price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  changePercent: number;
  gap: number;
  gapPercent: number;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  try {
    const admin = getAdminClient();
    const { searchParams } = new URL(request.url);

    const segment = searchParams.get('segment'); // e.g. NSE, NFO, MCX, CRYPTO, CDS
    const minPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : null;
    const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : null;
    const minVolume = searchParams.get('minVolume') ? Number(searchParams.get('minVolume')) : null;
    const maxVolume = searchParams.get('maxVolume') ? Number(searchParams.get('maxVolume')) : null;
    const minGap = searchParams.get('minGap') ? Number(searchParams.get('minGap')) : null;
    const maxGap = searchParams.get('maxGap') ? Number(searchParams.get('maxGap')) : null;
    const momentum = searchParams.get('momentum') || 'top_gainers'; // top_gainers, top_losers, high_volume, breakout_high, breakout_low, gappers_up, gappers_down
    const limit = Math.min(Number(searchParams.get('limit') || '50'), 100);

    // 1. Build database query joining market_quotes with instruments
    let dbQuery = admin
      .from('market_quotes')
      .select(`
        last_price,
        open,
        high,
        low,
        close,
        volume,
        updated_at,
        instruments!inner (
          id,
          tradingsymbol,
          name,
          exchange,
          instrument_type,
          segment
        )
      `);

    // 2. Apply database filters (price, volume, segment)
    if (segment) {
      dbQuery = dbQuery.eq('instruments.segment', segment.toUpperCase());
    }
    if (minPrice !== null && !isNaN(minPrice)) {
      dbQuery = dbQuery.gte('last_price', minPrice);
    }
    if (maxPrice !== null && !isNaN(maxPrice)) {
      dbQuery = dbQuery.lte('last_price', maxPrice);
    }
    if (minVolume !== null && !isNaN(minVolume)) {
      dbQuery = dbQuery.gte('volume', minVolume);
    }
    if (maxVolume !== null && !isNaN(maxVolume)) {
      dbQuery = dbQuery.lte('volume', maxVolume);
    }

    const { data: quotesData, error } = await dbQuery;

    if (error) {
      console.error('[Scanner API] Database query error:', error);
      return NextResponse.json({ error: 'Failed to query database quotes' }, { status: 500 });
    }

    if (!quotesData || quotesData.length === 0) {
      return NextResponse.json([]);
    }

    // 3. Process calculations in memory (Change %, Gap %, Gap Amt)
    let results: ScannerResult[] = quotesData.map((row: any) => {
      const lastPrice = Number(row.last_price || 0);
      const openPrice = Number(row.open || 0);
      const highPrice = Number(row.high || 0);
      const lowPrice = Number(row.low || 0);
      const closePrice = Number(row.close || 0); // Previous day close
      const volume = Number(row.volume || 0);

      const change = lastPrice - closePrice;
      const changePercent = closePrice > 0 ? (change / closePrice) * 100 : 0;

      const gap = openPrice - closePrice;
      const gapPercent = closePrice > 0 ? (gap / closePrice) * 100 : 0;

      const inst = row.instruments;

      return {
        symbol: inst.tradingsymbol,
        name: inst.name || inst.tradingsymbol,
        exchange: inst.exchange,
        segment: inst.segment,
        instrument_type: inst.instrument_type,
        last_price: lastPrice,
        open: openPrice,
        high: highPrice,
        low: lowPrice,
        close: closePrice,
        volume: volume,
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2)),
        gap: Number(gap.toFixed(2)),
        gapPercent: Number(gapPercent.toFixed(2)),
        updated_at: row.updated_at
      };
    });

    // 4. Apply Gap Filters in memory (if specified)
    if (minGap !== null && !isNaN(minGap)) {
      results = results.filter(r => r.gapPercent >= minGap);
    }
    if (maxGap !== null && !isNaN(maxGap)) {
      results = results.filter(r => r.gapPercent <= maxGap);
    }

    // 5. Apply Momentum Sorting
    switch (momentum) {
      case 'top_gainers':
        results.sort((a, b) => b.changePercent - a.changePercent);
        break;
      case 'top_losers':
        results.sort((a, b) => a.changePercent - b.changePercent);
        break;
      case 'high_volume':
        results.sort((a, b) => b.volume - a.volume);
        break;
      case 'breakout_high':
        // Sort by how close the price is to daily high (smallest difference first)
        results = results.filter(r => r.high > 0);
        results.sort((a, b) => {
          const diffA = (a.high - a.last_price) / a.last_price;
          const diffB = (b.high - b.last_price) / b.last_price;
          return diffA - diffB;
        });
        break;
      case 'breakout_low':
        // Sort by how close the price is to daily low (smallest difference first)
        results = results.filter(r => r.low > 0);
        results.sort((a, b) => {
          const diffA = (a.last_price - a.low) / a.last_price;
          const diffB = (b.last_price - b.low) / b.last_price;
          return diffA - diffB;
        });
        break;
      case 'gappers_up':
        results = results.filter(r => r.gapPercent > 0);
        results.sort((a, b) => b.gapPercent - a.gapPercent);
        break;
      case 'gappers_down':
        results = results.filter(r => r.gapPercent < 0);
        results.sort((a, b) => a.gapPercent - b.gapPercent);
        break;
      default:
        results.sort((a, b) => b.changePercent - a.changePercent);
    }

    // 6. Apply limit
    const limitedResults = results.slice(0, limit);

    return NextResponse.json(limitedResults);
  } catch (err: any) {
    console.error('[Scanner API] Unexpected server error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
