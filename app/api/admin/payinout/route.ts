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
    // Validates: Requirements 5.1, 19.1
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Parse query params
    // Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
    const url = new URL(request.url);
    const type = url.searchParams.get('type') ?? null;
    const status = url.searchParams.get('status') ?? null;
    const dateFrom = url.searchParams.get('date_from') ?? null;
    const dateTo = url.searchParams.get('date_to') ?? null;
    const search = url.searchParams.get('search') ?? null;
    const pageParam = url.searchParams.get('page') ?? null;
    const rowsParam = url.searchParams.get('rows') ?? null;

    // Step 3: Build Supabase query ordered by created_at descending
    // Validates: Requirements 5.2
    let query = adminClient
      .from('pay_requests')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply type filter
    // Validates: Requirements 5.3
    if (type) {
      query = query.eq('type', type);
    }

    // Apply status filter
    // Validates: Requirements 5.4
    if (status) {
      query = query.eq('status', status);
    }

    // Apply date_from filter
    // Validates: Requirements 5.5
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }

    // Apply date_to filter
    // Validates: Requirements 5.6
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    // Apply search filter — exact match on user_id or id
    // Validates: Requirements 5.7
    if (search) {
      query = query.or('user_id.eq.' + search + ',id.eq.' + search);
    }

    // Apply offset-based pagination when both page and rows are provided
    // Validates: Requirements 5.8
    if (pageParam && rowsParam) {
      const page = parseInt(pageParam, 10);
      const rows = parseInt(rowsParam, 10);
      if (!isNaN(page) && !isNaN(rows) && page >= 1 && rows >= 1) {
        const offset = (page - 1) * rows;
        query = query.range(offset, offset + rows - 1);
      }
    }

    const { data, error } = await query;

    // Step 4: Return results or error
    // Validates: Requirements 5.9, 5.10
    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    return Response.json(data ?? [], { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
