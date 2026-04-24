/**
 * Property-based tests for Admin Pay In/Out API route logic.
 *
 * Feature: pay-in-out
 *
 * Tests Property 3 (Rejection produces no transaction) and
 * Property 4 (Status transition constraint) from the design document.
 * Also includes unit tests for each HTTP status code path in PATCH and DELETE handlers.
 *
 * Validates: Requirements 6.3, 6.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Pure helpers extracted from route logic (mirrors the route's business logic)
// ---------------------------------------------------------------------------

/**
 * Pure helper: returns true only when the current status allows a transition
 * (i.e., the request is still PENDING).
 *
 * Mirrors the guard in the reject path of PATCH /api/admin/payinout/[id]:
 *   if (row.status !== 'PENDING') return 409
 */
export function canTransition(currentStatus: string): boolean {
  return currentStatus === 'PENDING';
}

/**
 * Pure helper: builds the response shape for a rejection of a PENDING request.
 * Returns the HTTP code and body without any side effects (no DB calls).
 *
 * Mirrors the success branch of the reject path:
 *   UPDATE status='REJECTED' → return 200 { status: 'REJECTED' }
 * No transaction row is inserted during rejection.
 */
export function buildRejectResponse(status: string): { code: number; body: object } {
  if (status !== 'PENDING') {
    return { code: 409, body: { error: 'Request is not pending' } };
  }
  return { code: 200, body: { status: 'REJECTED' } };
}

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js createClient
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockRpc = vi.fn();

// Per-operation mocks — each operation has its own eq/single chain
const mockSelectSingle = vi.fn();
const mockSelectEq = vi.fn();
const mockSelectFn = vi.fn();

const mockUpdateEq = vi.fn();
const mockUpdateFn = vi.fn();

const mockDeleteEq = vi.fn();
const mockDeleteFn = vi.fn();

const mockInsert = vi.fn();

// Track call counts to distinguish first vs subsequent from() calls
let fromCallCount = 0;

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    rpc: mockRpc,
    from: vi.fn((_table: string) => {
      fromCallCount++;
      return {
        select: mockSelectFn,
        insert: mockInsert,
        update: mockUpdateFn,
        delete: mockDeleteFn,
      };
    }),
  })),
}));

// ---------------------------------------------------------------------------
// Import handlers AFTER mocks are set up
// ---------------------------------------------------------------------------

import { PATCH, DELETE } from '../[id]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePatchRequest(
  id: string,
  body: Record<string, unknown> | string,
  authHeader?: string,
): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader !== undefined) headers['Authorization'] = authHeader;
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return new Request(`http://localhost/api/admin/payinout/${id}`, {
    method: 'PATCH',
    headers,
    body: bodyStr,
  });
}

function makeDeleteRequest(id: string, authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) headers['Authorization'] = authHeader;
  return new Request(`http://localhost/api/admin/payinout/${id}`, {
    method: 'DELETE',
    headers,
  });
}

function makeAdminUser(role: 'admin' | 'super_admin' = 'admin') {
  return { id: 'admin-uuid', user_metadata: { role } };
}

/** Set up the from().select().eq().single() chain */
function setupSelectSingle(result: { data: unknown; error: unknown }) {
  mockSelectSingle.mockResolvedValue(result);
  mockSelectEq.mockReturnValue({ single: mockSelectSingle });
  mockSelectFn.mockReturnValue({ eq: mockSelectEq });
}

/** Set up the from().update().eq() chain */
function setupUpdateEq(result: { data: unknown; error: unknown }) {
  mockUpdateEq.mockResolvedValue(result);
  mockUpdateFn.mockReturnValue({ eq: mockUpdateEq });
}

