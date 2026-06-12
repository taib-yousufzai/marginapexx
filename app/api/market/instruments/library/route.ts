import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // We will build a dynamic tree instead of hardcoded
    const segments: any[] = [];
    
    // 1. INDEX - FUTURE
    const { data: indexFuts } = await supabase
      .from('instruments')
      .select('tradingsymbol, name, exchange, instrument_type, segment, expiry')
      .in('name', ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'])
      .in('instrument_type', ['FUTIDX'])
      .gte('expiry', today)
      .order('expiry', { ascending: true })
      .limit(30);
      
    if (indexFuts && indexFuts.length > 0) {
      // Group by earliest expiry
      const earliestExpiries = new Map();
      indexFuts.forEach(f => {
        if (!earliestExpiries.has(f.name) || f.expiry < earliestExpiries.get(f.name).expiry) {
          earliestExpiries.set(f.name, f);
        }
      });
      segments.push({
        name: 'INDEX - FUTURE',
        icon: 'fa-chart-line',
        instruments: Array.from(earliestExpiries.values()).map(i => ({
          name: i.tradingsymbol,
          symbol: i.tradingsymbol,
          kiteSymbol: `${i.exchange}:${i.tradingsymbol}`,
          price: 0, change: '0%',
          segment: `${i.exchange} - Futures`,
          contractDate: i.expiry,
          open: 0, high: 0, low: 0, close: 0
        }))
      });
    }

    // 2. INDEX - OPTIONS (Nearest Expiry)
    const subCategories: any[] = [];
    const indexes = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'];
    
    for (const idx of indexes) {
      // Find nearest expiry for this index
      const { data: expData } = await supabase.rpc('get_option_expiries', { p_symbol: idx, p_min_date: today });
      if (expData && expData.length > 0) {
        const nearestExpiry = expData[0].expiry;
        
        // Fetch strikes for this expiry
        const { data: opts } = await supabase
          .from('instruments')
          .select('tradingsymbol, name, exchange, instrument_type, strike_price, option_type, expiry, underlying_symbol')
          .eq('underlying_symbol', idx)
          .eq('expiry', nearestExpiry)
          .order('strike_price', { ascending: true });
          
        if (opts && opts.length > 0) {
          subCategories.push({
            name: `${idx} Options (${nearestExpiry})`,
            instruments: opts.map(i => ({
              name: `${i.underlying_symbol} ${i.strike_price} ${i.option_type}`,
              symbol: i.tradingsymbol,
              kiteSymbol: `${i.exchange}:${i.tradingsymbol}`,
              price: 0, change: '0%',
              segment: `${i.exchange} - Options`,
              contractDate: i.expiry,
              open: 0, high: 0, low: 0, close: 0
            }))
          });
        }
      }
    }
    
    if (subCategories.length > 0) {
      segments.push({
        name: 'INDEX - OPTIONS',
        icon: 'fa-chart-gantt',
        subCategories
      });
    }

    // 3. STOCKS - FUTURE
    const { data: stockFuts } = await supabase
      .from('instruments')
      .select('tradingsymbol, name, exchange, instrument_type, segment, expiry')
      .eq('instrument_type', 'FUTSTK')
      .gte('expiry', today)
      .order('expiry', { ascending: true })
      .limit(100);
      
    if (stockFuts && stockFuts.length > 0) {
      const earliestStockExpiries = new Map();
      stockFuts.forEach(f => {
        if (!earliestStockExpiries.has(f.name) || f.expiry < earliestStockExpiries.get(f.name).expiry) {
          earliestStockExpiries.set(f.name, f);
        }
      });
      segments.push({
        name: 'STOCKS - FUTURE',
        icon: 'fa-building',
        instruments: Array.from(earliestStockExpiries.values()).slice(0, 30).map(i => ({
          name: i.tradingsymbol,
          symbol: i.tradingsymbol,
          kiteSymbol: `${i.exchange}:${i.tradingsymbol}`,
          price: 0, change: '0%',
          segment: `${i.exchange} - Futures`,
          contractDate: i.expiry,
          open: 0, high: 0, low: 0, close: 0
        }))
      });
    }
    
    return NextResponse.json({ segments });
  } catch (error: any) {
    console.error('Library API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
