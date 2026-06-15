import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getRedisClient } from '@/lib/redis';
import {
  loadStrikeConfig,
  applyForexFilter,
  applyCryptoWhitelist,
  applyExpiryFilter,
  applyStrikeRangeFilter,
  applyMcxStrikeRangeFilter,
  type Instrument,
} from '@/lib/filterEngine';

export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const segments: any[] = [];

    // Load strike config once for the entire request
    const strikeConfig = await loadStrikeConfig(supabase);
    const redis = getRedisClient();

    // 1. Index-FUT
    const { data: indexFuts } = await supabase
      .from('instruments')
      .select('tradingsymbol, name, exchange, instrument_type, segment, expiry')
      .in('name', ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'])
      .in('instrument_type', ['FUTIDX', 'FUT', 'MAPPED_FUT'])
      .gte('expiry', today)
      .order('expiry', { ascending: true })
      .limit(30);

    if (indexFuts && indexFuts.length > 0) {
      const earliestExpiries = new Map();
      indexFuts.forEach(f => {
        if (!earliestExpiries.has(f.name) || f.expiry < earliestExpiries.get(f.name).expiry) {
          earliestExpiries.set(f.name, f);
        }
      });
      segments.push({
        name: 'INDEX-FUT',
        icon: 'fa-chart-line',
        instruments: Array.from(earliestExpiries.values()).map(i => ({
          name: i.tradingsymbol, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`,
          price: 0, change: '0%', segment: `${i.exchange === 'NFO' ? 'NSE' : i.exchange === 'BFO' ? 'BSE' : i.exchange} - Futures`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0
        }))
      });
    }

    // 2. Index-OPT — apply applyExpiryFilter + applyStrikeRangeFilter
    const kiteIdMap: Record<string, string> = {
      'NIFTY': 'NSE:NIFTY 50',
      'BANKNIFTY': 'NSE:NIFTY BANK',
      'FINNIFTY': 'NSE:NIFTY FIN SERVICE',
      'MIDCPNIFTY': 'NSE:NIFTY MIDCAP 50',
      'SENSEX': 'BSE:SENSEX',
      'BANKEX': 'BSE:BANKEX',
    };

    const indexOptCats = (await Promise.all(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'].map(async (idx) => {
      const { data: expData } = await supabase.rpc('get_option_expiries', { p_symbol: idx, p_min_date: today });
      if (!expData || expData.length === 0) return null;

      // Apply expiry filter — nearest active only
      const allExpiries: string[] = expData.map((e: any) => e.expiry);
      const activeExpiries = applyExpiryFilter(allExpiries, today);
      if (activeExpiries.length === 0) return null;
      const nearestExpiry = activeExpiries[0];

      const { data: opts } = await supabase
        .from('instruments')
        .select('tradingsymbol, name, exchange, instrument_type, strike_price, option_type, expiry, underlying_symbol')
        .eq('underlying_symbol', idx)
        .eq('expiry', nearestExpiry)
        .order('strike_price', { ascending: true });

      if (!opts || opts.length === 0) return null;

      // Apply strike range filter using Redis ATM price
      let selectedOpts: Instrument[] = opts as Instrument[];
      try {
        const kiteId = kiteIdMap[idx];
        if (kiteId) {
          const cached = await redis.hget('market:quotes', kiteId);
          let atmPrice = 0;
          if (cached) {
            const q = JSON.parse(cached);
            atmPrice = q.last_price || q.ohlc?.close || q.close || 0;
          }
          if (!atmPrice && opts.length > 0) {
            console.warn(`[library] Redis ATM price unavailable for ${idx}, falling back to median strike`);
            const middleIndex = Math.floor(opts.length / 2);
            atmPrice = (opts as Instrument[])[middleIndex]?.strike_price || 0;
          }
          if (atmPrice) {
            selectedOpts = applyStrikeRangeFilter(opts as Instrument[], atmPrice, strikeConfig.indexOptionsRange);
          }
        }
      } catch (e) {
        console.error(`[library] Failed to apply strike range filter for ${idx}:`, e);
      }

      return {
        name: `${idx} Options`,
        instruments: selectedOpts.map((i: any) => ({
          name: `${i.underlying_symbol} ${i.strike_price} ${i.option_type}`, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`,
          price: 0, change: '0%', segment: `${i.exchange === 'NFO' ? 'NSE' : i.exchange === 'BFO' ? 'BSE' : i.exchange} - Options`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0
        }))
      };
    }))).filter(Boolean);
    if (indexOptCats.length > 0) segments.push({ name: 'INDEX-OPT', icon: 'fa-chart-pie', subCategories: indexOptCats });

    // 3. Mcx-FUT & Mcx-OPT — apply applyExpiryFilter + applyStrikeRangeFilter for OPT
    const commodities = ['CRUDEOIL', 'CRUDEOILM', 'GOLD', 'GOLDM', 'SILVER', 'SILVERM', 'SILVERMIC', 'NATURALGAS', 'NATGASMINI', 'ALUMINIUM', 'ALUMINI', 'ZINC', 'ZINCMINI', 'LEAD', 'LEADMINI', 'COPPER'];
    const mcxFutInstruments: any[] = [];  // flat list — no subCategories
    const mcxOptCats: any[] = [];

    await Promise.all(commodities.map(async (cmd) => {
      // FUT — collect directly into flat instruments array
      const { data: futs } = await supabase.from('instruments').select('*').eq('name', cmd).in('instrument_type', ['FUTCOM', 'FUT', 'MAPPED_FUT']).gte('expiry', today).order('expiry', { ascending: true }).limit(2);
      if (futs && futs.length > 0) {
        futs.forEach((i: any) => mcxFutInstruments.push({
          name: i.tradingsymbol, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`,
          price: 0, change: '0%', segment: `${i.exchange} - Futures`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0
        }));
      }
      // OPT — apply expiry + strike range filter
      const { data: expData } = await supabase.rpc('get_option_expiries', { p_symbol: cmd, p_min_date: today });
      if (expData && expData.length > 0) {
        const allExpiries: string[] = expData.map((e: any) => e.expiry);
        const activeExpiries = applyExpiryFilter(allExpiries, today);
        if (activeExpiries.length === 0) return;
        const nearestExpiry = activeExpiries[0];

        const { data: opts } = await supabase.from('instruments').select('*').eq('underlying_symbol', cmd).eq('expiry', nearestExpiry).order('strike_price', { ascending: true });
        if (opts && opts.length > 0) {
          let selectedOpts: Instrument[] = opts as Instrument[];
          try {
            // MCX ATM price — use nearest future's market quote instead of spot
            let atmPrice = 0;
            if (futs && futs.length > 0) {
              const nearestFut = futs[0];
              const kiteId = `${nearestFut.exchange}:${nearestFut.tradingsymbol}`;
              const cached = await redis.hget('market:quotes', kiteId);
              if (cached) {
                const q = JSON.parse(cached);
                atmPrice = q.last_price || q.ohlc?.close || q.close || 0;
              }
            }
            if (!atmPrice && opts.length > 0) {
              console.warn(`[library] No ATM price for MCX ${cmd}, falling back to median strike`);
              const middleIndex = Math.floor(opts.length / 2);
              atmPrice = (opts as Instrument[])[middleIndex]?.strike_price || 0;
            }
            if (atmPrice) {
              selectedOpts = applyMcxStrikeRangeFilter(opts as Instrument[], atmPrice);
            }
          } catch (e) {
            console.error(`[library] Failed to apply strike range filter for MCX ${cmd}:`, e);
          }

          mcxOptCats.push({
            name: cmd,
            instruments: selectedOpts.map((i: any) => ({ name: `${i.underlying_symbol} ${i.strike_price} ${i.option_type}`, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`, price: 0, change: '0%', segment: `${i.exchange} - Options`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0 }))
          });
        }
      }
    }));

    if (mcxFutInstruments.length > 0) segments.push({ name: 'MCX-FUT', icon: 'fa-oil-well', instruments: mcxFutInstruments });
    if (mcxOptCats.length > 0) segments.push({ name: 'MCX-OPT', icon: 'fa-oil-well', subCategories: mcxOptCats });

    // 4. Stock-FUT, Stock-OPT, Nse-EQ
    const topStocks = ['RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'ITC', 'TCS', 'LT', 'BHARTIARTL', 'SBIN', 'BAJFINANCE', 'AXISBANK', 'KOTAKBANK', 'M&M', 'TATAMOTORS', 'MARUTI', 'SUNPHARMA', 'ASIANPAINT', 'HCLTECH', 'TITAN', 'ULTRACEMCO'];
    const stockFutInstruments: any[] = [];  // flat
    const stockOptCats: any[] = [];
    const nseEqInstruments: any[] = [];     // flat

    await Promise.all(topStocks.map(async (stk) => {
      // FUT — flat into instruments array
      const { data: futs } = await supabase.from('instruments').select('*').eq('name', stk).in('instrument_type', ['FUTSTK', 'FUT', 'MAPPED_FUT']).gte('expiry', today).order('expiry', { ascending: true }).limit(2);
      if (futs && futs.length > 0) {
        futs.forEach((i: any) => stockFutInstruments.push({
          name: i.tradingsymbol, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`,
          price: 0, change: '0%', segment: `${i.exchange === 'NFO' ? 'NSE' : i.exchange === 'BFO' ? 'BSE' : i.exchange} - Stock Futures`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0
        }));
      }
      // OPT
      const { data: expData } = await supabase.rpc('get_option_expiries', { p_symbol: stk, p_min_date: today });
      if (expData && expData.length > 0) {
        const nearestExpiry = expData[0].expiry;
        const { data: opts } = await supabase.from('instruments').select('*').eq('underlying_symbol', stk).eq('expiry', nearestExpiry).order('strike_price', { ascending: true });
        if (opts && opts.length > 0) {
          let selectedOpts: Instrument[] = opts as Instrument[];
          try {
            const kiteId = `NSE:${stk}`;
            const cached = await redis.hget('market:quotes', kiteId);
            let atmPrice = 0;
            if (cached) {
              const q = JSON.parse(cached);
              atmPrice = q.last_price || q.ohlc?.close || q.close || 0;
            }
            if (!atmPrice && opts.length > 0) {
              console.warn(`[library] No ATM price for Stock ${stk}, falling back to median strike`);
              const middleIndex = Math.floor(opts.length / 2);
              atmPrice = (opts as Instrument[])[middleIndex]?.strike_price || 0;
            }
            if (atmPrice) {
              selectedOpts = applyStrikeRangeFilter(opts as Instrument[], atmPrice, strikeConfig.indexOptionsRange);
            }
          } catch (e) {
            console.error(`[library] Failed to apply strike range filter for Stock ${stk}:`, e);
          }

          stockOptCats.push({
            name: stk,
            instruments: selectedOpts.map((i: any) => ({ name: `${i.underlying_symbol} ${i.strike_price} ${i.option_type}`, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`, price: 0, change: '0%', segment: `${i.exchange === 'NFO' ? 'NSE' : i.exchange === 'BFO' ? 'BSE' : i.exchange} - Stock Options`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0 }))
          });
        }
      }
      // EQ — flat into instruments array
      const { data: eq } = await supabase.from('instruments').select('*').eq('instrument_type', 'EQ').eq('tradingsymbol', stk).limit(1);
      if (eq && eq.length > 0) {
        eq.forEach((i: any) => nseEqInstruments.push({
          name: `${i.tradingsymbol} (EQ)`, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`,
          price: 0, change: '0%', segment: `${i.exchange} - Equity`, contractDate: '', open: 0, high: 0, low: 0, close: 0
        }));
      }
    }));

    if (stockFutInstruments.length > 0) segments.push({ name: 'STOCK-FUT', icon: 'fa-building', instruments: stockFutInstruments });
    if (stockOptCats.length > 0) segments.push({ name: 'STOCK-OPT', icon: 'fa-building', subCategories: stockOptCats });
    if (nseEqInstruments.length > 0) segments.push({ name: 'NSE-EQ', icon: 'fa-building', instruments: nseEqInstruments });

    // 5. Crypto — apply applyCryptoWhitelist
    const { data: cryptos } = await supabase.from('instruments').select('*').eq('segment', 'CRYPTO').order('name', { ascending: true });
    if (cryptos && cryptos.length > 0) {
      const whitelisted = applyCryptoWhitelist(cryptos as Instrument[]);
      const uniqueCryptos = new Map();
      whitelisted.forEach((c: any) => {
        if (!uniqueCryptos.has(c.tradingsymbol) || c.id === c.tradingsymbol) {
          uniqueCryptos.set(c.tradingsymbol, c);
        }
      });
      if (uniqueCryptos.size > 0) {
        segments.push({
          name: 'Crypto',
          icon: 'fa-bitcoin',
          instruments: Array.from(uniqueCryptos.values()).map((i: any) => ({
            name: i.tradingsymbol, symbol: i.tradingsymbol, kiteSymbol: i.id,
            price: 0, change: '0%', segment: 'CRYPTO', contractDate: '', open: 0, high: 0, low: 0, close: 0
          }))
        });
      }
    }

    // 6. Comex
    const { data: comex } = await supabase.from('instruments').select('*').eq('segment', 'COMEX').order('name', { ascending: true });
    if (comex && comex.length > 0) {
      segments.push({
        name: 'COMEX',
        icon: 'fa-globe',
        instruments: comex.map((i: any) => ({
          name: i.tradingsymbol, symbol: i.tradingsymbol, kiteSymbol: i.id,
          price: 0, change: '0%', segment: 'COMEX', contractDate: '', open: 0, high: 0, low: 0, close: 0
        }))
      });
    }

    // 7. Forex — apply applyForexFilter (excludes CE/PE options, keeps Futures only)
    const currencies = ['USDINR', 'EURINR', 'GBPINR', 'JPYINR'];
    const forexInstruments: any[] = [];  // flat — no subCategories

    await Promise.all(currencies.map(async (curr) => {
      const { data: futs } = await supabase.from('instruments').select('*').eq('name', curr).in('instrument_type', ['FUTCUR', 'FUT', 'MAPPED_FUT']).gte('expiry', today).order('expiry', { ascending: true }).limit(2);
      const { data: expData } = await supabase.rpc('get_option_expiries', { p_symbol: curr, p_min_date: today });
      let opts: any[] | null = null;
      if (expData && expData.length > 0) {
        const nearestExpiry = expData[0].expiry;
        const { data } = await supabase.from('instruments').select('*').eq('underlying_symbol', curr).eq('expiry', nearestExpiry).order('strike_price', { ascending: true });
        opts = data;
      }

      // Combine futs + opts, apply forex filter (removes CE/PE), push flat
      const combined: Instrument[] = [...(futs ?? []), ...(opts ?? [])] as Instrument[];
      const filtered = applyForexFilter(combined);

      filtered.forEach((i: any) => {
        const entry = ['CE', 'PE'].includes(i.option_type)
          ? { name: `${i.underlying_symbol} ${i.strike_price} ${i.option_type}`, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`, price: 0, change: '0%', segment: `${i.exchange} - Options`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0 }
          : { name: i.tradingsymbol, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`, price: 0, change: '0%', segment: `${i.exchange} - Futures`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0 };
        forexInstruments.push(entry);
      });
    }));

    if (forexInstruments.length > 0) segments.push({ name: 'FOREX', icon: 'fa-coins', instruments: forexInstruments });

    return NextResponse.json({ segments });
  } catch (error: any) {
    console.error('Library API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
