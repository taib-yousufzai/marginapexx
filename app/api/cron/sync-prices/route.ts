import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSharedKiteSession } from '@/lib/kiteSession';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Extend Vercel timeout limits

// Initialize admin client to bypass RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Helper for waiting
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function GET(request: Request) {
  try {
    // 1. Verify cron secret
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    if (secret !== process.env.AUTOLOGIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Get active Kite session
    const session = await getSharedKiteSession();
    if (!session || !session.accessToken) {
      return NextResponse.json(
        { error: 'No active Kite session. Please login via Admin panel.' },
        { status: 400 }
      );
    }

    // 3. Fetch list of instruments to sync from database
    const { data: instruments, error: instError } = await supabaseAdmin
      .from('instruments')
      .select('id, tradingsymbol')
      .eq('segment', 'NSE')
      .eq('instrument_type', 'EQ');

    if (instError) throw instError;
    if (!instruments || instruments.length === 0) {
      return NextResponse.json({ error: 'No instruments found in database' }, { status: 404 });
    }

    console.log(`[Sync Prices] Found ${instruments.length} instruments to sync.`);

    // 4. Chunk into groups of 500 (Kite's max limit per quote request)
    const chunkSize = 500;
    const allQuotes: any[] = [];
    
    for (let i = 0; i < instruments.length; i += chunkSize) {
      const chunk = instruments.slice(i, i + chunkSize);
      // Format: i=NSE:INFY&i=NSE:RELIANCE
      const queryParams = chunk
        .map((inst) => `i=${encodeURIComponent(`NSE:${inst.tradingsymbol}`)}`)
        .join('&');

      const url = `https://api.kite.trade/quote?${queryParams}`;
      
      const res = await fetch(url, {
        headers: {
          'X-Kite-Version': '3',
          Authorization: `token ${process.env.KITE_API_KEY}:${session.accessToken}`,
        },
      });

      if (!res.ok) {
        console.error(`[Sync Prices] Kite API error on chunk ${i / chunkSize}: ${res.statusText}`);
        continue;
      }

      const json = await res.json();
      if (json.status === 'success' && json.data) {
        // Map Kite response format to our Supabase table format
        Object.keys(json.data).forEach((instrumentId) => {
          const q = json.data[instrumentId];
          allQuotes.push({
            id: instrumentId,
            last_price: q.last_price,
            open: q.ohlc?.open || 0,
            high: q.ohlc?.high || 0,
            low: q.ohlc?.low || 0,
            close: q.ohlc?.close || 0,
            volume: q.volume || 0,
            quote_timestamp: q.timestamp || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        });
      }

      // Kite strictly enforces 3 requests per second. Add 400ms delay between chunks.
      await delay(400);
    }

    // 5. Bulk Upsert into Supabase market_quotes
    if (allQuotes.length > 0) {
      // Upsert in chunks to respect Supabase payload size limits
      for (let i = 0; i < allQuotes.length; i += 1000) {
        const { error: upsertError } = await supabaseAdmin
          .from('market_quotes')
          .upsert(allQuotes.slice(i, i + 1000), { onConflict: 'id' });

        if (upsertError) throw upsertError;
      }
    }

    return NextResponse.json({
      success: true,
      synced: allQuotes.length,
      message: 'Prices synced successfully',
    });
  } catch (error: any) {
    console.error('[Sync Prices] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
