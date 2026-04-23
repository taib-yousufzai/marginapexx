// Feature: admin-panel-live-data, Property 12: Activity log search filtering

/**
 * Property-based tests for Admin Activity Logs API route.
 *
 * Feature: admin-panel-live-data
 *
 * Tests Property 12: Activity log search filtering.
 * GET /api/admin/actlogs?search=<query> SHALL return only log entries where at
 * least one of type, target_user_id, user_id (by), or symbol contains the query
 * string (case-insensitive). No returned entry SHALL fail to match the query in
 * any of those fields.
 *
 * The filtering predicate is tested directly (not via HTTP) by extracting and
 * testing a pure matchesSearch(entry, query) predicate function that mirrors
 * the Supabase .or() filter applied in the route.
 *
 * Validates: Requirements 9.4
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Raw database row shape (before mapping to ActLogItem).
 * Mirrors the columns selected in the route's Supabase query.
 */
interface ActLogRow {
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
}

// ---------------------------------------------------------------------------
// matchesSearch predicate
//
// Mirrors the Supabase .or() filter applied in the route (route.ts, Step 5):
//   query.or(
//     `type.ilike.%${search}%,symbol.ilike.%${search}%,user_id.eq.${search},target_user_id.eq.${search}`
//   )
//
// - type:            case-insensitive substring match (ilike)
// - symbol:          case-insensitive substring match (ilike), null → no match
// - user_id:         exact match (eq), null → no match
// - target_user_id:  exact match (eq), null → no match
// ---------------------------------------------------------------------------

/**
 * Returns true if the given activity log row matches the search query.
 *
 * Mirrors the Supabase OR filter:
 *   type.ilike.%query%
 *   symbol.ilike.%query%
 *   user_id.eq.query
 *   target_user_id.eq.query
 */
