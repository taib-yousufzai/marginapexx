import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function GET() {
  try {
    const todayStr = new Date().toISOString().split('T')[0];
    
    // Fetch expiries for options only
    const { data, error } = await supabase
      .from('instruments')
      .select('name, expiry')
      .in('name', ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX', 'BANKEX'])
      .in('exchange', ['NFO', 'BFO'])
      .in('option_type', ['CE', 'PE'])
      .not('expiry', 'is', null)
      .gte('expiry', todayStr)
      .order('expiry', { ascending: true });

    if (error) throw error;

    const earliest: Record<string, string> = {};
    if (data) {
      const now = new Date();
      const marketClose = new Date();
      marketClose.setHours(15, 30, 0, 0);

      for (const row of data) {
        if (!row.expiry) continue;
        const expDate = new Date(row.expiry);
        const isToday = expDate.getDate() === now.getDate() && expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
        
        if (isToday && now > marketClose) {
          continue; // Skip today's expiry if market is closed
        }
        if (!earliest[row.name]) {
          earliest[row.name] = row.expiry;
        }
      }
    }

    return NextResponse.json({ success: true, expiries: earliest });
  } catch (err: any) {
    console.error('[market/expiries] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
