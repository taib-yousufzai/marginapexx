import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
          price: 0, change: '0%', segment: `${i.exchange} - Futures`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0
        }))
      });
    }

    // 2. Index-OPT
    const indexOptCats = (await Promise.all(['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'].map(async (idx) => {
      const { data: expData } = await supabase.rpc('get_option_expiries', { p_symbol: idx, p_min_date: today });
      if (expData && expData.length > 0) {
        const nearestExpiry = expData[0].expiry;
        const { data: opts } = await supabase.from('instruments').select('tradingsymbol, name, exchange, instrument_type, strike_price, option_type, expiry, underlying_symbol').eq('underlying_symbol', idx).eq('expiry', nearestExpiry).order('strike_price', { ascending: true });
        if (opts && opts.length > 0) {
          return {
            name: `${idx} Options`,
            instruments: opts.map((i: any) => ({
              name: `${i.underlying_symbol} ${i.strike_price} ${i.option_type}`, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`,
              price: 0, change: '0%', segment: `${i.exchange} - Options`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0
            }))
          };
        }
      }
      return null;
    }))).filter(Boolean);
    if (indexOptCats.length > 0) segments.push({ name: 'INDEX-OPT', icon: 'fa-chart-pie', subCategories: indexOptCats });

    // 3. Mcx-FUT & Mcx-OPT
    const commodities = ['CRUDEOIL', 'GOLD', 'SILVER', 'NATURALGAS'];
    const mcxFutCats = [];
    const mcxOptCats = [];
    
    await Promise.all(commodities.map(async (cmd) => {
       // FUT
       const { data: futs } = await supabase.from('instruments').select('*').eq('name', cmd).in('instrument_type', ['FUTCOM', 'FUT', 'MAPPED_FUT']).gte('expiry', today).order('expiry', { ascending: true }).limit(2);
       if (futs && futs.length > 0) {
         mcxFutCats.push({
           name: cmd,
           instruments: futs.map((i: any) => ({ name: i.tradingsymbol, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`, price: 0, change: '0%', segment: `${i.exchange} - Futures`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0 }))
         });
       }
       // OPT
       const { data: expData } = await supabase.rpc('get_option_expiries', { p_symbol: cmd, p_min_date: today });
       if (expData && expData.length > 0) {
         const nearestExpiry = expData[0].expiry;
         const { data: opts } = await supabase.from('instruments').select('*').eq('underlying_symbol', cmd).eq('expiry', nearestExpiry).order('strike_price', { ascending: true });
         if (opts && opts.length > 0) {
           mcxOptCats.push({
             name: cmd,
             instruments: opts.map((i: any) => ({ name: `${i.underlying_symbol} ${i.strike_price} ${i.option_type}`, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`, price: 0, change: '0%', segment: `${i.exchange} - Options`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0 }))
           });
         }
       }
    }));
    
    if (mcxFutCats.length > 0) segments.push({ name: 'MCX-FUT', icon: 'fa-oil-well', subCategories: mcxFutCats });
    if (mcxOptCats.length > 0) segments.push({ name: 'MCX-OPT', icon: 'fa-oil-well', subCategories: mcxOptCats });

    // 4. Stock-FUT, Stock-OPT, Nse-EQ
    const topStocks = ['RELIANCE', 'HDFCBANK', 'ICICIBANK', 'INFY', 'ITC', 'TCS', 'LT', 'BHARTIARTL', 'SBIN', 'BAJFINANCE', 'AXISBANK', 'KOTAKBANK', 'M&M', 'TATAMOTORS', 'MARUTI', 'SUNPHARMA', 'ASIANPAINT', 'HCLTECH', 'TITAN', 'ULTRACEMCO'];
    const stockFutCats = [];
    const stockOptCats = [];
    const nseEqCats = [];
    
    await Promise.all(topStocks.map(async (stk) => {
      // FUT
      const { data: futs } = await supabase.from('instruments').select('*').eq('name', stk).in('instrument_type', ['FUTSTK', 'FUT', 'MAPPED_FUT']).gte('expiry', today).order('expiry', { ascending: true }).limit(2);
      if (futs && futs.length > 0) {
         stockFutCats.push({
           name: stk,
           instruments: futs.map((i: any) => ({ name: i.tradingsymbol, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`, price: 0, change: '0%', segment: `${i.exchange} - Futures`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0 }))
         });
      }
      // OPT
      const { data: expData } = await supabase.rpc('get_option_expiries', { p_symbol: stk, p_min_date: today });
      if (expData && expData.length > 0) {
        const nearestExpiry = expData[0].expiry;
        const { data: opts } = await supabase.from('instruments').select('*').eq('underlying_symbol', stk).eq('expiry', nearestExpiry).order('strike_price', { ascending: true });
        if (opts && opts.length > 0) {
           stockOptCats.push({
             name: stk,
             instruments: opts.map((i: any) => ({ name: `${i.underlying_symbol} ${i.strike_price} ${i.option_type}`, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`, price: 0, change: '0%', segment: `${i.exchange} - Options`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0 }))
           });
        }
      }
      // EQ
      const { data: eq } = await supabase.from('instruments').select('*').eq('instrument_type', 'EQ').eq('tradingsymbol', stk).limit(1);
      if (eq && eq.length > 0) {
         nseEqCats.push({
           name: stk,
           instruments: eq.map((i: any) => ({ name: `${i.tradingsymbol} (EQ)`, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`, price: 0, change: '0%', segment: `${i.exchange} - Equity`, contractDate: '', open: 0, high: 0, low: 0, close: 0 }))
         });
      }
    }));
    
    if (stockFutCats.length > 0) segments.push({ name: 'STOCK-FUT', icon: 'fa-building', subCategories: stockFutCats });
    if (stockOptCats.length > 0) segments.push({ name: 'STOCK-OPT', icon: 'fa-building', subCategories: stockOptCats });
    if (nseEqCats.length > 0) segments.push({ name: 'NSE-EQ', icon: 'fa-building', subCategories: nseEqCats });

    // 5. Crypto
    const { data: cryptos } = await supabase.from('instruments').select('*').eq('segment', 'CRYPTO').order('name', { ascending: true });
    if (cryptos && cryptos.length > 0) {
      const uniqueCryptos = new Map();
      cryptos.forEach((c: any) => {
        if (!uniqueCryptos.has(c.tradingsymbol) || c.id === c.tradingsymbol) {
          uniqueCryptos.set(c.tradingsymbol, c);
        }
      });
      segments.push({
        name: 'Crypto',
        icon: 'fa-bitcoin',
        instruments: Array.from(uniqueCryptos.values()).map((i: any) => ({
          name: i.tradingsymbol, symbol: i.tradingsymbol, kiteSymbol: i.id,
          price: 0, change: '0%', segment: 'CRYPTO', contractDate: '', open: 0, high: 0, low: 0, close: 0
        }))
      });
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

    // 7. Forex
    const currencies = ['USDINR', 'EURINR', 'GBPINR', 'JPYINR'];
    const forexCats = [];
    
    await Promise.all(currencies.map(async (curr) => {
       const { data: futs } = await supabase.from('instruments').select('*').eq('name', curr).in('instrument_type', ['FUTCUR', 'FUT', 'MAPPED_FUT']).gte('expiry', today).order('expiry', { ascending: true }).limit(2);
       const { data: expData } = await supabase.rpc('get_option_expiries', { p_symbol: curr, p_min_date: today });
       let opts: any[] | null = null;
       if (expData && expData.length > 0) {
         const nearestExpiry = expData[0].expiry;
         const { data } = await supabase.from('instruments').select('*').eq('underlying_symbol', curr).eq('expiry', nearestExpiry).order('strike_price', { ascending: true });
         opts = data;
       }
       const catInstruments = [];
       if (futs) futs.forEach((i: any) => catInstruments.push({ name: i.tradingsymbol, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`, price: 0, change: '0%', segment: `${i.exchange} - Futures`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0 }));
       if (opts) opts.forEach((i: any) => catInstruments.push({ name: `${i.underlying_symbol} ${i.strike_price} ${i.option_type}`, symbol: i.tradingsymbol, kiteSymbol: `${i.exchange}:${i.tradingsymbol}`, price: 0, change: '0%', segment: `${i.exchange} - Options`, contractDate: i.expiry, open: 0, high: 0, low: 0, close: 0 }));
       if (catInstruments.length > 0) forexCats.push({ name: curr, instruments: catInstruments });
    }));
    
    if (forexCats.length > 0) segments.push({ name: 'FOREX', icon: 'fa-coins', subCategories: forexCats });

    return NextResponse.json({ segments });
  } catch (error: any) {
    console.error('Library API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
