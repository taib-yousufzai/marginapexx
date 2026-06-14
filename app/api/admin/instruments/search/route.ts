/**
 * GET /api/admin/instruments/search?q=<query>&tab=<tab>
 *
 * Searches the instruments table for real market instruments.
 */

import { requireAdmin } from '../../_auth';
import {
  applyForexFilter,
  applyCryptoWhitelist,
  type Instrument,
} from '@/lib/filterEngine';

export async function GET(request: Request): Promise<Response> {
  try {
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');
    const tab = searchParams.get('tab');

    if (!query || query.length < 2) {
      return Response.json([], { status: 200 });
    }

    let dbQuery = adminClient
      .from('instruments')
      .select('id, tradingsymbol, exchange, name, instrument_type, segment')
      .or(`tradingsymbol.ilike.%${query}%,name.ilike.%${query}%`)
      .limit(150);

    // Optional: filter by tab mapping to segment/instrument_type
    if (tab === 'NSE-EQ') {
      dbQuery = dbQuery.eq('exchange', 'NSE').eq('instrument_type', 'EQ');
    } else if (tab === 'INDEX-FUT' || tab === 'STOCK-FUT' || tab === 'MCX-FUT') {
      dbQuery = dbQuery.in('instrument_type', ['FUT', 'MAPPED_FUT', 'FUTCOM', 'FUTCUR']);
    } else if (tab === 'INDEX-OPT' || tab === 'STOCK-OPT' || tab === 'MCX-OPT') {
      dbQuery = dbQuery.in('instrument_type', ['CE', 'PE']);
    }

    const { data, error } = await dbQuery;

    if (error) {
      console.error('[GET /api/admin/instruments/search] Error:', error);
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    let results: Instrument[] = (data ?? []) as Instrument[];

    // Apply production filtering rules so admin search reflects what traders see
    results = applyForexFilter(results);       // Requirement 1.1 — no Forex CE/PE
    results = applyCryptoWhitelist(results);   // Requirement 5.2 — BTC/ETH/DOGE only

    return Response.json(results, { status: 200 });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
