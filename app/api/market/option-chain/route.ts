import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRedisClient } from '@/lib/redis';
import {
  loadStrikeConfig,
  applyExpiryFilter,
  applyStrikeRangeFilter,
  applyMcxStrikeRangeFilter,
  type Instrument,
} from '@/lib/filterEngine';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Helper function to map option symbol to DB key segment
function getOptionChainSegment(sym: string): string {
  const s = sym.toUpperCase().trim();
  if (['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'].includes(s)) {
    return 'INDEX-OPT';
  }
  if (['GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS'].includes(s)) {
    return 'MCX-OPT';
  }
  return 'STOCK-OPT';
}

// IN-MEMORY CACHE FOR API ROUTE
const optionChainCache: Record<string, { data: any, timestamp: number }> = {};
const CACHE_TTL_MS = 1000 * 60; // 1 minute cache

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let symbol = (searchParams.get('symbol') || 'NIFTY').toUpperCase();
    if (symbol === 'MIDCAP') symbol = 'MIDCPNIFTY';
    const expiry = searchParams.get('expiry');
    const today = new Date().toISOString().split('T')[0];
    
    const cacheKey = `${symbol}_${expiry || 'default'}`;
    const now = Date.now();
    if (optionChainCache[cacheKey] && now - optionChainCache[cacheKey].timestamp < CACHE_TTL_MS) {
      return NextResponse.json(optionChainCache[cacheKey].data);
    }

    // 1. Parallelize Auth check
    const authPromise = (async () => {
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        if (token) {
          try {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            const userId = payload.sub;
            if (userId) {
              const { data: profile } = await supabase
                .from('profiles')
                .select('segments')
                .eq('id', userId)
                .single();
              if (profile?.segments && profile.segments.length > 0) {
                const dbSeg = getOptionChainSegment(symbol);
                if (!profile.segments.includes(dbSeg)) {
                  return { error: `Access denied to segment: ${dbSeg}` };
                }
              }
            }
          } catch (e) {}
        }
      }
      return null;
    })();

    // 2. Parallelize Expiries query (Removed failing RPC to speed up fallback)
    const expiriesPromise = supabase
      .from('instruments')
      .select('expiry')
      .eq('underlying_symbol', symbol)
      .not('expiry', 'is', null)
      .gte('expiry', today)
      .order('expiry', { ascending: true });

    // 3. Parallelize Options query (if expiry is known upfront)
    let optionsPromise = null;
    if (expiry) {
      optionsPromise = supabase
        .from('instruments')
        .select('id, instrument_token, tradingsymbol, strike_price, option_type, exchange')
        .eq('underlying_symbol', symbol)
        .eq('expiry', expiry)
        .in('option_type', ['CE', 'PE'])
        .order('strike_price', { ascending: true });
    }

    // Wait for initial batch
    const [authRes, expiriesRes, optionsRes] = await Promise.all([
      authPromise,
      expiriesPromise,
      optionsPromise || Promise.resolve({ data: null, error: null })
    ]);

    if (authRes?.error) {
      return NextResponse.json({ error: authRes.error }, { status: 403 });
    }

    if (expiriesRes.error) throw expiriesRes.error;

    const allExpiries = Array.from(new Set(expiriesRes.data.map((e: any) => e.expiry))) as string[];
    // Collapse to nearest active expiry only (Requirement 4.2, 4.4)
    const activeExpiries = applyExpiryFilter(allExpiries, today);
    const uniqueExpiries = activeExpiries; // expose only the nearest active expiry
    const selectedExpiry = expiry || uniqueExpiries[0];
    let options = optionsRes?.data;

    // 4. Fetch Options if expiry was NOT known upfront (first page load)
    if (!expiry && selectedExpiry) {
      const secondRes = await supabase
        .from('instruments')
        .select('id, instrument_token, tradingsymbol, strike_price, option_type, exchange')
        .eq('underlying_symbol', symbol)
        .eq('expiry', selectedExpiry)
        .in('option_type', ['CE', 'PE'])
        .order('strike_price', { ascending: true });
      
      if (secondRes.error) throw secondRes.error;
      options = secondRes.data;
    }

    if (!selectedExpiry || !options) {
      return NextResponse.json({ 
        success: true, 
        expiries: uniqueExpiries, 
        strikes: [],
        message: 'No options found for this symbol' 
      });
    }

    // 5. Apply strike range filter using Redis ATM price
    if (options && options.length > 0) {
      try {
        const strikeConfig = await loadStrikeConfig(supabase);
        const redis = getRedisClient();

        // Determine the segment to pick the right strike range
        const isIndex = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'].includes(symbol);
        const isMcx = ['GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS'].includes(symbol);
        const range = isMcx ? strikeConfig.mcxOptionsRange : strikeConfig.indexOptionsRange;

        // Look up ATM price from Redis
        const kiteIdMap: Record<string, string> = {
          'NIFTY': 'NSE:NIFTY 50', 'BANKNIFTY': 'NSE:NIFTY BANK',
          'FINNIFTY': 'NSE:NIFTY FIN SERVICE', 'MIDCPNIFTY': 'NSE:NIFTY MIDCAP 50',
          'SENSEX': 'BSE:SENSEX', 'BANKEX': 'BSE:BANKEX',
        };
        const kiteId = kiteIdMap[symbol] ?? `MCX:${symbol}`;
        const cached = await redis.hget('market:quotes', kiteId);

        let atmPrice = 0;
        if (cached) {
          const q = JSON.parse(cached);
          atmPrice = q.last_price || q.ohlc?.close || q.close || 0;
        }
        if (!atmPrice && options.length > 0) {
          console.warn(`[option-chain] Redis ATM price unavailable for ${symbol}, falling back to median strike`);
          const middleIndex = Math.floor(options.length / 2);
          atmPrice = (options as Instrument[])[middleIndex]?.strike_price || 0;
        }
        if (atmPrice) {
          if (isMcx) {
            options = applyMcxStrikeRangeFilter(options as Instrument[], atmPrice) as any[];
          } else {
            options = applyStrikeRangeFilter(options as Instrument[], atmPrice, range) as any[];
          }
        }
      } catch (e) {
        console.error(`[option-chain] Strike range filter error for ${symbol}:`, e);
      }
    }

    // 6. Group by strike price
    const strikeMap: Record<number, any> = {};
    options.forEach(opt => {
      const strike = opt.strike_price;
      if (!strikeMap[strike]) {
        strikeMap[strike] = { strike };
      }
      const kiteId = `${opt.exchange}:${opt.tradingsymbol}`;
      if (opt.option_type === 'CE') {
        strikeMap[strike].ce = {
          token: opt.instrument_token,
          symbol: opt.tradingsymbol,
          id: kiteId
        };
      } else {
        strikeMap[strike].pe = {
          token: opt.instrument_token,
          symbol: opt.tradingsymbol,
          id: kiteId
        };
      }
    });

    const sortedStrikes = Object.values(strikeMap).sort((a: any, b: any) => a.strike - b.strike);

    const responseData = {
      success: true,
      symbol,
      expiry: selectedExpiry,
      expiries: uniqueExpiries,
      strikes: sortedStrikes
    };

    // Store in cache
    optionChainCache[cacheKey] = { data: responseData, timestamp: now };
    // Also cache under the specific expiry key to prevent next lookup
    optionChainCache[`${symbol}_${selectedExpiry}`] = { data: responseData, timestamp: now };

    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error('[Option Chain API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
