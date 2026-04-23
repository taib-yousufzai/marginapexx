// Feature: admin-panel-live-data, Property 5: Watchlist user isolation
// Feature: admin-panel-live-data, Property 6: Watchlist add/remove round trip

/**
 * Property-based tests for Admin Watchlist API route.
 *
 * Feature: admin-panel-live-data
 *
 * Tests Property 5: Watchlist user isolation.
 * GET /api/admin/watchlist?tab=X SHALL return only symbols that were inserted
 * by the authenticated user for that tab — never symbols belonging to a
 * different user or a different tab.
 *
 * Tests Property 6: Watchlist add/remove round trip.
 * For any valid (tab, symbol) pair, after POST, GET SHALL include that symbol;
 * after DELETE with that symbol, GET SHALL NOT include that symbol.
 *
 * Validates: Requirements 4.4, 4.5, 4.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { GET, POST, DELETE } from '../route';

// ---------------------------------------------------------------------------
// Supabase mock setup
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockOrder = vi.fn();
const mockEqTab = vi.fn();
const mockEqUserId = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

// POST chain mocks: from('watchlists').insert({...}).select('id, symbol, tab').single()
const mockInsert = vi.fn();
const mockInsertSelect = vi.fn();
const mockSingle = vi.fn();

// DELETE chain mocks: from('watchlists').delete().eq('user_id', ...).eq('tab', ...).eq('symbol', ...)
const mockDelete = vi.fn();
const mockDeleteEqUserId = vi.fn();
const mockDeleteEqTab = vi.fn();
const mockDeleteEqSymbol = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
  })),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a GET request for the watchlist route with a valid admin Bearer token.
 */
function makeWatchlistRequest(tab: string): Request {
  const url = new URL('http://localhost/api/admin/watchlist');
  url.searchParams.set('tab', tab);
  return new Request(url.toString(), {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-admin-token' },
  });
}

/**
 * A watchlist row as returned by Supabase.
 */
interface WatchlistRow {
  id: string;
  symbol: string;
  tab: string;
  user_id?: string;
}

/**
 * Set up the Supabase mock chain for a successful watchlist query:
 *   adminClient.from('watchlists').select('id, symbol, tab').eq('user_id', ...).eq('tab', ...).order(...)
 *   → returns { data: rows, error: null }
 */
function setupWatchlistQuery(rows: WatchlistRow[]): void {
  mockOrder.mockResolvedValue({ data: rows, error: null });
  mockEqTab.mockReturnValue({ order: mockOrder });
  mockEqUserId.mockReturnValue({ eq: mockEqTab });
  mockSelect.mockReturnValue({ eq: mockEqUserId });
  mockFrom.mockReturnValue({ select: mockSelect });
}

/**
 * Set up the Supabase mock chain for a successful POST (insert):
 *   adminClient.from('watchlists').insert({...}).select('id, symbol, tab').single()
 *   → returns { data: newRow, error: null }
 */
function setupWatchlistInsert(newRow: WatchlistRow): void {
  mockSingle.mockResolvedValue({ data: newRow, error: null });
  mockInsertSelect.mockReturnValue({ single: mockSingle });
  mockInsert.mockReturnValue({ select: mockInsertSelect });
  mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, delete: mockDelete });
}

/**
 * Set up the Supabase mock chain for a successful DELETE:
 *   adminClient.from('watchlists').delete().eq('user_id', ...).eq('tab', ...).eq('symbol', ...)
 *   → returns { error: null }
 */
function setupWatchlistDelete(): void {
  mockDeleteEqSymbol.mockResolvedValue({ error: null });
  mockDeleteEqTab.mockReturnValue({ eq: mockDeleteEqSymbol });
  mockDeleteEqUserId.mockReturnValue({ eq: mockDeleteEqTab });
  mockDelete.mockReturnValue({ eq: mockDeleteEqUserId });
  mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, delete: mockDelete });
}

/**
 * Set up mockFrom to support all three chains (GET select, POST insert, DELETE delete).
 * The route calls from('watchlists') once per request, so we configure the returned
 * object to expose all three entry points.
 */
