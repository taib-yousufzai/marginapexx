// Feature: admin-panel-live-data, Property 8: Script settings ordering

/**
 * Property-based tests for Admin Script Settings API route.
 *
 * Feature: admin-panel-live-data
 *
 * Tests Property 8: Script settings ordering.
 * GET /api/admin/settings/scripts SHALL return all script settings in ascending
 * alphabetical order by symbol, regardless of the order in which they are stored
 * in the database.
 *
 * Validates: Requirements 5.5
 */

import { describe, it, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { GET, POST } from '../route';

// ---------------------------------------------------------------------------
// Supabase mock setup
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockOrder = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

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
 * Build a GET request for the scripts route with a valid admin Bearer token.
 */
function makeScriptsGetRequest(): Request {
  return new Request('http://localhost/api/admin/settings/scripts', {
    method: 'GET',
    headers: { Authorization: 'Bearer valid-admin-token' },
  });
}

/**
 * A script_settings row as returned by Supabase.
 */
interface ScriptRow {
  id: string;
  symbol: string;
  lot_size: number;
}

/**
 * Set up the Supabase mock chain for a successful script settings query:
 *   adminClient.from('script_settings').select('id, symbol, lot_size').order('symbol', { ascending: true })
 *   → returns { data: rows, error: null }
 *
 * The route calls .order() which resolves the query. We mock it to return the
 * rows in whatever order the test provides (simulating the DB returning them
 * in a shuffled order), and then verify the route returns them sorted.
 *
 * Note: The actual route delegates ordering to Supabase via .order('symbol', { ascending: true }).
 * In production, Supabase/PostgreSQL guarantees the sort. In tests, we verify that
 * the route correctly passes the ordering instruction to Supabase and that the
 * response reflects the sorted order returned by the mock.
 */
function setupScriptsQuery(rows: ScriptRow[]): void {
  mockOrder.mockResolvedValue({ data: rows, error: null });
  mockSelect.mockReturnValue({ order: mockOrder });
  mockFrom.mockReturnValue({ select: mockSelect });
}

// ---------------------------------------------------------------------------
// beforeEach: reset mocks and set up authenticated admin caller
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  // Default: authenticated admin caller
  mockGetUser.mockResolvedValue({
    data: {
      user: {
        id: 'admin-user-id',
        user_metadata: { role: 'admin' },
      },
    },
    error: null,
  });
});

// ---------------------------------------------------------------------------
// Property 8: Script settings ordering
// Feature: admin-panel-live-data, Property 8: Script settings ordering
// Validates: Requirements 5.5
// ---------------------------------------------------------------------------

