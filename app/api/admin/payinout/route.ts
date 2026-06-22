/**
 * GET /api/admin/payinout
 *
 * Returns a filtered, paginated list of pay requests for admin review.
 * Supports filtering by type, status, date range, and exact search on user_id or id.
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 19.1
 */

import { requireAdmin } from '../_auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PayRequest = {
  id: string;
  user_id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  account_name: string | null;
  account_no: string | null;
  ifsc: string | null;
  upi: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Parse query params
    const url = new URL(request.url);
    const type = url.searchParams.get('type') ?? null;
    const status = url.searchParams.get('status') ?? null;
    const dateFrom = url.searchParams.get('date_from') ?? null;
    const dateTo = url.searchParams.get('date_to') ?? null;
    const search = url.searchParams.get('search') ?? null;
    const pageParam = url.searchParams.get('page') ?? null;
    const rowsParam = url.searchParams.get('rows') ?? null;

    // Fetch all profiles to build a lookup map for user names and client_ids
    const { data: profiles } = await adminClient.from('profiles').select('id, email, full_name, client_id');
    const profileMap: Record<string, { full_name: string; email: string; client_id: string }> = {};
    (profiles ?? []).forEach((p: any) => { profileMap[p.id] = p; });

    // Step 3: Build Supabase query ordered by created_at descending
    let query = adminClient
      .from('pay_requests')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply type filter
    if (type) {
      query = query.eq('type', type);
    }

    // Apply status filter
    if (status) {
      query = query.eq('status', status);
    }

    // Apply date_from filter
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }

    // Apply date_to filter
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    // NOTE: Search is now done client-side after merging profiles so we can
    // match by name, client_id, user_id, or request id.

    // Apply offset-based pagination (without search — pagination applied after search filter below)
    // We skip server-side pagination when search is active so we can filter by name/client_id first.
    if (!search && pageParam && rowsParam) {
      const page = parseInt(pageParam, 10);
      const rows = parseInt(rowsParam, 10);
      if (!isNaN(page) && !isNaN(rows) && page >= 1 && rows >= 1) {
        const offset = (page - 1) * rows;
        query = query.range(offset, offset + rows - 1);
      }
    }

    const { data, error } = await query;

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Merge profile info into each request
    let merged = (data ?? []).map((r: any) => ({
      ...r,
      user_name: profileMap[r.user_id]?.full_name || profileMap[r.user_id]?.email || r.user_id,
      user_client_id: profileMap[r.user_id]?.client_id || '',
    }));

    // Apply search filter across name, client_id, user_id, and request id
    if (search) {
      const q = search.toLowerCase();
      merged = merged.filter((r: any) =>
        r.user_name.toLowerCase().includes(q) ||
        r.user_client_id.toLowerCase().includes(q) ||
        r.user_id.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
      );
    }

    return Response.json(merged, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
