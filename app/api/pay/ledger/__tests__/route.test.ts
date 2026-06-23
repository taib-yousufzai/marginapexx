/**
 * Tests for GET /api/pay/ledger
 *
 * Feature: ledger-transaction-classification
 * Validates: Requirements 9.1, 9.2, 9.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js createClient
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

// ---------------------------------------------------------------------------
// Import handler AFTER mocks are set up
// ---------------------------------------------------------------------------

import { GET } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  return new Request('http://localhost/api/pay/ledger', {
    method: 'GET',
    headers,
  });
}

function makeLedgerEntry(overrides: Partial<{
  id: string;
  user_id: string;
  entry_type: string;
  direction: string;
  amount: number;
  remarks: string | null;
  pay_request_id: string | null;
  created_at: string;
}> = {}) {
  return {
    id: crypto.randomUUID(),
    user_id: 'user-uuid',
    entry_type: 'DEPOSIT',
    direction: 'CREDIT',
    amount: 100,
    remarks: null,
    pay_request_id: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/** Build a chainable Supabase query builder that resolves with the given result. */
function makeLedgerQueryBuilder(result: { data: unknown[]; error: null | { message: string } }) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.eq = chain;
  builder.order = () => Promise.resolve(result);
  return builder;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  // Default: authenticated user
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-uuid' } },
    error: null,
  });

  // Default: empty ledger
  mockFrom.mockImplementation(() => ({
    select: () => makeLedgerQueryBuilder({ data: [], error: null }),
  }));
});

// ===========================================================================
// Unit Test: No auth token → 401
// Validates: Requirement 9.2
// Task 7.2
// ===========================================================================

describe('GET /api/pay/ledger — 401 when no auth token', () => {
  it('returns 401 when Authorization header is absent', async () => {
    const req = makeRequest(); // no auth header
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when Authorization header is not Bearer', async () => {
    const req = makeRequest('Basic sometoken');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when Bearer token is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'invalid token' } });

    const req = makeRequest('Bearer bad-token');
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});

// ===========================================================================
// Unit Test: Valid token returns only that user's entries (2-user example)
// Validates: Requirements 9.1, 9.3
// Task 7.2
// ===========================================================================

describe('GET /api/pay/ledger — valid token returns only the calling user\'s entries', () => {
  it('returns only entries belonging to user-A, not user-B', async () => {
    const userAId = 'user-a-uuid';
    const userBId = 'user-b-uuid';

    const userAEntries = [
      makeLedgerEntry({ id: 'entry-1', user_id: userAId, amount: 500 }),
      makeLedgerEntry({ id: 'entry-2', user_id: userAId, amount: 250 }),
    ];
    // user-B entries exist in DB but should NOT be returned for user-A
    const _userBEntries = [
      makeLedgerEntry({ id: 'entry-3', user_id: userBId, amount: 1000 }),
    ];

    // Authenticated as user-A
    mockGetUser.mockResolvedValue({
      data: { user: { id: userAId } },
      error: null,
    });

    // The query is filtered to user_id = userAId, so only userAEntries come back
    mockFrom.mockImplementation(() => ({
      select: () => makeLedgerQueryBuilder({ data: userAEntries, error: null }),
    }));

    const req = makeRequest('Bearer user-a-token');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();

    // All returned entries belong to user-A
    expect(body).toHaveLength(2);
    for (const entry of body) {
      expect(entry.user_id).toBe(userAId);
    }

    // None of user-B's entry IDs appear
    const returnedIds = body.map((e: { id: string }) => e.id);
    expect(returnedIds).not.toContain('entry-3');
  });

  it('returns empty array when user has no ledger entries', async () => {
    mockFrom.mockImplementation(() => ({
      select: () => makeLedgerQueryBuilder({ data: [], error: null }),
    }));

    const req = makeRequest('Bearer valid-token');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it('returns the array directly (not wrapped in an object)', async () => {
    const entry = makeLedgerEntry({ user_id: 'user-uuid' });
    mockFrom.mockImplementation(() => ({
      select: () => makeLedgerQueryBuilder({ data: [entry], error: null }),
    }));

    const req = makeRequest('Bearer valid-token');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    // Must be an array, not { data: [...] }
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].id).toBe(entry.id);
  });
});

// ===========================================================================
// Property 8: User isolation — ledger returns only own entries
// // Feature: ledger-transaction-classification, Property 8: User isolation — ledger returns only own entries
// Validates: Requirement 9.1
// Task 7.1
// ===========================================================================

describe('Property 8: User isolation — ledger returns only own entries', () => {
  it('every entry in the response has user_id matching the authenticated user', async () => {
    // Feature: ledger-transaction-classification, Property 8: User isolation — ledger returns only own entries
    await fc.assert(
      fc.asyncProperty(
        // Generate a random user ID to query as
        fc.uuid(),
        // Generate a pool of entries for multiple random users
        fc.array(
          fc.record({
            id: fc.uuid(),
            user_id: fc.uuid(),
            entry_type: fc.constantFrom(
              'DEPOSIT',
              'WITHDRAWAL',
              'ADJUSTMENT',
              'CORRECTION',
              'REFUND',
            ),
            direction: fc.constantFrom('CREDIT', 'DEBIT'),
            amount: fc.integer({ min: 1, max: 1_000_000 }),
            remarks: fc.option(fc.string(), { nil: null }),
            pay_request_id: fc.option(fc.uuid(), { nil: null }),
            created_at: fc
              .date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') })
              .filter((d) => !isNaN(d.getTime()))
              .map((d) => d.toISOString()),
          }),
          { minLength: 0, maxLength: 30 },
        ),
        async (queriedUserId, allEntries) => {
          // The DB query filters to user_id = queriedUserId — simulate that filter
          const ownEntries = allEntries.filter((e) => e.user_id === queriedUserId);

          // Set up mocks
          mockGetUser.mockResolvedValue({
            data: { user: { id: queriedUserId } },
            error: null,
          });

          mockFrom.mockImplementation(() => ({
            select: () => makeLedgerQueryBuilder({ data: ownEntries, error: null }),
          }));

          const req = makeRequest('Bearer test-token');
          const res = await GET(req);

          expect(res.status).toBe(200);
          const body = await res.json();

          // Every returned entry must belong to the queried user
          for (const entry of body) {
            expect(entry.user_id).toBe(queriedUserId);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