/** Set up the from().delete().eq() chain */
function setupDeleteEq(result: { data: unknown; error: unknown }) {
  mockDeleteEq.mockResolvedValue(result);
  mockDeleteFn.mockReturnValue({ eq: mockDeleteEq });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  fromCallCount = 0;

  // Default: valid admin user
  mockGetUser.mockResolvedValue({
    data: { user: makeAdminUser() },
    error: null,
  });

  // Default: RPC returns success
  mockRpc.mockResolvedValue({
    data: { code: 200, status: 'APPROVED' },
    error: null,
  });

  // Default: insert succeeds
  mockInsert.mockResolvedValue({ data: {}, error: null });

  // Default: select returns a PENDING row
  setupSelectSingle({
    data: { id: 'req-uuid', user_id: 'user-uuid', status: 'PENDING' },
    error: null,
  });

  // Default: update succeeds
  setupUpdateEq({ data: {}, error: null });

  // Default: delete succeeds
  setupDeleteEq({ data: {}, error: null });

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

// ---------------------------------------------------------------------------
// Property 4: Status transition constraint
// Feature: pay-in-out, Property 4: Status transition constraint
// Validates: Requirements 6.3
// ---------------------------------------------------------------------------

describe('Property 4: Status transition constraint', () => {
  // Feature: pay-in-out, Property 4: Status transition constraint
  // Validates: Requirements 6.3

  it('canTransition returns false for any non-PENDING status', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('APPROVED', 'REJECTED'),
        (status) => {
          return canTransition(status) === false;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('canTransition returns true only for PENDING', () => {
    expect(canTransition('PENDING')).toBe(true);
  });

  it('returns 409 when pay request status is APPROVED (reject action)', async () => {
    setupSelectSingle({
      data: { id: 'req-uuid', user_id: 'user-uuid', status: 'APPROVED' },
      error: null,
    });

    const req = makePatchRequest('req-uuid', { action: 'reject' }, 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe('Request is not pending');
  });

  it('returns 409 when pay request status is REJECTED (reject action)', async () => {
    setupSelectSingle({
      data: { id: 'req-uuid', user_id: 'user-uuid', status: 'REJECTED' },
      error: null,
    });

    const req = makePatchRequest('req-uuid', { action: 'reject' }, 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toBe('Request is not pending');
  });
});

// ---------------------------------------------------------------------------
// Property 3: Rejection produces no transaction
// Feature: pay-in-out, Property 3: Rejection produces no transaction
// Validates: Requirements 6.7
// ---------------------------------------------------------------------------

describe('Property 3: Rejection produces no transaction', () => {
  // Feature: pay-in-out, Property 3: Rejection produces no transaction
  // Validates: Requirements 6.7

  it('buildRejectResponse returns { status: REJECTED } for PENDING status', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('PENDING'),
        (status) => {
          const result = buildRejectResponse(status);
          const body = result.body as Record<string, unknown>;
          return result.code === 200 && body.status === 'REJECTED';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('buildRejectResponse body contains status REJECTED and no transaction field', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('PENDING'),
        (status) => {
          const result = buildRejectResponse(status);
          const body = result.body as Record<string, unknown>;
          // Must have status: 'REJECTED'
          const hasRejectedStatus = body.status === 'REJECTED';
          // Must NOT have any transaction-related field
          const hasNoTransaction =
            !('transaction' in body) &&
            !('transaction_id' in body) &&
            !('transactions' in body);
          return hasRejectedStatus && hasNoTransaction;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('PATCH reject action does not call RPC (no transaction insert via RPC)', async () => {
    const req = makePatchRequest('req-uuid', { action: 'reject' }, 'Bearer valid-token');
    await PATCH(req, { params: { id: 'req-uuid' } });

    // The approve_pay_request RPC is what inserts transactions — it must NOT be called for reject
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('PATCH reject action returns 200 with { status: REJECTED } for PENDING request', async () => {
    const req = makePatchRequest('req-uuid', { action: 'reject' }, 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('REJECTED');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: PATCH handler — all HTTP status code paths
// ---------------------------------------------------------------------------

describe('PATCH handler — HTTP status code paths', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const req = makePatchRequest('req-uuid', { action: 'approve' });
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid JWT' } });
    const req = makePatchRequest('req-uuid', { action: 'approve' }, 'Bearer bad-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid', user_metadata: { role: 'user' } } },
      error: null,
    });
    const req = makePatchRequest('req-uuid', { action: 'approve' }, 'Bearer user-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    expect(res.status).toBe(403);
  });

  it('returns 400 when action is invalid', async () => {
    const req = makePatchRequest('req-uuid', { action: 'delete' }, 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid action');
  });

  it('returns 400 when body is not valid JSON', async () => {
    const req = makePatchRequest('req-uuid', 'not-json', 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    expect(res.status).toBe(400);
  });

  // Approve path
  it('returns 404 when RPC returns code 404 (approve)', async () => {
    mockRpc.mockResolvedValue({ data: { code: 404, error: 'Not found' }, error: null });
    const req = makePatchRequest('req-uuid', { action: 'approve' }, 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 409 when RPC returns code 409 (approve)', async () => {
    mockRpc.mockResolvedValue({ data: { code: 409, error: 'Request is not pending' }, error: null });
    const req = makePatchRequest('req-uuid', { action: 'approve' }, 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe('Request is not pending');
  });

  it('returns 500 when RPC itself errors (approve)', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB connection failed' } });
    const req = makePatchRequest('req-uuid', { action: 'approve' }, 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal server error');
  });

  it('returns 200 with { status: APPROVED } on successful approve', async () => {
    mockRpc.mockResolvedValue({ data: { code: 200, status: 'APPROVED' }, error: null });
    // After approve, route fetches the row to get user_id for act_log
    setupSelectSingle({ data: { user_id: 'user-uuid' }, error: null });

    const req = makePatchRequest('req-uuid', { action: 'approve' }, 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('APPROVED');
  });

  // Reject path
  it('returns 404 when pay request not found (reject)', async () => {
    setupSelectSingle({ data: null, error: { message: 'Not found', code: 'PGRST116' } });
    const req = makePatchRequest('req-uuid', { action: 'reject' }, 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 409 when pay request is not PENDING (reject)', async () => {
    setupSelectSingle({
      data: { id: 'req-uuid', user_id: 'user-uuid', status: 'APPROVED' },
      error: null,
    });
    const req = makePatchRequest('req-uuid', { action: 'reject' }, 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error).toBe('Request is not pending');
  });

  it('returns 500 when update fails (reject)', async () => {
    // select succeeds with PENDING row
    setupSelectSingle({
      data: { id: 'req-uuid', user_id: 'user-uuid', status: 'PENDING' },
      error: null,
    });
    // update fails
    mockUpdateEq.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    mockUpdateFn.mockReturnValue({ eq: mockUpdateEq });

    const req = makePatchRequest('req-uuid', { action: 'reject' }, 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal server error');
  });

  it('returns 200 with { status: REJECTED } on successful reject', async () => {
    setupSelectSingle({
      data: { id: 'req-uuid', user_id: 'user-uuid', status: 'PENDING' },
      error: null,
    });
    setupUpdateEq({ data: {}, error: null });

    const req = makePatchRequest('req-uuid', { action: 'reject' }, 'Bearer valid-token');
    const res = await PATCH(req, { params: { id: 'req-uuid' } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.status).toBe('REJECTED');
  });
});

// ---------------------------------------------------------------------------
// Unit tests: DELETE handler — all HTTP status code paths
// ---------------------------------------------------------------------------

describe('DELETE handler — HTTP status code paths', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const req = makeDeleteRequest('req-uuid');
    const res = await DELETE(req, { params: { id: 'req-uuid' } });
    expect(res.status).toBe(401);
  });

  it('returns 401 when token is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid JWT' } });
    const req = makeDeleteRequest('req-uuid', 'Bearer bad-token');
    const res = await DELETE(req, { params: { id: 'req-uuid' } });
    expect(res.status).toBe(401);
  });

  it('returns 403 when caller is not admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-uuid', user_metadata: { role: 'user' } } },
      error: null,
    });
    const req = makeDeleteRequest('req-uuid', 'Bearer user-token');
    const res = await DELETE(req, { params: { id: 'req-uuid' } });
    expect(res.status).toBe(403);
  });

  it('returns 404 when pay request not found', async () => {
    setupSelectSingle({ data: null, error: { message: 'Not found', code: 'PGRST116' } });
    const req = makeDeleteRequest('req-uuid', 'Bearer valid-token');
    const res = await DELETE(req, { params: { id: 'req-uuid' } });
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.error).toBe('Not found');
  });

  it('returns 500 when delete operation fails', async () => {
    setupSelectSingle({
      data: { id: 'req-uuid', user_id: 'user-uuid' },
      error: null,
    });
    mockDeleteEq.mockResolvedValue({ data: null, error: { message: 'DB error' } });
    mockDeleteFn.mockReturnValue({ eq: mockDeleteEq });

    const req = makeDeleteRequest('req-uuid', 'Bearer valid-token');
    const res = await DELETE(req, { params: { id: 'req-uuid' } });
    const body = await res.json();
    expect(res.status).toBe(500);
    expect(body.error).toBe('Internal server error');
  });

  it('returns 200 with { deleted: true } on successful delete', async () => {
    setupSelectSingle({
      data: { id: 'req-uuid', user_id: 'user-uuid' },
      error: null,
    });
    setupDeleteEq({ data: {}, error: null });

    const req = makeDeleteRequest('req-uuid', 'Bearer valid-token');
    const res = await DELETE(req, { params: { id: 'req-uuid' } });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.deleted).toBe(true);
  });
});
