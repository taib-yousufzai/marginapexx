import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';

// Ensure this route is always dynamically executed
export const dynamic = 'force-dynamic';
// Allow up to 60 seconds (requires Vercel Pro, but Hobby will stop at 10s-15s)
export const maxDuration = 60;

// Initialize admin client to bypass RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function GET(request: Request) {
  try {
    // 1. Verify cron secret to protect the endpoint
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');
    if (secret !== process.env.AUTOLOGIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Fetch the NSE instruments CSV from Zerodha
    console.log('[Sync Instruments] Fetching from Zerodha...');
    const res = await fetch('https://api.kite.trade/instruments/NSE');
    if (!res.ok) {
      throw new Error(`Failed to fetch instruments: ${res.statusText}`);
    }

    const csvData = await res.text();

    // 3. Parse CSV
    console.log('[Sync Instruments] Parsing CSV...');
    const parsed = Papa.parse(csvData, {
      header: true,
      skipEmptyLines: true,
    });

    if (parsed.errors.length > 0) {
      console.warn('[Sync Instruments] CSV Parsing errors:', parsed.errors[0]);
    }

    // 4. Filter for Equity instruments only and map to our schema
    const instruments = parsed.data
      .filter((row: any) => row.instrument_type === 'EQ' && row.segment === 'NSE')
      .map((row: any) => ({
        id: `NSE:${row.tradingsymbol}`,
        instrument_token: parseInt(row.instrument_token, 10),
        tradingsymbol: row.tradingsymbol,
        name: row.name,
        exchange: row.exchange,
        instrument_type: row.instrument_type,
        segment: row.segment,
      }));

    console.log(`[Sync Instruments] Found ${instruments.length} NSE EQ instruments.`);

    // 5. Bulk Upsert to Supabase
    if (instruments.length > 0) {
      // Chunk upserts in case of Supabase limits (usually 10k is fine, but 1000 is safer)
      const chunkSize = 1000;
      for (let i = 0; i < instruments.length; i += chunkSize) {
        const chunk = instruments.slice(i, i + chunkSize);
        const { error } = await supabase
          .from('instruments')
          .upsert(chunk, { onConflict: 'id' });

        if (error) {
          throw new Error(`Supabase Upsert Error: ${error.message}`);
        }
      }
      console.log('[Sync Instruments] Successfully upserted all instruments.');
    }

    return NextResponse.json({
      success: true,
      count: instruments.length,
      message: 'Instruments synced successfully',
    });
  } catch (error: any) {
    console.error('[Sync Instruments] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