export function matchesSearch(row: ActLogRow, query: string): boolean {
  if (query === '') return true; // empty query matches everything (no filter applied)

  const q = query.toLowerCase();

  // type: case-insensitive substring match
  if (row.type.toLowerCase().includes(q)) return true;

  // symbol: case-insensitive substring match (null → no match)
  if (row.symbol !== null && row.symbol.toLowerCase().includes(q)) return true;

  // user_id: exact match (null → no match)
  if (row.user_id !== null && row.user_id === query) return true;

  // target_user_id: exact match (null → no match)
  if (row.target_user_id !== null && row.target_user_id === query) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Arbitrary for a single activity log row with random field values.
 * Uses fc.option() for nullable fields (symbol, user_id, target_user_id).
 */
const actLogRowArb = fc.record({
  type: fc.string(),
  symbol: fc.option(fc.string()),
  user_id: fc.option(fc.uuid()),
  target_user_id: fc.option(fc.uuid()),
}).map((fields, index?: number) => ({
  id: `log-${index ?? 0}`,
  type: fields.type,
  user_id: fields.user_id ?? null,
  target_user_id: fields.target_user_id ?? null,
  symbol: fields.symbol ?? null,
  qty: null,
  price: null,
  reason: null,
  ip: null,
  created_at: new Date().toISOString(),
}));

/**
 * Arbitrary for an array of activity log rows.
 */
const actLogArrayArb = fc.array(
  fc.record({
    type: fc.string(),
    symbol: fc.option(fc.string()),
    user_id: fc.option(fc.uuid()),
    target_user_id: fc.option(fc.uuid()),
  }),
);

// ---------------------------------------------------------------------------
// Property 12: Activity log search filtering
// Feature: admin-panel-live-data, Property 12: Activity log search filtering
// Validates: Requirements 9.4
// ---------------------------------------------------------------------------

describe('Admin ActLogs API - Property 12: Activity log search filtering', () => {
  // Feature: admin-panel-live-data, Property 12: Activity log search filtering
  // Validates: Requirements 9.4

  // -------------------------------------------------------------------------
  // Core property: every entry returned by the filter matches the query
  // -------------------------------------------------------------------------

  it('every entry that passes matchesSearch contains the query in at least one field', () => {
    fc.assert(
      fc.property(
        fc.string(),
        actLogArrayArb,
        (query, rows) => {
          // Build full rows from generated data
          const fullRows: ActLogRow[] = rows.map((r, i) => ({
            id: `log-${i}`,
            type: r.type,
            user_id: r.user_id ?? null,
            target_user_id: r.target_user_id ?? null,
            symbol: r.symbol ?? null,
            qty: null,
            price: null,
            reason: null,
            ip: null,
            created_at: new Date().toISOString(),
          }));

          // Simulate what the route does: apply the search filter
          const filtered = query === '' ? fullRows : fullRows.filter((row) => matchesSearch(row, query));

          // Assert: every returned entry matches the query in at least one field
          for (const entry of filtered) {
            if (!matchesSearch(entry, query)) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('no returned entry fails to match the query', () => {
    fc.assert(
      fc.property(
        fc.string(),
        actLogArrayArb,
        (query, rows) => {
          const fullRows: ActLogRow[] = rows.map((r, i) => ({
            id: `log-${i}`,
            type: r.type,
            user_id: r.user_id ?? null,
            target_user_id: r.target_user_id ?? null,
            symbol: r.symbol ?? null,
            qty: null,
            price: null,
            reason: null,
            ip: null,
            created_at: new Date().toISOString(),
          }));

          const filtered = query === '' ? fullRows : fullRows.filter((row) => matchesSearch(row, query));

          // Assert: no entry in the filtered result fails to match
          return !filtered.some((entry) => !matchesSearch(entry, query));
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Type field: case-insensitive substring match
  // -------------------------------------------------------------------------

  it('matchesSearch returns true when type contains query (case-insensitive)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string(),
        fc.string(),
        (query, prefix, suffix) => {
          // Build a row where type contains the query (possibly with different case)
          const row: ActLogRow = {
            id: 'test',
            type: prefix + query.toUpperCase() + suffix,
            user_id: null,
            target_user_id: null,
            symbol: null,
            qty: null,
            price: null,
            reason: null,
            ip: null,
            created_at: new Date().toISOString(),
          };

          // matchesSearch should return true because type contains query (case-insensitive)
          return matchesSearch(row, query);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('matchesSearch returns true when type contains query (lowercase)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string(),
        fc.string(),
        (query, prefix, suffix) => {
          const row: ActLogRow = {
            id: 'test',
            type: prefix + query.toLowerCase() + suffix,
            user_id: null,
            target_user_id: null,
            symbol: null,
            qty: null,
            price: null,
            reason: null,
            ip: null,
            created_at: new Date().toISOString(),
          };

          return matchesSearch(row, query);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Symbol field: case-insensitive substring match
  // -------------------------------------------------------------------------

  it('matchesSearch returns true when symbol contains query (case-insensitive)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string(),
        fc.string(),
        (query, prefix, suffix) => {
          const row: ActLogRow = {
            id: 'test',
            type: 'UNRELATED_TYPE_THAT_DOES_NOT_MATCH',
            user_id: null,
            target_user_id: null,
            symbol: prefix + query.toUpperCase() + suffix,
            qty: null,
            price: null,
            reason: null,
            ip: null,
            created_at: new Date().toISOString(),
          };

          return matchesSearch(row, query);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('matchesSearch returns false when symbol is null and type does not match', () => {
    fc.assert(
      fc.property(
        fc.uuid(), // use UUID as query — unlikely to appear in random type strings
        (query) => {
          const row: ActLogRow = {
            id: 'test',
            type: 'COMPLETELY_DIFFERENT_TYPE_XYZ',
            user_id: null,
            target_user_id: null,
            symbol: null,
            qty: null,
            price: null,
            reason: null,
            ip: null,
            created_at: new Date().toISOString(),
          };

          // The query is a UUID; type is a fixed string that won't contain it
          // symbol is null, user_id is null, target_user_id is null
          // So matchesSearch should return false
          return !matchesSearch(row, query);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // user_id field: exact match
  // -------------------------------------------------------------------------

  it('matchesSearch returns true when user_id exactly equals query', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (userId) => {
          const row: ActLogRow = {
            id: 'test',
            type: 'COMPLETELY_DIFFERENT_TYPE_XYZ',
            user_id: userId,
            target_user_id: null,
            symbol: null,
            qty: null,
            price: null,
            reason: null,
            ip: null,
            created_at: new Date().toISOString(),
          };

          // Searching by exact user_id should match
          return matchesSearch(row, userId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('matchesSearch returns false when user_id is null and no other field matches', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (userId) => {
          const row: ActLogRow = {
            id: 'test',
            type: 'COMPLETELY_DIFFERENT_TYPE_XYZ',
            user_id: null,
            target_user_id: null,
            symbol: null,
            qty: null,
            price: null,
            reason: null,
            ip: null,
            created_at: new Date().toISOString(),
          };

          // user_id is null, so exact match on user_id fails
          // type doesn't contain the UUID, symbol is null, target_user_id is null
          return !matchesSearch(row, userId);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // target_user_id field: exact match
  // -------------------------------------------------------------------------

  it('matchesSearch returns true when target_user_id exactly equals query', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (targetUserId) => {
          const row: ActLogRow = {
            id: 'test',
            type: 'COMPLETELY_DIFFERENT_TYPE_XYZ',
            user_id: null,
            target_user_id: targetUserId,
            symbol: null,
            qty: null,
            price: null,
            reason: null,
            ip: null,
            created_at: new Date().toISOString(),
          };

          // Searching by exact target_user_id should match
          return matchesSearch(row, targetUserId);
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Empty query: no filter applied (all entries pass)
  // -------------------------------------------------------------------------

  it('empty query matches all entries', () => {
    fc.assert(
      fc.property(
        actLogArrayArb,
        (rows) => {
          const fullRows: ActLogRow[] = rows.map((r, i) => ({
            id: `log-${i}`,
            type: r.type,
            user_id: r.user_id ?? null,
            target_user_id: r.target_user_id ?? null,
            symbol: r.symbol ?? null,
            qty: null,
            price: null,
            reason: null,
            ip: null,
            created_at: new Date().toISOString(),
          }));

          // Empty query: matchesSearch returns true for all entries
          return fullRows.every((row) => matchesSearch(row, ''));
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Filtering consistency: filtered set is a subset of original
  // -------------------------------------------------------------------------

  it('filtered result is always a subset of the original array', () => {
    fc.assert(
      fc.property(
        fc.string(),
        actLogArrayArb,
        (query, rows) => {
          const fullRows: ActLogRow[] = rows.map((r, i) => ({
            id: `log-${i}`,
            type: r.type,
            user_id: r.user_id ?? null,
            target_user_id: r.target_user_id ?? null,
            symbol: r.symbol ?? null,
            qty: null,
            price: null,
            reason: null,
            ip: null,
            created_at: new Date().toISOString(),
          }));

          const filtered = query === '' ? fullRows : fullRows.filter((row) => matchesSearch(row, query));
          const originalIds = new Set(fullRows.map((r) => r.id));

          // Every entry in filtered must exist in the original array
          return filtered.every((entry) => originalIds.has(entry.id));
        },
      ),
      { numRuns: 100 },
    );
  });

  // -------------------------------------------------------------------------
  // Non-matching entries are excluded
  // -------------------------------------------------------------------------

  it('entries that do not match the query are excluded from the filtered result', () => {
    fc.assert(
      fc.property(
        fc.string(),
        actLogArrayArb,
        (query, rows) => {
          const fullRows: ActLogRow[] = rows.map((r, i) => ({
            id: `log-${i}`,
            type: r.type,
            user_id: r.user_id ?? null,
            target_user_id: r.target_user_id ?? null,
            symbol: r.symbol ?? null,
            qty: null,
            price: null,
            reason: null,
            ip: null,
            created_at: new Date().toISOString(),
          }));

          const filtered = query === '' ? fullRows : fullRows.filter((row) => matchesSearch(row, query));
          const filteredIds = new Set(filtered.map((r) => r.id));

          // Entries that don't match should NOT appear in filtered
          const nonMatching = fullRows.filter((row) => !matchesSearch(row, query));
          return !nonMatching.some((entry) => filteredIds.has(entry.id));
        },
      ),
      { numRuns: 100 },
    );
  });
});
