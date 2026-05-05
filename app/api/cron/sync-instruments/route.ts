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

    // 2. Fetch ALL instruments CSV from Zerodha
    console.log('[Sync Instruments] Fetching from Zerodha...');
    const res = await fetch('https://api.kite.trade/instruments');
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

    // 4. Map instruments and find front-month futures
    const finalInstruments: any[] = [];
    
    // a. Add standard NSE Equities
    const nseEquities = parsed.data.filter((row: any) => row.instrument_type === 'EQ' && row.segment === 'NSE');
    for (const row of nseEquities as any[]) {
      finalInstruments.push({
        id: `NSE:${row.tradingsymbol}`,
        instrument_token: parseInt(row.instrument_token, 10),
        tradingsymbol: row.tradingsymbol,
        name: row.name,
        exchange: row.exchange,
        instrument_type: row.instrument_type,
        segment: row.segment,
      });
    }

    // b. Group futures by exchange+name to find the earliest expiry (front-month)
    // We strictly filter for monthly contracts (they contain JAN, FEB, etc. in their tradingsymbol)
    const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const futures = parsed.data.filter((row: any) => 
      (row.segment === 'MCX-FUT' || row.segment === 'CDS-FUT') && 
      (row.instrument_type === 'FUT' || row.instrument_type === 'FUTCOM' || row.instrument_type === 'FUTCUR') &&
      MONTHS.some(m => row.tradingsymbol.includes(m))
    );
    
    const groups: Record<string, any[]> = {};
    for (const row of futures as any[]) {
      const key = `${row.exchange}:${row.name}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }

    // Create pseudo-instruments for the generic name mapped to the front-month contract
    for (const [groupKey, contracts] of Object.entries(groups)) {
      // Sort by expiry ascending
      contracts.sort((a, b) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
      const frontMonth = contracts[0];
      
      finalInstruments.push({
        id: groupKey, // e.g. MCX:CRUDEOIL
        instrument_token: parseInt(frontMonth.instrument_token, 10),
        tradingsymbol: frontMonth.tradingsymbol, // e.g. CRUDEOIL24NOVFUT
        name: frontMonth.name,
        exchange: frontMonth.exchange,
        instrument_type: 'MAPPED_FUT',
        segment: frontMonth.segment,
      });
    }

    console.log(`[Sync Instruments] Found ${nseEquities.length} NSE EQ and mapped ${Object.keys(groups).length} futures.`);

    // 5. Bulk Upsert to Supabase
    if (finalInstruments.length > 0) {
      // Chunk upserts in case of Supabase limits
      const chunkSize = 1000;
      for (let i = 0; i < finalInstruments.length; i += chunkSize) {
        const chunk = finalInstruments.slice(i, i + chunkSize);
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
      count: finalInstruments.length,
      message: 'Instruments synced successfully',
    });
  } catch (error: any) {
    console.error('[Sync Instruments] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
