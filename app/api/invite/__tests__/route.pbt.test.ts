/**
 * Property-based tests for the Invite API Route Handler.
 * Tests the core security and validation properties of POST /api/invite.
 *
 * Feature: alternate-registration
 *
 * These tests validate the permission matrix and input validation logic
 * using fast-check to generate a wide range of inputs.
 *
 * Validates: Requirements 5.3, 5.4, 5.7, 5.8, 5.9, 5.12
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js createClient
// ---------------------------------------------------------------------------

const mockInviteUserByEmail = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
      admin: {
        inviteUserByEmail: mockInviteUserByEmail,
      },
    },
  })),
}));

// ---------------------------------------------------------------------------
// Import the handler AFTER mocks are set up
// ---------------------------------------------------------------------------

import { POST } from '../route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a Request for the invite endpoint.
 */
function makeRequest(
  body: Record<string, unknown>,
  authHeader?: string,
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  return new Request('http://localhost/api/invite', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

/**
 * Builds a mock Supabase User with the given role.
 */
function makeUser(role: string) {
  return { user_metadata: { role } };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockInviteUserByEmail.mockResolvedValue({ data: {}, error: null });
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Non-empty string that is not all-whitespace */
const nonEmptyStringArb = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

/** Any string (including empty) */
const anyStringArb = fc.string();

/** Valid email-like string (non-empty, non-whitespace) */
const emailArb = nonEmptyStringArb;

/**
 * Non-empty role string — used in tests where we need to pass the 400 check
 * (email and role must be present) before reaching auth/permission checks.
 */
const nonEmptyRoleArb = nonEmptyStringArb;

/** Roles that are not permitted to invite anyone */
const unprivilegedRoleArb = fc.constantFrom('broker', 'user');

/** Roles that admin is NOT allowed to invite (anything except 'broker') */
const nonBrokerRoleArb = nonEmptyStringArb.filter((r) => r !== 'broker');

/** Roles that super_admin is NOT allowed to invite (anything except 'admin') */
const nonAdminRoleArb = nonEmptyStringArb.filter((r) => r !== 'admin');

// ---------------------------------------------------------------------------
// Property 8: Invite API returns 400 for any request body missing required fields
// Validates: Requirements 5.12
// ---------------------------------------------------------------------------

describe('Invite API – Property 8: Returns 400 for any request body missing required fields', () => {
  /**
   * For any request body where email or role (or both) is absent, the Invite
   * API SHALL return HTTP 400 with { "error": "Missing required fields" },
   * regardless of the caller's authentication status.
   *
   * Validates: Requirements 5.12
   */
  it('returns 400 when email is absent from the request body', async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyRoleArb,
        async (role) => {
          // Body has role but no email
          const req = makeRequest({ role }, 'Bearer some-token');
          const res = await POST(req);
          const body = await res.json();
          return res.status === 400 && body.error === 'Missing required fields';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 400 when role is absent from the request body', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        async (email) => {
          // Body has email but no role
          const req = makeRequest({ email }, 'Bearer some-token');
          const res = await POST(req);
          const body = await res.json();
          return res.status === 400 && body.error === 'Missing required fields';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 400 when both email and role are absent', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate arbitrary extra fields (not email or role)
        fc.dictionary(
          fc.string({ minLength: 1 }).filter((k) => k !== 'email' && k !== 'role'),
          fc.string(),
        ),
        async (extraFields) => {
          const req = makeRequest(extraFields, 'Bearer some-token');
          const res = await POST(req);
          const body = await res.json();
          return res.status === 400 && body.error === 'Missing required fields';
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Invite API returns 401 for any request without a valid session token
// Validates: Requirements 5.3, 5.4
// ---------------------------------------------------------------------------

describe('Invite API – Property 9: Returns 401 for any request without a valid session token', () => {
  /**
   * For any otherwise-valid request body, if the Authorization header is
   * absent or the bearer token does not correspond to an active Supabase
   * session, the Invite API SHALL return HTTP 401 with { "error": "Unauthorized" }.
   *
   * Validates: Requirements 5.3, 5.4
   */
  it('returns 401 when Authorization header is absent', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        nonEmptyRoleArb, // non-empty so we pass the 400 check
        async (email, role) => {
          // No Authorization header
          const req = makeRequest({ email, role });
          const res = await POST(req);
          const body = await res.json();
          return res.status === 401 && body.error === 'Unauthorized';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 401 when bearer token is invalid (getUser returns error)', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        nonEmptyRoleArb, // non-empty so we pass the 400 check
        nonEmptyStringArb, // arbitrary invalid token
        async (email, role, invalidToken) => {
          mockGetUser.mockResolvedValue({
            data: { user: null },
            error: { message: 'Invalid JWT' },
          });
          const req = makeRequest({ email, role }, `Bearer ${invalidToken}`);
          const res = await POST(req);
          const body = await res.json();
          return res.status === 401 && body.error === 'Unauthorized';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 401 when getUser returns no user (expired/revoked token)', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        nonEmptyRoleArb, // non-empty so we pass the 400 check
        nonEmptyStringArb, // arbitrary token
        async (email, role, token) => {
          mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
          const req = makeRequest({ email, role }, `Bearer ${token}`);
          const res = await POST(req);
          const body = await res.json();
          return res.status === 401 && body.error === 'Unauthorized';
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 10: Invite API returns 403 for broker or user callers regardless of requested role
// Validates: Requirements 5.7
// ---------------------------------------------------------------------------

describe('Invite API – Property 10: Returns 403 for broker or user callers regardless of requested role', () => {
  /**
   * For any caller whose resolved role is 'broker' or 'user', and for any
   * value of the role field in the request body, the Invite API SHALL return
   * HTTP 403 with { "error": "Forbidden" }.
   *
   * Validates: Requirements 5.7
   */
  it('returns 403 for broker callers regardless of requested role', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        nonEmptyRoleArb, // non-empty so we pass the 400 check; any role value
        async (email, requestedRole) => {
          mockGetUser.mockResolvedValue({
            data: { user: makeUser('broker') },
            error: null,
          });
          const req = makeRequest({ email, role: requestedRole }, 'Bearer broker-token');
          const res = await POST(req);
          const body = await res.json();
          return res.status === 403 && body.error === 'Forbidden';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 403 for user callers regardless of requested role', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        nonEmptyRoleArb, // non-empty so we pass the 400 check; any role value
        async (email, requestedRole) => {
          mockGetUser.mockResolvedValue({
            data: { user: makeUser('user') },
            error: null,
          });
          const req = makeRequest({ email, role: requestedRole }, 'Bearer user-token');
          const res = await POST(req);
          const body = await res.json();
          return res.status === 403 && body.error === 'Forbidden';
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: Invite API enforces role-escalation prevention for admin and super_admin callers
// Validates: Requirements 5.8, 5.9
// ---------------------------------------------------------------------------

describe('Invite API – Property 11: Enforces role-escalation prevention for admin and super_admin callers', () => {
  /**
   * For any caller with role 'admin' and any requested invite role that is
   * not 'broker', the Invite API SHALL return HTTP 403.
   * For any caller with role 'super_admin' and any requested invite role that
   * is not 'admin', the Invite API SHALL return HTTP 403.
   *
   * Validates: Requirements 5.8, 5.9
   */
  it('returns 403 when admin requests any role other than broker', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        nonBrokerRoleArb, // any non-empty role that is NOT 'broker'
        async (email, requestedRole) => {
          mockGetUser.mockResolvedValue({
            data: { user: makeUser('admin') },
            error: null,
          });
          const req = makeRequest({ email, role: requestedRole }, 'Bearer admin-token');
          const res = await POST(req);
          const body = await res.json();
          return res.status === 403 && body.error === 'Forbidden';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 403 when super_admin requests any role other than admin', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        nonAdminRoleArb, // any non-empty role that is NOT 'admin'
        async (email, requestedRole) => {
          mockGetUser.mockResolvedValue({
            data: { user: makeUser('super_admin') },
            error: null,
          });
          const req = makeRequest({ email, role: requestedRole }, 'Bearer super-admin-token');
          const res = await POST(req);
          const body = await res.json();
          return res.status === 403 && body.error === 'Forbidden';
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 200 when admin requests broker (the only permitted role)', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        async (email) => {
          mockGetUser.mockResolvedValue({
            data: { user: makeUser('admin') },
            error: null,
          });
          mockInviteUserByEmail.mockResolvedValue({ data: {}, error: null });
          const req = makeRequest({ email, role: 'broker' }, 'Bearer admin-token');
          const res = await POST(req);
          const body = await res.json();
          return res.status === 200 && body.success === true;
        },
      ),
      { numRuns: 50 },
    );
  });

  it('returns 200 when super_admin requests admin (the only permitted role)', async () => {
    await fc.assert(
      fc.asyncProperty(
        emailArb,
        async (email) => {
          mockGetUser.mockResolvedValue({
            data: { user: makeUser('super_admin') },
            error: null,
          });
          mockInviteUserByEmail.mockResolvedValue({ data: {}, error: null });
          const req = makeRequest({ email, role: 'admin' }, 'Bearer super-admin-token');
          const res = await POST(req);
          const body = await res.json();
          return res.status === 200 && body.success === true;
        },
      ),
      { numRuns: 50 },
    );
  });
});