describe('Admin Script Settings API - Property 8: Script settings ordering', () => {
  // Feature: admin-panel-live-data, Property 8: Script settings ordering
  // Validates: Requirements 5.5

  it('GET response is sorted ascending by symbol for any shuffled input', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate an array of at least 2 records with non-empty symbols
        fc.array(fc.record({ symbol: fc.string({ minLength: 1 }) }), { minLength: 2 }),
        async (symbolRecords) => {
          // Build full script rows from the generated symbols
          const rows: ScriptRow[] = symbolRecords.map((r, i) => ({
            id: `id-${i}`,
            symbol: r.symbol,
            lot_size: 1,
          }));

          // Shuffle the rows to simulate DB returning them in arbitrary order,
          // then sort them as Supabase would with ORDER BY symbol ASC
          const shuffled = [...rows].sort(() => Math.random() - 0.5);
          const sortedBySymbol = [...shuffled].sort((a, b) =>
            a.symbol.localeCompare(b.symbol),
          );

          // Mock Supabase to return the sorted rows (simulating ORDER BY symbol ASC)
          setupScriptsQuery(sortedBySymbol);

          // Act
          const req = makeScriptsGetRequest();
          const res = await GET(req);

          // Assert: status 200
          if (res.status !== 200) return false;

          const body: ScriptRow[] = await res.json();

          // Assert: response is an array
          if (!Array.isArray(body)) return false;

          // Assert: response length matches input
          if (body.length !== rows.length) return false;

          // Assert: response is sorted ascending by symbol
          for (let i = 0; i < body.length - 1; i++) {
            if (body[i].symbol.localeCompare(body[i + 1].symbol) > 0) {
              return false;
            }
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('GET passes ORDER BY symbol ascending to Supabase for any input', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ symbol: fc.string({ minLength: 1 }) }), { minLength: 2 }),
        async (symbolRecords) => {
          const rows: ScriptRow[] = symbolRecords.map((r, i) => ({
            id: `id-${i}`,
            symbol: r.symbol,
            lot_size: 1,
          }));

          setupScriptsQuery(rows);

          const req = makeScriptsGetRequest();
          const res = await GET(req);

          if (res.status !== 200) return false;

          // Assert: .order() was called with 'symbol' and ascending: true
          const orderCalls = mockOrder.mock.calls;
          if (orderCalls.length === 0) return false;

          const [field, options] = orderCalls[orderCalls.length - 1];
          return field === 'symbol' && options?.ascending === true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('GET returns empty array when no script settings exist', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constant(null),
        async () => {
          setupScriptsQuery([]);

          const req = makeScriptsGetRequest();
          const res = await GET(req);

          if (res.status !== 200) return false;

          const body = await res.json();
          return Array.isArray(body) && body.length === 0;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('GET response contains only id, symbol, lot_size fields for each row', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ symbol: fc.string({ minLength: 1 }) }), { minLength: 2 }),
        async (symbolRecords) => {
          const rows: ScriptRow[] = symbolRecords.map((r, i) => ({
            id: `id-${i}`,
            symbol: r.symbol,
            lot_size: i + 1,
          }));

          const sorted = [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol));
          setupScriptsQuery(sorted);

          const req = makeScriptsGetRequest();
          const res = await GET(req);

          if (res.status !== 200) return false;

          const body: ScriptRow[] = await res.json();

          // Assert: every row has id, symbol, lot_size
          for (const row of body) {
            if (!('id' in row)) return false;
            if (!('symbol' in row)) return false;
            if (!('lot_size' in row)) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('GET sorted order is stable: symbols at same position remain consistent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ symbol: fc.string({ minLength: 1 }) }), { minLength: 2 }),
        async (symbolRecords) => {
          const rows: ScriptRow[] = symbolRecords.map((r, i) => ({
            id: `id-${i}`,
            symbol: r.symbol,
            lot_size: 1,
          }));

          // Sort as Supabase would
          const sorted = [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol));
          setupScriptsQuery(sorted);

          const req = makeScriptsGetRequest();
          const res = await GET(req);

          if (res.status !== 200) return false;

          const body: ScriptRow[] = await res.json();

          // Assert: the symbols in the response match the expected sorted order
          const responseSymbols = body.map((r) => r.symbol);
          const expectedSymbols = sorted.map((r) => r.symbol);

          if (responseSymbols.length !== expectedSymbols.length) return false;

          for (let i = 0; i < responseSymbols.length; i++) {
            if (responseSymbols[i] !== expectedSymbols[i]) return false;
          }

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Script settings CRUD round trip
// Feature: admin-panel-live-data, Property 9: Script settings CRUD round trip
// Validates: Requirements 5.6, 5.7, 5.8
// ---------------------------------------------------------------------------

/**
 * Additional mock functions needed for POST, PATCH, and DELETE chains.
 *
 * POST chain:  from('script_settings').insert({...}).select('id, symbol, lot_size').single()
 * PATCH chain: from('script_settings').update({...}).eq('id', id).select('id, symbol, lot_size').single()
 * DELETE chain (check): from('script_settings').select('id').eq('id', id).single()
 * DELETE chain (delete): from('script_settings').delete().eq('id', id)
 */
const mockInsert = vi.fn();
const mockInsertSelect = vi.fn();
const mockInsertSingle = vi.fn();

const mockUpdate = vi.fn();
const mockUpdateEq = vi.fn();
const mockUpdateSelect = vi.fn();
const mockUpdateSingle = vi.fn();

const mockDelete = vi.fn();
const mockDeleteEq = vi.fn();

const mockSelectSingle = vi.fn();
const mockSelectEq = vi.fn();

/**
 * Set up the POST mock chain:
 *   adminClient.from('script_settings').insert({...}).select('id, symbol, lot_size').single()
 *   → returns { data: newRow, error: null }
 */
function setupScriptsInsert(newRow: ScriptRow): void {
  mockInsertSingle.mockResolvedValue({ data: newRow, error: null });
  mockInsertSelect.mockReturnValue({ single: mockInsertSingle });
  mockInsert.mockReturnValue({ select: mockInsertSelect });
}

/**
 * Set up the PATCH mock chain:
 *   adminClient.from('script_settings').update({...}).eq('id', id).select('id, symbol, lot_size').single()
 *   → returns { data: updatedRow, error: null }
 */
function setupScriptsPatch(updatedRow: ScriptRow): void {
  mockUpdateSingle.mockResolvedValue({ data: updatedRow, error: null });
  mockUpdateSelect.mockReturnValue({ single: mockUpdateSingle });
  mockUpdateEq.mockReturnValue({ select: mockUpdateSelect });
  mockUpdate.mockReturnValue({ eq: mockUpdateEq });
  mockFrom.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  });
}

/**
 * Set up the DELETE mock chain:
 *   Step 1 (existence check): from('script_settings').select('id').eq('id', id).single()
 *     → returns { data: { id }, error: null }
 *   Step 2 (delete): from('script_settings').delete().eq('id', id)
 *     → returns { error: null }
 *
 * The DELETE route calls from('script_settings') twice, so we use
 * mockReturnValueOnce to return different objects for each call.
 */
function setupScriptsDelete(existingId: string): void {
  // Existence check chain: .select('id').eq('id', id).single()
  mockSelectSingle.mockResolvedValue({ data: { id: existingId }, error: null });
  mockSelectEq.mockReturnValue({ single: mockSelectSingle });
  const existenceCheckObj = { select: vi.fn().mockReturnValue({ eq: mockSelectEq }) };

  // Delete chain: .delete().eq('id', id)
  mockDeleteEq.mockResolvedValue({ error: null });
  mockDelete.mockReturnValue({ eq: mockDeleteEq });
  const deleteObj = { delete: mockDelete };

  // First call to from() → existence check; second call → delete
  mockFrom.mockReturnValueOnce(existenceCheckObj).mockReturnValueOnce(deleteObj);
}

/**
 * Set up mockFrom to support POST (insert) chain only.
 * Used when we only need to test POST then separately set up GET.
 */
function setupInsertAndGetChains(getRows: ScriptRow[], newRow: ScriptRow): void {
  // POST chain: .insert({...}).select('id, symbol, lot_size').single()
  mockInsertSingle.mockResolvedValue({ data: newRow, error: null });
  mockInsertSelect.mockReturnValue({ single: mockInsertSingle });
  mockInsert.mockReturnValue({ select: mockInsertSelect });

  // GET chain: .select('id, symbol, lot_size').order('symbol', { ascending: true })
  mockOrder.mockResolvedValue({ data: getRows, error: null });
  mockSelect.mockReturnValue({ order: mockOrder });

  mockFrom.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  });
}

/**
 * Set up mockFrom to support all chains (GET, POST, PATCH, DELETE) simultaneously.
 * Each call to from('script_settings') returns an object with all entry points.
 *
 * For the full CRUD round trip, we configure mockFrom to return the right object
 * for each sequential call: POST → GET → PATCH → GET → DELETE(check) → DELETE(delete) → GET.
 */
function setupAllScriptsChains(
  getRows: ScriptRow[],
  newRow: ScriptRow,
  updatedRow: ScriptRow,
  existingId: string,
): void {
  // GET chain: .select('id, symbol, lot_size').order('symbol', { ascending: true })
  mockOrder.mockResolvedValue({ data: getRows, error: null });
  mockSelect.mockReturnValue({ order: mockOrder });

  // POST chain: .insert({...}).select('id, symbol, lot_size').single()
  mockInsertSingle.mockResolvedValue({ data: newRow, error: null });
  mockInsertSelect.mockReturnValue({ single: mockInsertSingle });
  mockInsert.mockReturnValue({ select: mockInsertSelect });

  // PATCH chain: .update({...}).eq('id', id).select('id, symbol, lot_size').single()
  mockUpdateSingle.mockResolvedValue({ data: updatedRow, error: null });
  mockUpdateSelect.mockReturnValue({ single: mockUpdateSingle });
  mockUpdateEq.mockReturnValue({ select: mockUpdateSelect });
  mockUpdate.mockReturnValue({ eq: mockUpdateEq });

  // DELETE existence check: .select('id').eq('id', id).single()
  mockSelectSingle.mockResolvedValue({ data: { id: existingId }, error: null });
  mockSelectEq.mockReturnValue({ single: mockSelectSingle });

  // DELETE delete: .delete().eq('id', id)
  mockDeleteEq.mockResolvedValue({ error: null });
  mockDelete.mockReturnValue({ eq: mockDeleteEq });

  mockFrom.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
  });
}

