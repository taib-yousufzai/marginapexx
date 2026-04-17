/**
 * Unit tests for the Invite API Route Handler at app/api/invite/route.ts
 *
 * Tests the permission matrix and request validation logic.
 *
 * Validates: Requirements 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

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
 * Builds a minimal Request object for the invite endpoint.
 */
function makeRequest(
  body: Record<string, unknown> | null,
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
    body: body !== null ? JSON.stringify(body) : undefined,
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
  // Default: getUser returns a valid user (overridden per test)
  mockGetUser.mockResolvedValue({ data: { user: makeUser('user') }, error: null });
  // Default: inviteUserByEmail succeeds
  mockInviteUserByEmail.mockResolvedValue({ data: {}, error: null });
  // Set env vars
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

// ---------------------------------------------------------------------------
// 400 — Missing required fields
// Validates: Requirement 5.12
// ---------------------------------------------------------------------------

describe('POST /api/invite — 400 Missing required fields', () => {
  it('returns 400 when email is missing', async () => {
    const req = makeRequest({ role: 'admin' }, 'Bearer valid-token');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Missing required fields' });
  });

  it('returns 400 when role is missing', async () => {
    const req = makeRequest({ email: 'test@example.com' }, 'Bearer valid-token');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Missing required fields' });
  });

  it('returns 400 when both email and role are missing', async () => {
    const req = makeRequest({}, 'Bearer valid-token');
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Missing required fields' });
  });

  it('returns 400 when body is not valid JSON', async () => {
    const req = new Request('http://localhost/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
      body: 'not-json',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({ error: 'Missing required fields' });
  });
});

// ---------------------------------------------------------------------------
// 401 — Unauthorized
// Validates: Requirements 5.3, 5.4
// ---------------------------------------------------------------------------

describe('POST /api/invite — 401 Unauthorized', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const req = makeRequest({ email: 'test@example.com', role: 'admin' });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when Authorization header is not Bearer format', async () => {
    const req = makeRequest(
      { email: 'test@example.com', role: 'admin' },
      'Basic dXNlcjpwYXNz',
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when token is invalid (getUser returns error)', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid JWT' },
    });
    const req = makeRequest(
      { email: 'test@example.com', role: 'admin' },
      'Bearer invalid-token',
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });

  it('returns 401 when getUser returns no user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    const req = makeRequest(
      { email: 'test@example.com', role: 'admin' },
      'Bearer expired-token',
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ error: 'Unauthorized' });
  });
});

// ---------------------------------------------------------------------------
// 200 — Authorised invitations
// Validates: Requirements 5.5, 5.6, 5.10
// ---------------------------------------------------------------------------

describe('POST /api/invite — 200 Authorised invitations', () => {
  it('returns 200 when super_admin invites admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: makeUser('super_admin') },
      error: null,
    });
    const req = makeRequest(
      { email: 'newadmin@example.com', role: 'admin' },
      'Bearer super-admin-token',
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(mockInviteUserByEmail).toHaveBeenCalledWith('newadmin@example.com', {
      data: { role: 'admin' },
    });
  });

  it('returns 200 when admin invites broker', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: makeUser('admin') },
      error: null,
    });
    const req = makeRequest(
      { email: 'newbroker@example.com', role: 'broker' },
      'Bearer admin-token',
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(mockInviteUserByEmail).toHaveBeenCalledWith('newbroker@example.com', {
      data: { role: 'broker' },
    });
  });
});

// ---------------------------------------------------------------------------
// 403 — Forbidden
// Validates: Requirements 5.7, 5.8, 5.9
// ---------------------------------------------------------------------------

describe('POST /api/invite — 403 Forbidden', () => {
  it('returns 403 when super_admin tries to invite broker', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: makeUser('super_admin') },
      error: null,
    });
    const req = makeRequest(
      { email: 'newbroker@example.com', role: 'broker' },
      'Bearer super-admin-token',
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 when super_admin tries to invite user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: makeUser('super_admin') },
      error: null,
    });
    const req = makeRequest(
      { email: 'newuser@example.com', role: 'user' },
      'Bearer super-admin-token',
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 when admin tries to invite admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: makeUser('admin') },
      error: null,
    });
    const req = makeRequest(
      { email: 'newadmin@example.com', role: 'admin' },
      'Bearer admin-token',
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 when admin tries to invite user', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: makeUser('admin') },
      error: null,
    });
    const req = makeRequest(
      { email: 'newuser@example.com', role: 'user' },
      'Bearer admin-token',
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 when broker tries to invite anyone', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: makeUser('broker') },
      error: null,
    });
    const req = makeRequest(
      { email: 'someone@example.com', role: 'broker' },
      'Bearer broker-token',
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });

  it('returns 403 when user tries to invite anyone', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: makeUser('user') },
      error: null,
    });
    const req = makeRequest(
      { email: 'someone@example.com', role: 'broker' },
      'Bearer user-token',
    );
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body).toEqual({ error: 'Forbidden' });
  });
});

// ---------------------------------------------------------------------------
// 500 — Supabase error on invite
// Validates: Requirement 5.11
// ---------------------------------------------------------------------------

describe('POST /api/invite — 500 Supabase error on invite', () => {
  it('returns 500 with descriptive error when inviteUserByEmail fails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: makeUser('super_admin') },
      error: null,
    });
    mockInviteUserByEmail.mockResolvedValue({
      data: null,
      error: { message: 'User already registered' },
    });
    const req = makeRequest(
      { email: 'existing@example.com', role: 'admin' },
      'Bearer super-admin-token',
    );
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty('error');
    expect(typeof body.error).toBe('string');
    expect(body.error.length).toBeGreaterThan(0);
  });
});