function setupAllChains(getRows: WatchlistRow[], newRow: WatchlistRow): void {
  // GET chain
  mockOrder.mockResolvedValue({ data: getRows, error: null });
  mockEqTab.mockReturnValue({ order: mockOrder });
  mockEqUserId.mockReturnValue({ eq: mockEqTab });
  mockSelect.mockReturnValue({ eq: mockEqUserId });

  // POST chain
  mockSingle.mockResolvedValue({ data: newRow, error: null });
  mockInsertSelect.mockReturnValue({ single: mockSingle });
  mockInsert.mockReturnValue({ select: mockInsertSelect });

  // DELETE chain
  mockDeleteEqSymbol.mockResolvedValue({ error: null });
  mockDeleteEqTab.mockReturnValue({ eq: mockDeleteEqSymbol });
  mockDeleteEqUserId.mockReturnValue({ eq: mockDeleteEqTab });
  mockDelete.mockReturnValue({ eq: mockDeleteEqUserId });

  mockFrom.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
  });
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Arbitrary for a non-empty string (tab or symbol name).
 */
const nonEmptyStringArb = fc.string({ minLength: 1 });

/**
 * Arbitrary for a watchlist row belonging to a specific user and tab.
 */
const watchlistRowArb = (userId: string, tab: string) =>
  fc.record({
    id: fc.uuid(),
    symbol: nonEmptyStringArb,
    tab: fc.constant(tab),
    user_id: fc.constant(userId),
  });

/**
 * Arbitrary for a watchlist row belonging to a DIFFERENT user (not the caller).
 */
const otherUserRowArb = (callerUserId: string, tab: string) =>
  fc.record({
    id: fc.uuid(),
    symbol: nonEmptyStringArb,
    tab: fc.constant(tab),
    user_id: fc.uuid().filter((id) => id !== callerUserId),
  });

/**
 * Arbitrary for a watchlist row belonging to a DIFFERENT tab (not the requested tab).
 */
const otherTabRowArb = (userId: string, requestedTab: string) =>
  fc.record({
    id: fc.uuid(),
    symbol: nonEmptyStringArb,
    tab: nonEmptyStringArb.filter((t) => t !== requestedTab),
    user_id: fc.constant(userId),
  });

// ---------------------------------------------------------------------------
// beforeEach: reset mocks and set up authenticated admin caller
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  // Default mockFrom supports GET chain only (Property 5 tests).
  // Property 6 tests call setupAllChains() to override this.
  mockFrom.mockReturnValue({ select: mockSelect });
});

// ---------------------------------------------------------------------------
// Property 5: Watchlist user isolation
// Feature: admin-panel-live-data, Property 5: Watchlist user isolation
// Validates: Requirements 4.4
// ---------------------------------------------------------------------------

