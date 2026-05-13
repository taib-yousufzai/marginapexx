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
    
    // Normalize aliases
    if (symbol === 'MIDCAP') symbol = 'MIDCPNIFTY';
    
    const expiry = searchParams.get('expiry');

    const today = new Date().toISOString().split('T')[0];
    const { data: expiries, error: expiryError } = await supabase
      .from('instruments')
      .select('expiry')
      .eq('underlying_symbol', symbol)
      .not('expiry', 'is', null)
      .gte('expiry', today)
      .order('expiry', { ascending: true });

    if (expiryError) throw expiryError;

    const uniqueExpiries = Array.from(new Set(expiries.map(e => e.expiry)));
    const selectedExpiry = expiry || uniqueExpiries[0];

    if (!selectedExpiry) {
      return NextResponse.json({ 
        success: true, 
        expiries: [], 
        strikes: [],
        message: 'No options found for this symbol' 
      });
    }

    // 2. Fetch all options for the selected expiry
    const { data: options, error: optionsError } = await supabase
      .from('instruments')
      .select('*')
      .eq('underlying_symbol', symbol)
      .eq('expiry', selectedExpiry)
      .in('option_type', ['CE', 'PE'])
      .order('strike_price', { ascending: true });

    if (optionsError) throw optionsError;

    // 3. Group by strike price
    const strikeMap: Record<number, any> = {};
    options.forEach(opt => {
      const strike = opt.strike_price;
      if (!strikeMap[strike]) {
        strikeMap[strike] = { strike };
      }
      if (opt.option_type === 'CE') {
        strikeMap[strike].ce = {
          token: opt.instrument_token,
          symbol: opt.tradingsymbol,
          id: opt.id
        };
      } else {
        strikeMap[strike].pe = {
          token: opt.instrument_token,
          symbol: opt.tradingsymbol,
          id: opt.id
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
