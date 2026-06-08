import { NextRequest, NextResponse } from 'next/server';
import { getAdminClient, getUserFromRequest } from '@/lib/adminClient';
import { getSharedKiteSession } from '@/lib/kiteSession';

async function fetchKiteLtpBatch(instruments: string[]): Promise<Record<string, number>> {
  const quotesMap: Record<string, number> = {};
  if (instruments.length === 0) return quotesMap;

  // 1. Check Ticker Daemon in-memory quotes API
  try {
    const tickerUrl = process.env.NEXT_PUBLIC_TICKER_URL || (process.env.NODE_ENV === 'production' ? 'https://marginapexx-production.up.railway.app' : 'http://localhost:8080');
    const params = new URLSearchParams({ symbols: instruments.join(',') });
    const resTicker = await fetch(`${tickerUrl}/quotes?${params}`, { cache: 'no-store' });
    if (resTicker.ok) {
      const json = await resTicker.json();
      if (json.success && json.data) {
        for (const inst of instruments) {
          if (json.data[inst]) {
            quotesMap[inst] = Number(json.data[inst].last_price);
          }
        }
      }
    }
  } catch (tickerErr) {
    console.warn('[fetchKiteLtpBatch] Failed to query Ticker Daemon, falling back to REST:', tickerErr);
  }

  // Find instruments not found in Ticker Daemon cache
  const missing = instruments.filter(inst => quotesMap[inst] === undefined);
  if (missing.length === 0) return quotesMap;

  // 2. On-demand fallback to Kite REST API for missing ones
  try {
    const apiKey = process.env.KITE_API_KEY;
    if (!apiKey) return quotesMap;
    const session = await getSharedKiteSession();
    if (!session) return quotesMap;

    const params = new URLSearchParams();
    for (const inst of missing) {
      params.append('i', inst);
    }

    const res = await fetch(`https://api.kite.trade/quote?${params}`, {
      headers: {
        'X-Kite-Version': '3',
        Authorization: `token ${apiKey}:${session.accessToken}`,
      },
      cache: 'no-store',
    });

    if (res.ok) {
      const data = await res.json() as { data?: Record<string, { last_price: number; instrument_token?: number; ohlc?: { close?: number } }> };
      if (data.data) {
        const admin = getAdminClient();
        const upsertPromises: Promise<any>[] = [];

        for (const inst of missing) {
          const quote = data.data[inst];
          if (quote) {
            quotesMap[inst] = quote.last_price;

            // Asynchronously cache instruments
            upsertPromises.push((async () => {
              try {
                const parts = inst.split(':');
                const exchange = parts[0] || 'NSE';
                const tradingsymbol = parts[1] || '';
                await admin.from('instruments').upsert({
                  id: inst,
                  instrument_token: quote.instrument_token || 0,
                  tradingsymbol: tradingsymbol,
                  exchange: exchange,
                  instrument_type: exchange === 'NFO' || exchange === 'MCX' || exchange === 'CDS' ? 'FUTOPT' : 'EQ',
                  segment: exchange,
                  updated_at: new Date().toISOString()
                }, { onConflict: 'id' });
              } catch (err) {
                console.error('[fetchKiteLtpBatch] Background cache error:', err);
              }
            })());
          }
        }
        // Run caching in background
        Promise.all(upsertPromises).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[fetchKiteLtpBatch] Unexpected REST error:', err);
  }

  return quotesMap;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { positionIds } = await request.json() as { positionIds?: string[] };
    if (!positionIds || !Array.isArray(positionIds) || positionIds.length === 0) {
      return NextResponse.json({ error: 'Missing or empty positionIds array' }, { status: 400 });
    }

    const admin = getAdminClient();

    // 1. Parallel fetch positions, profile, and trading hours
    const [posResult, profileResult, tradingHoursResult] = await Promise.all([
      admin.from('positions')
        .select('*')
        .in('id', positionIds)
        .eq('user_id', user.id)
        .eq('status', 'open'),
      admin.from('profiles')
        .select('parent_id, trading_mode')
        .eq('id', user.id)
        .single(),
      admin.from('trading_hours')
        .select('id, name, start_time, end_time, is_active')
    ]);

    const { data: positions, error: posErr } = posResult;
    if (posErr || !positions || positions.length === 0) {
      return NextResponse.json({ error: 'No open positions found matching the specified IDs' }, { status: 404 });
    }

    // Map trading hours for easy access
    const tradingHoursMap = new Map<string, any>();
    if (tradingHoursResult.data) {
      tradingHoursResult.data.forEach(th => {
        tradingHoursMap.set(th.id, th);
      });
    }

    // 2. Fetch segment settings for all required settings
    const isScalper = profileResult.data?.trading_mode === 'scalper';
    const targetTable = isScalper ? 'scalper_segment_settings' : 'segment_settings';
    const lookupId = profileResult.data?.parent_id ?? user.id;

    const { data: segSettings } = await admin.from(targetTable)
      .select('segment, side, exit_buffer, profit_hold_sec, loss_hold_sec')
      .eq('user_id', lookupId);

    const segSettingsMap = new Map<string, any>();
    if (segSettings) {
      segSettings.forEach(s => {
        segSettingsMap.set(`${s.segment}|${s.side}`, s);
      });
    }

    // 3. Resolve all full symbols and prepare to batch fetch LTPs
    const symbolsToFetch = new Set<string>();
    const posSymbols = positions.map(pos => {
      let fullSymbol = pos.symbol;
      if (!pos.symbol.includes(':') && pos.settlement !== 'CRYPTO') {
        let exchange = 'NSE';
        if (pos.settlement) {
          const s = pos.settlement.toUpperCase();
          if (s.includes('MCX')) exchange = 'MCX';
          else if (s.includes('CDS') || s.includes('FOREX')) exchange = 'CDS';
          else if (s.includes('OPT') || s.includes('FUT') || s.includes('NFO')) exchange = 'NFO';
          else if (s.includes('BSE')) exchange = 'BSE';
        }
        fullSymbol = `${exchange}:${pos.symbol}`;
      }
      symbolsToFetch.add(fullSymbol);
      return { pos, fullSymbol };
    });

    const quotesMap = await fetchKiteLtpBatch(Array.from(symbolsToFetch));

    // 4. Process closing for each position
    const results = await Promise.all(
      posSymbols.map(async ({ pos, fullSymbol }) => {
        try {
          // Check market hours
          const symbol = pos.symbol || '';
          const dbSegment = pos.settlement || '';
          const exchangeName = symbol.includes(':') ? symbol.split(':')[0] : 'NSE';
          const ex = exchangeName.toUpperCase();
          const segUpper = dbSegment.toUpperCase();

          if (!segUpper.includes('CRYPTO')) {
            let segmentId = 'nse';
            if (ex === 'MCX' || segUpper.includes('MCX')) segmentId = 'mcx';
            else if (ex === 'BSE' || segUpper.includes('BSE') || segUpper.includes('BFO')) segmentId = 'bse';
            else if (ex === 'CDS' || ex === 'FOREX' || segUpper.includes('CDS') || segUpper.includes('FOREX')) segmentId = 'forex';
            else if (ex === 'COMEX' || segUpper.includes('COMEX')) segmentId = 'comex';

            const segmentHour = tradingHoursMap.get(segmentId);
            if (segmentHour) {
              if (!segmentHour.is_active) {
                return { positionId: pos.id, success: false, error: 'market is closed' };
              }

              const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
              const dayOfWeek = nowIST.getDay();
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

              if (isWeekend) {
                return { positionId: pos.id, success: false, error: 'market is closed' };
              }

              const currentHHMM = `${String(nowIST.getHours()).padStart(2, '0')}:${String(nowIST.getMinutes()).padStart(2, '0')}`;
              if (currentHHMM < segmentHour.start_time || currentHHMM >= segmentHour.end_time) {
                return { positionId: pos.id, success: false, error: 'market is closed' };
              }
            }
          }

          // Get settings and LTP
          const segSetting = segSettingsMap.get(`${pos.settlement ?? ''}|${pos.side}`);
          const exitBuffer = segSetting?.exit_buffer ?? 0.0017;
          const profitHoldSec = segSetting?.profit_hold_sec ?? 120;
          const lossHoldSec = segSetting?.loss_hold_sec ?? 0;

          const baseLtp = quotesMap[fullSymbol] ?? Number(pos.ltp ?? pos.entry_price);

          // Exit price computation
          let exitPrice: number;
          if (pos.side === 'BUY') {
            exitPrice = (baseLtp * 0.999) * (1 - exitBuffer);
          } else {
            exitPrice = (baseLtp * 1.001) * (1 + exitBuffer);
          }
          exitPrice = Math.round(exitPrice * 100) / 100;

          // Anti-scalping check
          const pnlValue = pos.side === 'BUY'
            ? (exitPrice - Number(pos.entry_price)) * Number(pos.qty_open)
            : (Number(pos.entry_price) - exitPrice) * Number(pos.qty_open);

          const durationSec = Math.floor((Date.now() - new Date(pos.entry_time).getTime()) / 1000);
          const requiredHold = pnlValue >= 0 ? profitHoldSec : lossHoldSec;

          if (durationSec < requiredHold) {
            return {
              positionId: pos.id,
              success: false,
              error: `Anti-Scalping: Minimum hold time of ${requiredHold}s required. Elapsed: ${durationSec}s.`
            };
          }

          // Call RPC
          const { data: pnl, error: rpcErr } = await admin.rpc('close_position', {
            p_position_id: pos.id,
            p_user_id:     user.id,
            p_ltp:         baseLtp,
            p_exit_price:  exitPrice,
            p_closed_by:   'USER',
          });

          if (rpcErr) {
            console.error(`[POST /api/positions/close] RPC error for position ${pos.id}:`, rpcErr);
            return { positionId: pos.id, success: false, error: 'Failed to close position via RPC' };
          }

          return { positionId: pos.id, success: true, pnl: Number(pnl), exit_price: exitPrice };
        } catch (innerErr: any) {
          return { positionId: pos.id, success: false, error: innerErr.message || 'Unknown error' };
        }
      })
    );

    return NextResponse.json({ success: true, results }, { status: 200 });
  } catch (err: any) {
    console.error('[POST /api/positions/close] Request error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
