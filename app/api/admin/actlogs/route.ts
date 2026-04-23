/**
 * GET /api/admin/actlogs
 *
 * Returns activity log entries with optional date range filtering, search,
 * pagination, and CSV export.
 *
 * Validates: Requirements 9.1–9.6, 12.1–12.6
 */

import { requireAdmin } from '../_auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActLogItem = {
  id: string;
  type: string;
  time: string; // mapped from created_at
  by: string; // mapped from user_id
  target: string; // mapped from target_user_id
  symbol: string | null;
  qty: number | null;
  price: number | null;
  reason: string | null;
  ip: string;
};

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

/**
 * Escapes a CSV field value by wrapping in quotes if it contains commas,
 * quotes, or newlines.
 */
function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts an array of ActLogItem to a CSV string with headers.
 */
function toCsv(items: ActLogItem[]): string {
  const headers = ['id', 'type', 'time', 'by', 'target', 'symbol', 'qty', 'price', 'reason', 'ip'];
  const rows = items.map((item) =>
    [
      csvEscape(item.id),
      csvEscape(item.type),
      csvEscape(item.time),
      csvEscape(item.by),
      csvEscape(item.target),
      csvEscape(item.symbol),
      csvEscape(item.qty),
      csvEscape(item.price),
      csvEscape(item.reason),
      csvEscape(item.ip),
    ].join(','),
  );
  return [headers.join(','), ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<Response> {
  try {
    // Step 1: Authenticate and authorize the caller
    // Validates: Requirements 12.1–12.6
    const authResult = await requireAdmin(request);
    if (authResult instanceof Response) return authResult;
    const { adminClient } = authResult;

    // Step 2: Parse query params
    // Validates: Requirements 9.2, 9.6
    const url = new URL(request.url);
    const dateFrom = url.searchParams.get('date_from') ?? null;
    const dateTo = url.searchParams.get('date_to') ?? null;
    const search = url.searchParams.get('search') ?? null;
    const pageParam = url.searchParams.get('page') ?? null;
    const rowsParam = url.searchParams.get('rows') ?? null;
    const exportParam = url.searchParams.get('export') ?? null;

    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const rows = rowsParam ? parseInt(rowsParam, 10) : 50;

    // Step 3: Build base query
    // Validates: Requirements 9.3
    let query = adminClient
      .from('act_logs')
      .select('id, type, user_id, target_user_id, symbol, qty, price, reason, ip, created_at')
      .order('created_at', { ascending: false });

    // Step 4: Apply date range filter on created_at
    // Validates: Requirement 9.2
    if (dateFrom) {
      query = query.gte('created_at', dateFrom);
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo);
    }

    // Step 5: Apply search filter
    // ilike on type and symbol; exact match on user_id and target_user_id
    // Validates: Requirement 9.4
    if (search) {
      query = query.or(
        `type.ilike.%${search}%,symbol.ilike.%${search}%,user_id.eq.${search},target_user_id.eq.${search}`,
      );
    }

    // Step 6: Apply pagination (skip for CSV export to get all rows)
    // Validates: Requirement 9.2
    if (exportParam !== 'csv') {
      const from = (page - 1) * rows;
      const to = from + rows - 1;
      query = query.range(from, to);
    }

    const { data, error } = await query;

    if (error) {
      return Response.json({ error: 'Internal server error' }, { status: 500 });
    }

    // Step 7: Map database rows to ActLogItem[]
    // Validates: Requirement 9.5
    const logs: ActLogItem[] = (data ?? []).map(
      (row: {
        id: string;
        type: string;
        user_id: string | null;
        target_user_id: string | null;
        symbol: string | null;
        qty: number | null;
        price: number | null;
        reason: string | null;
        ip: string | null;
        created_at: string;
      }) => ({
        id: row.id,
        type: row.type,
        time: row.created_at,
        by: row.user_id ?? '',
        target: row.target_user_id ?? '',
        symbol: row.symbol,
        qty: row.qty,
        price: row.price,
        reason: row.reason,
        ip: row.ip ?? '',
      }),
    );

    // Step 8: Return CSV or JSON
    // Validates: Requirement 9.6
    if (exportParam === 'csv') {
      const csv = toCsv(logs);
      return new Response(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename=actlogs.csv',
        },
      });
    }

    return Response.json(logs, { status: 200 });
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
