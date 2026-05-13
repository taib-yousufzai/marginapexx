import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let symbol = (searchParams.get('symbol') || 'NIFTY').toUpperCase();
    if (symbol === 'MIDCAP') symbol = 'MIDCPNIFTY';
    const expiry = searchParams.get('expiry');
    const today = new Date().toISOString().split('T')[0];
    
    // 1. Fetch available expiries for this symbol (we always need this for the tabs)
    const expiriesQuery = supabase
      .from('instruments')
      .select('expiry')
      .eq('underlying_symbol', symbol)
      .not('expiry', 'is', null)
      .gte('expiry', today)
      .order('expiry', { ascending: true });

    // 2. Fetch options for the selected expiry (if known)
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

    const [expiriesRes, optionsRes] = await Promise.all([
      expiriesQuery,
      optionsPromise || Promise.resolve({ data: null, error: null })
    ]);

    if (expiriesRes.error) throw expiriesRes.error;
    
    const uniqueExpiries = Array.from(new Set(expiriesRes.data.map((e: any) => e.expiry)));
    const selectedExpiry = expiry || uniqueExpiries[0];

    let options = optionsRes?.data;

    // 3. If no expiry was provided, we had to wait for uniqueExpiries[0] and fetch now
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

    // 4. Group by strike price
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

    return NextResponse.json({
      success: true,
      symbol,
      expiry: selectedExpiry,
      expiries: uniqueExpiries,
      strikes: sortedStrikes
    });
  } catch (error: any) {
    console.error('[Option Chain API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