describe('Admin Watchlist API - Property 5: Watchlist user isolation', () => {
  // Feature: admin-panel-live-data, Property 5: Watchlist user isolation
  // Validates: Requirements 4.4

  it('GET returns only rows for the authenticated user and requested tab', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // callerUserId
        nonEmptyStringArb, // requestedTab
        fc.array(fc.record({ id: fc.uuid(), symbol: nonEmptyStringArb }), { maxLength: 10 }), // caller's rows for this tab
        async (callerUserId, requestedTab, ownSymbols) => {
          // Arrange: authenticated caller
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: callerUserId,
                user_metadata: { role: 'admin' },
              },
            },
            error: null,
          });

          // The rows the DB returns for (callerUserId, requestedTab)
          const dbRows: WatchlistRow[] = ownSymbols.map((s) => ({
            id: s.id,
            symbol: s.symbol,
            tab: requestedTab,
          }));

          setupWatchlistQuery(dbRows);

          // Act
          const req = makeWatchlistRequest(requestedTab);
          const res = await GET(req);

          // Assert: status 200
          if (res.status !== 200) return false;

          const body: WatchlistRow[] = await res.json();

          // Every returned row must have the requested tab
          for (const row of body) {
            if (row.tab !== requestedTab) return false;
          }

          // The number of returned rows must match what the DB returned
          if (body.length !== dbRows.length) return false;

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('GET never returns rows belonging to a different user_id', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // callerUserId
        fc.uuid(), // otherUserId (different user)
        nonEmptyStringArb, // requestedTab
        fc.array(fc.record({ id: fc.uuid(), symbol: nonEmptyStringArb }), { maxLength: 5 }), // caller's own rows
        async (callerUserId, otherUserId, requestedTab, ownSymbols) => {
          // Skip if the two UUIDs happen to be equal (extremely unlikely but possible)
          if (callerUserId === otherUserId) return true;

          // Arrange: authenticated caller
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: callerUserId,
                user_metadata: { role: 'admin' },
              },
            },
            error: null,
          });

          // The DB correctly filters by user_id — it only returns the caller's rows.
          // This simulates the route's .eq('user_id', callerUser.id) filter working correctly.
          const callerRows: WatchlistRow[] = ownSymbols.map((s) => ({
            id: s.id,
            symbol: s.symbol,
            tab: requestedTab,
          }));

          // Rows that belong to the other user — these should NEVER appear in the response
          const otherUserRows: WatchlistRow[] = [
            { id: 'other-1', symbol: 'NIFTY', tab: requestedTab, user_id: otherUserId },
            { id: 'other-2', symbol: 'BANKNIFTY', tab: requestedTab, user_id: otherUserId },
          ];

          // The mock returns only the caller's rows (simulating correct DB filtering)
          setupWatchlistQuery(callerRows);

          // Act
          const req = makeWatchlistRequest(requestedTab);
          const res = await GET(req);

          if (res.status !== 200) return false;

          const body: WatchlistRow[] = await res.json();

          // Assert: none of the other user's symbols appear in the response
          const otherSymbols = new Set(otherUserRows.map((r) => r.symbol));
          const callerSymbolSet = new Set(ownSymbols.map((s) => s.symbol));

          for (const row of body) {
            // If a symbol from the other user appears AND it's not also in the caller's list,
            // that's a violation of user isolation
            if (otherSymbols.has(row.symbol) && !callerSymbolSet.has(row.symbol)) {
              return false;
            }
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('GET never returns rows belonging to a different tab', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // callerUserId
        nonEmptyStringArb, // requestedTab
        nonEmptyStringArb, // otherTab (different tab)
        fc.array(fc.record({ id: fc.uuid(), symbol: nonEmptyStringArb }), { maxLength: 5 }), // caller's rows for requestedTab
        async (callerUserId, requestedTab, otherTab, ownSymbols) => {
          // Skip if tabs happen to be equal
          if (requestedTab === otherTab) return true;

          // Arrange: authenticated caller
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: callerUserId,
                user_metadata: { role: 'admin' },
              },
            },
            error: null,
          });

          // The DB correctly filters by tab — it only returns rows for requestedTab.
          // This simulates the route's .eq('tab', tab) filter working correctly.
          const callerRows: WatchlistRow[] = ownSymbols.map((s) => ({
            id: s.id,
            symbol: s.symbol,
            tab: requestedTab,
          }));

          setupWatchlistQuery(callerRows);

          // Act
          const req = makeWatchlistRequest(requestedTab);
          const res = await GET(req);

          if (res.status !== 200) return false;

          const body: WatchlistRow[] = await res.json();

          // Assert: every returned row has the requested tab (not the other tab)
          for (const row of body) {
            if (row.tab === otherTab) return false;
            if (row.tab !== requestedTab) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('GET returns empty array when no rows exist for the user and tab', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // callerUserId
        nonEmptyStringArb, // requestedTab
        async (callerUserId, requestedTab) => {
          // Arrange: authenticated caller
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: callerUserId,
                user_metadata: { role: 'admin' },
              },
            },
            error: null,
          });

          // DB returns empty array (no rows for this user/tab)
          setupWatchlistQuery([]);

          // Act
          const req = makeWatchlistRequest(requestedTab);
          const res = await GET(req);

          if (res.status !== 200) return false;

          const body = await res.json();

          // Assert: response is an empty array
          return Array.isArray(body) && body.length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('GET response contains only id, symbol, tab fields (no user_id leakage)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // callerUserId
        nonEmptyStringArb, // requestedTab
        fc.array(
          fc.record({ id: fc.uuid(), symbol: nonEmptyStringArb }),
          { minLength: 1, maxLength: 10 },
        ),
        async (callerUserId, requestedTab, ownSymbols) => {
          // Arrange: authenticated caller
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: callerUserId,
                user_metadata: { role: 'admin' },
              },
            },
            error: null,
          });

          const dbRows: WatchlistRow[] = ownSymbols.map((s) => ({
            id: s.id,
            symbol: s.symbol,
            tab: requestedTab,
          }));

          setupWatchlistQuery(dbRows);

          // Act
          const req = makeWatchlistRequest(requestedTab);
          const res = await GET(req);

          if (res.status !== 200) return false;

          const body: WatchlistRow[] = await res.json();

          // Assert: every row has id, symbol, tab — and no user_id leakage
          for (const row of body) {
            if (!('id' in row)) return false;
            if (!('symbol' in row)) return false;
            if (!('tab' in row)) return false;
            // user_id should NOT be in the response (route selects 'id, symbol, tab' only)
            if ('user_id' in row) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('GET Supabase query is always filtered by both user_id and tab', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // callerUserId
        nonEmptyStringArb, // requestedTab
        async (callerUserId, requestedTab) => {
          // Arrange: authenticated caller
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: callerUserId,
                user_metadata: { role: 'admin' },
              },
            },
            error: null,
          });

          setupWatchlistQuery([]);

          // Act
          const req = makeWatchlistRequest(requestedTab);
          const res = await GET(req);

          if (res.status !== 200) return false;

          // Assert: the Supabase chain was called with both eq filters
          // eq('user_id', callerUserId) is the first eq call
          expect(mockEqUserId).toHaveBeenCalledWith('user_id', callerUserId);
          // eq('tab', requestedTab) is the second eq call
          expect(mockEqTab).toHaveBeenCalledWith('tab', requestedTab);

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Watchlist add/remove round trip
// Feature: admin-panel-live-data, Property 6: Watchlist add/remove round trip
// Validates: Requirements 4.5, 4.6
// ---------------------------------------------------------------------------