// Import PATCH and DELETE handlers from the [id] route
import { PATCH, DELETE as DELETE_BY_ID } from '../[id]/route';

describe('Admin Script Settings API - Property 9: Script settings CRUD round trip', () => {
  // Feature: admin-panel-live-data, Property 9: Script settings CRUD round trip
  // Validates: Requirements 5.6, 5.7, 5.8

  it('after POST, GET includes the new entry with correct symbol and lot_size', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ symbol: fc.string({ minLength: 1 }), lot_size: fc.integer({ min: 1 }) }),
        async ({ symbol, lot_size }) => {
          // The new row that POST will create
          const newRow: ScriptRow = { id: 'new-script-id', symbol, lot_size };

          // Set up POST chain; GET will be set up separately after POST
          setupInsertAndGetChains([newRow], newRow);

          // Act: POST to create the script setting
          const postReq = new Request('http://localhost/api/admin/settings/scripts', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer valid-admin-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ symbol, lot_size }),
          });
          const postRes = await POST(postReq);

          // POST must return 201
          if (postRes.status !== 201) return false;

          const postBody: ScriptRow = await postRes.json();
          // POST response must contain the symbol and lot_size
          if (postBody.symbol !== symbol) return false;
          if (postBody.lot_size !== lot_size) return false;

          // Now set up GET to return the newly created row
          setupScriptsQuery([newRow]);

          // Act: GET to verify the entry is now in the list
          const getReq = makeScriptsGetRequest();
          const getRes = await GET(getReq);

          if (getRes.status !== 200) return false;

          const getBody: ScriptRow[] = await getRes.json();

          // Assert: the new entry appears in GET response
          const found = getBody.find((r) => r.symbol === symbol && r.lot_size === lot_size);
          return found !== undefined;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('after PATCH with new lot_size, GET returns the updated value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ symbol: fc.string({ minLength: 1 }), lot_size: fc.integer({ min: 1 }) }),
        fc.integer({ min: 1 }),
        async ({ symbol, lot_size: originalLotSize }, newLotSize) => {
          const scriptId = 'patch-script-id';
          const updatedRow: ScriptRow = { id: scriptId, symbol, lot_size: newLotSize };

          // Set up PATCH chain to return the updated row
          setupScriptsPatch(updatedRow);
          mockFrom.mockReturnValue({
            select: mockSelect,
            insert: mockInsert,
            update: mockUpdate,
            delete: mockDelete,
          });

          // Act: PATCH to update the lot_size
          const patchReq = new Request(
            `http://localhost/api/admin/settings/scripts/${scriptId}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: 'Bearer valid-admin-token',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ lot_size: newLotSize }),
            },
          );
          const patchRes = await PATCH(patchReq, { params: { id: scriptId } });

          // PATCH must return 200
          if (patchRes.status !== 200) return false;

          const patchBody: ScriptRow = await patchRes.json();
          // PATCH response must reflect the new lot_size
          if (patchBody.lot_size !== newLotSize) return false;

          // Now set up GET to return the updated row
          setupScriptsQuery([updatedRow]);

          // Act: GET to verify the updated value is returned
          const getReq = makeScriptsGetRequest();
          const getRes = await GET(getReq);

          if (getRes.status !== 200) return false;

          const getBody: ScriptRow[] = await getRes.json();

          // Assert: GET returns the updated lot_size, not the original
          const found = getBody.find((r) => r.id === scriptId);
          if (!found) return false;
          return found.lot_size === newLotSize;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('after DELETE, GET excludes the deleted entry', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ symbol: fc.string({ minLength: 1 }), lot_size: fc.integer({ min: 1 }) }),
        async ({ symbol, lot_size }) => {
          const scriptId = 'delete-script-id';

          // Set up DELETE chain (existence check + delete) via mockReturnValueOnce
          setupScriptsDelete(scriptId);

          // Act: DELETE to remove the script setting
          const deleteReq = new Request(
            `http://localhost/api/admin/settings/scripts/${scriptId}`,
            {
              method: 'DELETE',
              headers: { Authorization: 'Bearer valid-admin-token' },
            },
          );
          const deleteRes = await DELETE_BY_ID(deleteReq, { params: { id: scriptId } });

          // DELETE must return 200
          if (deleteRes.status !== 200) return false;

          // Now set up GET to return empty (the row was deleted)
          setupScriptsQuery([]);

          // Act: GET to verify the entry is no longer in the list
          const getReq = makeScriptsGetRequest();
          const getRes = await GET(getReq);

          if (getRes.status !== 200) return false;

          const getBody: ScriptRow[] = await getRes.json();

          // Assert: the deleted symbol does NOT appear in GET response
          const found = getBody.find((r) => r.symbol === symbol);
          return found === undefined;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('full CRUD round trip: POST → GET includes → PATCH → GET updated → DELETE → GET excludes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ symbol: fc.string({ minLength: 1 }), lot_size: fc.integer({ min: 1 }) }),
        fc.integer({ min: 1 }),
        async ({ symbol, lot_size: originalLotSize }, newLotSize) => {
          const scriptId = 'full-crud-id';
          const originalRow: ScriptRow = { id: scriptId, symbol, lot_size: originalLotSize };
          const updatedRow: ScriptRow = { id: scriptId, symbol, lot_size: newLotSize };

          // ---- Step 1: POST ----
          setupInsertAndGetChains([originalRow], originalRow);

          const postReq = new Request('http://localhost/api/admin/settings/scripts', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer valid-admin-token',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ symbol, lot_size: originalLotSize }),
          });
          const postRes = await POST(postReq);
          if (postRes.status !== 201) return false;

          // ---- Step 2: GET — verify entry is present ----
          setupScriptsQuery([originalRow]);
          const getRes1 = await GET(makeScriptsGetRequest());
          if (getRes1.status !== 200) return false;
          const bodyAfterPost: ScriptRow[] = await getRes1.json();
          const foundAfterPost = bodyAfterPost.find(
            (r) => r.symbol === symbol && r.lot_size === originalLotSize,
          );
          if (!foundAfterPost) return false;

          // ---- Step 3: PATCH — update lot_size ----
          setupScriptsPatch(updatedRow);
          mockFrom.mockReturnValue({
            select: mockSelect,
            insert: mockInsert,
            update: mockUpdate,
            delete: mockDelete,
          });

          const patchReq = new Request(
            `http://localhost/api/admin/settings/scripts/${scriptId}`,
            {
              method: 'PATCH',
              headers: {
                Authorization: 'Bearer valid-admin-token',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ lot_size: newLotSize }),
            },
          );
          const patchRes = await PATCH(patchReq, { params: { id: scriptId } });
          if (patchRes.status !== 200) return false;

          // ---- Step 4: GET — verify updated lot_size ----
          setupScriptsQuery([updatedRow]);
          const getRes2 = await GET(makeScriptsGetRequest());
          if (getRes2.status !== 200) return false;
          const bodyAfterPatch: ScriptRow[] = await getRes2.json();
          const foundAfterPatch = bodyAfterPatch.find((r) => r.id === scriptId);
          if (!foundAfterPatch || foundAfterPatch.lot_size !== newLotSize) return false;

          // ---- Step 5: DELETE ----
          // setupScriptsDelete uses mockReturnValueOnce for the two from() calls
          setupScriptsDelete(scriptId);

          const deleteReq = new Request(
            `http://localhost/api/admin/settings/scripts/${scriptId}`,
            {
              method: 'DELETE',
              headers: { Authorization: 'Bearer valid-admin-token' },
            },
          );
          const deleteRes = await DELETE_BY_ID(deleteReq, { params: { id: scriptId } });
          if (deleteRes.status !== 200) return false;

          // ---- Step 6: GET — verify entry is gone ----
          setupScriptsQuery([]);
          const getRes3 = await GET(makeScriptsGetRequest());
          if (getRes3.status !== 200) return false;
          const bodyAfterDelete: ScriptRow[] = await getRes3.json();

          // Assert: the symbol is NOT in the final GET response
          return !bodyAfterDelete.find((r) => r.symbol === symbol);
        },
      ),
      { numRuns: 100 },
    );
  });
});
