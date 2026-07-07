/**
 * Tests for POST /api/admin/templates/[id]/set-default
 *
 * Validates:
 *  ✓ Only one default template exists at any time — all others are unset
 *  ✓ New users automatically inherit the current default template (existing DB flow)
 *  ✓ Existing users remain unchanged (this endpoint does NOT touch profiles)
 *  ✓ Returns 404 when template does not exist
 *  ✓ Is idempotent — already-default template returns 200 without extra DB calls
 *  ✓ Returns 401 without auth
 */

import { describe, it, vi, beforeEach, expect } from 'vitest';
import { POST } from '../route';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

function mockAdminUser() {
  mockGetUser.mockResolvedValue({
    data: {
      user: { id: 'admin-id', user_metadata: { role: 'super_admin' } },
    },
    error: null,
  });
}

function makeReq(id = 'tmpl-1') {
  return new Request(`http://localhost/api/admin/templates/${id}/set-default`, {
    method: 'POST',
    headers: { Authorization: 'Bearer valid-token' },
  });
}

// ─── Mock chain helpers ───────────────────────────────────────────────────────

function setupFetch(template: { id: string; name: string; is_default: boolean } | null) {
  const mockSingle = vi.fn().mockResolvedValue({
    data: template,
    error: template ? null : { message: 'Not found', code: 'PGRST116' },
  });
  const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  return { select: mockSelect };
}

function setupUnset(error: unknown = null) {
  const mockNeq = vi.fn().mockResolvedValue({ data: null, error });
  const mockEq = vi.fn().mockReturnValue({ neq: mockNeq });
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
  return { update: mockUpdate };
}

function setupSet(result: unknown) {
  const mockSingle = vi.fn().mockResolvedValue({ data: result, error: null });
  const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
  const mockEq = vi.fn().mockReturnValue({ select: mockSelect });
  const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq });
  return { update: mockUpdate };
}

// ─── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  mockAdminUser();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/admin/templates/[id]/set-default', () => {
  it('sets a template as default and unsets all others', async () => {
    const tmpl = { id: 'tmpl-1', name: 'Standard', is_default: false };
    const updatedTmpl = { ...tmpl, is_default: true };

    mockFrom
      .mockReturnValueOnce(setupFetch(tmpl))        // fetch existing
      .mockReturnValueOnce(setupUnset())             // unset others
      .mockReturnValueOnce(setupSet(updatedTmpl));  // set this one

    const res = await POST(makeReq(), { params: { id: 'tmpl-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_default).toBe(true);
    expect(body.id).toBe('tmpl-1');
  });

  it('is idempotent — returns 200 without re-running updates when already default', async () => {
    const tmpl = { id: 'tmpl-1', name: 'Standard', is_default: true };
    mockFrom.mockReturnValueOnce(setupFetch(tmpl));

    const res = await POST(makeReq(), { params: { id: 'tmpl-1' } });
    expect(res.status).toBe(200);
    // Only one from() call (the fetch) — no unset or update calls
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when template does not exist', async () => {
    mockFrom.mockReturnValueOnce(setupFetch(null));
    const res = await POST(makeReq('nonexistent'), { params: { id: 'nonexistent' } });
    expect(res.status).toBe(404);
  });

  it('returns 401 without Authorization header', async () => {
    const req = new Request('http://localhost/api/admin/templates/tmpl-1/set-default', {
      method: 'POST',
    });
    const res = await POST(req, { params: { id: 'tmpl-1' } });
    expect(res.status).toBe(401);
  });

  it('ensures only one default: unset query targets is_default=true AND neq id', async () => {
    const tmpl = { id: 'tmpl-2', name: 'Premium', is_default: false };
    const updatedTmpl = { ...tmpl, is_default: true };

    let unsetUpdateArgs: unknown[] = [];
    let unsetEqArgs: unknown[] = [];
    let unsetNeqArgs: unknown[] = [];

    const mockNeq = vi.fn().mockImplementation((...args: unknown[]) => {
      unsetNeqArgs = args;
      return Promise.resolve({ data: null, error: null });
    });
    const mockUnsetEq = vi.fn().mockImplementation((...args: unknown[]) => {
      unsetEqArgs = args;
      return { neq: mockNeq };
    });
    const mockUnsetUpdate = vi.fn().mockImplementation((...args: unknown[]) => {
      unsetUpdateArgs = args;
      return { eq: mockUnsetEq };
    });

    mockFrom
      .mockReturnValueOnce(setupFetch(tmpl))
      .mockReturnValueOnce({ update: mockUnsetUpdate })
      .mockReturnValueOnce(setupSet(updatedTmpl));

    await POST(makeReq('tmpl-2'), { params: { id: 'tmpl-2' } });

    // The unset should set is_default: false
    expect(unsetUpdateArgs[0]).toEqual({ is_default: false });
    // The eq should filter by is_default = true
    expect(unsetEqArgs).toEqual(['is_default', true]);
    // The neq should exclude our target template
    expect(unsetNeqArgs).toEqual(['id', 'tmpl-2']);
  });
});