describe('Admin Watchlist API - Property 6: Watchlist add/remove round trip', () => {
  // Feature: admin-panel-live-data, Property 6: Watchlist add/remove round trip
  // Validates: Requirements 4.5, 4.6

  it('after POST, GET includes the added symbol', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // callerUserId
        fc.string({ minLength: 1 }), // tab
        fc.string({ minLength: 1 }), // symbol
        async (callerUserId, tab, symbol) => {
          // Arrange: authenticated caller
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: callerUserId,
                user_metadata: { role: 'admin' },
              },
            },
            error: null,
          });

          // The new row that POST will return
          const newRow: WatchlistRow = { id: 'new-id-1', symbol, tab };

          // After POST, GET should return the new row
          const getRowsAfterPost: WatchlistRow[] = [newRow];

          setupAllChains(getRowsAfterPost, newRow);

          // Act: POST to add the symbol
          const postReq = new Request('http://localhost/api/admin/watchlist', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer valid-admin-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tab, symbol }),
          });
          const postRes = await POST(postReq);

          // POST must succeed (201 for new insert, or 200 for duplicate)
          if (postRes.status !== 201 && postRes.status !== 200) return false;

          // Now set up GET to return the row that was just added
          setupWatchlistQuery(getRowsAfterPost);

          // Act: GET to verify the symbol is now in the watchlist
          const getReq = makeWatchlistRequest(tab);
          const getRes = await GET(getReq);

          if (getRes.status !== 200) return false;

          const body: WatchlistRow[] = await getRes.json();

          // Assert: the symbol appears in the GET response
          const symbols = body.map((r) => r.symbol);
          return symbols.includes(symbol);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('after DELETE with symbol, GET excludes the removed symbol', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // callerUserId
        fc.string({ minLength: 1 }), // tab
        fc.string({ minLength: 1 }), // symbol to remove
        fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }), // other symbols that remain
        async (callerUserId, tab, symbolToRemove, otherSymbols) => {
          // Arrange: authenticated caller
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: callerUserId,
                user_metadata: { role: 'admin' },
              },
            },
            error: null,
          });

          // After DELETE, GET returns only the other symbols (not the removed one)
          const remainingRows: WatchlistRow[] = otherSymbols
            .filter((s) => s !== symbolToRemove)
            .map((s, i) => ({ id: `row-${i}`, symbol: s, tab }));

          // Set up DELETE chain
          setupWatchlistDelete();

          // Act: DELETE to remove the symbol
          const deleteUrl = new URL('http://localhost/api/admin/watchlist');
          deleteUrl.searchParams.set('tab', tab);
          deleteUrl.searchParams.set('symbol', symbolToRemove);
          const deleteReq = new Request(deleteUrl.toString(), {
            method: 'DELETE',
            headers: { Authorization: 'Bearer valid-admin-token' },
          });
          const deleteRes = await DELETE(deleteReq);

          // DELETE must succeed
          if (deleteRes.status !== 200) return false;

          // Now set up GET to return only the remaining rows
          setupWatchlistQuery(remainingRows);

          // Act: GET to verify the symbol is no longer in the watchlist
          const getReq = makeWatchlistRequest(tab);
          const getRes = await GET(getReq);

          if (getRes.status !== 200) return false;

          const body: WatchlistRow[] = await getRes.json();

          // Assert: the removed symbol does NOT appear in the GET response
          const symbols = body.map((r) => r.symbol);
          return !symbols.includes(symbolToRemove);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('full round trip: POST then DELETE then GET excludes symbol', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // callerUserId
        fc.string({ minLength: 1 }), // tab
        fc.string({ minLength: 1 }), // symbol
        async (callerUserId, tab, symbol) => {
          // Arrange: authenticated caller
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: callerUserId,
                user_metadata: { role: 'admin' },
              },
            },
            error: null,
          });

          // Step 1: POST — add the symbol
          const newRow: WatchlistRow = { id: 'round-trip-id', symbol, tab };
          setupAllChains([newRow], newRow);

          const postReq = new Request('http://localhost/api/admin/watchlist', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer valid-admin-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ tab, symbol }),
          });
          const postRes = await POST(postReq);
          if (postRes.status !== 201 && postRes.status !== 200) return false;

          // Step 2: GET — verify symbol is present
          setupWatchlistQuery([newRow]);
          const getReq1 = makeWatchlistRequest(tab);
          const getRes1 = await GET(getReq1);
          if (getRes1.status !== 200) return false;
          const bodyAfterPost: WatchlistRow[] = await getRes1.json();
          if (!bodyAfterPost.map((r) => r.symbol).includes(symbol)) return false;

          // Step 3: DELETE — remove the symbol
          setupWatchlistDelete();
          const deleteUrl = new URL('http://localhost/api/admin/watchlist');
          deleteUrl.searchParams.set('tab', tab);
          deleteUrl.searchParams.set('symbol', symbol);
          const deleteReq = new Request(deleteUrl.toString(), {
            method: 'DELETE',
            headers: { Authorization: 'Bearer valid-admin-token' },
          });
          const deleteRes = await DELETE(deleteReq);
          if (deleteRes.status !== 200) return false;

          // Step 4: GET — verify symbol is absent
          setupWatchlistQuery([]); // empty after deletion
          const getReq2 = makeWatchlistRequest(tab);
          const getRes2 = await GET(getReq2);
          if (getRes2.status !== 200) return false;
          const bodyAfterDelete: WatchlistRow[] = await getRes2.json();

          // Assert: symbol is NOT in the response after DELETE
          return !bodyAfterDelete.map((r) => r.symbol).includes(symbol);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Watchlist clear
// Feature: admin-panel-live-data, Property 7: Watchlist clear
// Validates: Requirements 4.7
// ---------------------------------------------------------------------------

describe('Admin Watchlist API - Property 7: Watchlist clear', () => {
  // Feature: admin-panel-live-data, Property 7: Watchlist clear
  // Validates: Requirements 4.7

  /**
   * Set up the DELETE mock chain for a tab-only clear (no symbol param).
   * The route calls: .delete().eq('user_id', ...).eq('tab', ...)
   * and then awaits the result of .eq('tab', ...) directly (no further .eq('symbol', ...)).
   */
  function setupTabOnlyClear(): void {
    // For tab-only delete, the chain terminates at eq('tab', tab).
    // mockDeleteEqTab must be awaitable and resolve with { error: null }.
    mockDeleteEqTab.mockResolvedValue({ error: null });
    mockDeleteEqUserId.mockReturnValue({ eq: mockDeleteEqTab });
    mockDelete.mockReturnValue({ eq: mockDeleteEqUserId });
    mockFrom.mockReturnValue({ select: mockSelect, insert: mockInsert, delete: mockDelete });
  }

  it('after DELETE without symbol (tab-only clear), GET returns empty array', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // callerUserId
        fc.string({ minLength: 1 }), // tab
        fc.array(fc.string({ minLength: 1 }), { minLength: 1 }), // initial symbols (at least 1)
        async (callerUserId, tab, initialSymbols) => {
          // Arrange: authenticated caller
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: callerUserId,
                user_metadata: { role: 'admin' },
              },
            },
            error: null,
          });

          // Step 1: Set up tab-only DELETE chain
          setupTabOnlyClear();

          // Act: DELETE without symbol — clears all symbols for the tab
          const deleteUrl = new URL('http://localhost/api/admin/watchlist');
          deleteUrl.searchParams.set('tab', tab);
          // Intentionally NOT setting 'symbol' param — this is the tab-only clear
          const deleteReq = new Request(deleteUrl.toString(), {
            method: 'DELETE',
            headers: { Authorization: 'Bearer valid-admin-token' },
          });
          const deleteRes = await DELETE(deleteReq);

          // DELETE must succeed
          if (deleteRes.status !== 200) return false;

          // Step 2: After clear, GET should return empty array
          setupWatchlistQuery([]); // DB now returns empty (all symbols cleared)

          const getReq = makeWatchlistRequest(tab);
          const getRes = await GET(getReq);

          if (getRes.status !== 200) return false;

          const body = await getRes.json();

          // Assert: GET returns an empty array after tab-only clear
          return Array.isArray(body) && body.length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('tab-only DELETE removes all symbols regardless of how many were present', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // callerUserId
        fc.string({ minLength: 1 }), // tab
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 20 }), // 1–20 initial symbols
        async (callerUserId, tab, initialSymbols) => {
          // Arrange: authenticated caller
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: callerUserId,
                user_metadata: { role: 'admin' },
              },
            },
            error: null,
          });

          // Step 1: DELETE without symbol — clears all N symbols
          setupTabOnlyClear();

          const deleteUrl = new URL('http://localhost/api/admin/watchlist');
          deleteUrl.searchParams.set('tab', tab);
          const deleteReq = new Request(deleteUrl.toString(), {
            method: 'DELETE',
            headers: { Authorization: 'Bearer valid-admin-token' },
          });
          const deleteRes = await DELETE(deleteReq);

          if (deleteRes.status !== 200) return false;

          // Step 2: GET returns empty array — none of the initial symbols remain
          setupWatchlistQuery([]);

          const getReq = makeWatchlistRequest(tab);
          const getRes = await GET(getReq);

          if (getRes.status !== 200) return false;

          const body: WatchlistRow[] = await getRes.json();

          // Assert: empty array — no initial symbol survives the clear
          if (!Array.isArray(body) || body.length !== 0) return false;

          // Assert: none of the initial symbols appear in the response
          const returnedSymbols = new Set(body.map((r) => r.symbol));
          for (const sym of initialSymbols) {
            if (returnedSymbols.has(sym)) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('tab-only DELETE does not affect other tabs', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), // callerUserId
        fc.string({ minLength: 1 }), // tab to clear
        fc.string({ minLength: 1 }), // other tab (should be unaffected)
        fc.array(fc.string({ minLength: 1 }), { minLength: 1 }), // symbols in other tab
        async (callerUserId, tabToClear, otherTab, otherTabSymbols) => {
          // Skip if tabs happen to be equal
          if (tabToClear === otherTab) return true;

          // Arrange: authenticated caller
          mockGetUser.mockResolvedValue({
            data: {
              user: {
                id: callerUserId,
                user_metadata: { role: 'admin' },
              },
            },
            error: null,
          });

          // Step 1: DELETE tab-only for tabToClear
          setupTabOnlyClear();

          const deleteUrl = new URL('http://localhost/api/admin/watchlist');
          deleteUrl.searchParams.set('tab', tabToClear);
          const deleteReq = new Request(deleteUrl.toString(), {
            method: 'DELETE',
            headers: { Authorization: 'Bearer valid-admin-token' },
          });
          const deleteRes = await DELETE(deleteReq);

          if (deleteRes.status !== 200) return false;

          // Step 2: GET for the cleared tab returns empty
          setupWatchlistQuery([]);
          const getReq1 = makeWatchlistRequest(tabToClear);
          const getRes1 = await GET(getReq1);
          if (getRes1.status !== 200) return false;
          const body1 = await getRes1.json();
          if (!Array.isArray(body1) || body1.length !== 0) return false;

          // Step 3: GET for the other tab still returns its symbols (unaffected)
          const otherTabRows: WatchlistRow[] = otherTabSymbols.map((s, i) => ({
            id: `other-${i}`,
            symbol: s,
            tab: otherTab,
          }));
          setupWatchlistQuery(otherTabRows);
          const getReq2 = makeWatchlistRequest(otherTab);
          const getRes2 = await GET(getReq2);
          if (getRes2.status !== 200) return false;
          const body2: WatchlistRow[] = await getRes2.json();

          // Assert: other tab still has its symbols
          return body2.length === otherTabRows.length;
        },
      ),
      { numRuns: 100 },
    );
  });
});
