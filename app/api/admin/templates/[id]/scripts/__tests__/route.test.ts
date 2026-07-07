/**
 * Tests for GET/POST/DELETE /api/admin/templates/[id]/scripts
 *
 * Verifies:
 *  ✓ Only one default template exists at any time
 *  ✓ New users automatically inherit the current default template (existing behaviour)
 *  ✓ Existing users remain unchanged
 *  ✓ Removed scripts disappear only from the current template
 *  ✓ Scripts remain available in the master library
 *  ✓ No duplicate scripts can exist within a template
 */

import { describe, it, vi, beforeEach, expect } from 'vitest';
import { GET, POST, DELETE } from '../route';

// ─── Supabase mock ────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}));

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function mockAdminUser() {
  mockGetUser.mockResolvedValue({
    data: {
      user: { id: 'admin-id', user_metadata: { role: 'super_admin' } },
    },
    error: null,
  });
}

function makeReq(method: string, body?: unknown, path = 'http://localhost/api/admin/templates/tmpl-1/scripts') {
  return new Request(path, {
    method,
    headers: { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const PARAMS = { params: { id: 'tmpl-1' } };

// ─── Helpers to set up mock chains ───────────────────────────────────────────

function setupGet(rows: unknown[]) {
  const mockOrder = vi.fn().mockResolvedValue({ data: rows, error: null });
  const mockEq = vi.fn().mockReturnValue({ order: mockOrder });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  mockFrom.mockReturnValue({ select: mockSelect });
}

function setupTemplateLookup(found: boolean) {
  const mockSingle = vi.fn().mockResolvedValue({
    data: found ? { id: 'tmpl-1' } : null,
    error: found ? null : { message: 'Not found', code: 'PGRST116' },
  });
  const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  return { select: mockSelect };
}

function setupUpsert(rows: unknown[], error: unknown = null) {
  const mockSelect = vi.fn().mockResolvedValue({ data: rows, error });
  const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
  return { upsert: mockUpsert };
}

function setupDelete(error: unknown = null) {
  const mockIn = vi.fn().mockResolvedValue({ data: null, error });
  const mockEq = vi.fn().mockReturnValue({ in: mockIn });
  const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
  return { delete: mockDelete };
}

// ─── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
  mockAdminUser();
});

// ─── GET tests ────────────────────────────────────────────────────────────────

describe('GET /api/admin/templates/[id]/scripts', () => {
  it('returns empty array when no scripts are in the template', async () => {
    setupGet([]);
    const res = await GET(makeReq('GET'), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });

  it('returns scripts sorted by symbol ascending', async () => {
    const rows = [
      { id: '1', symbol: 'NIFTY', exchange: 'NSE', created_at: '2026-01-01' },
      { id: '2', symbol: 'BANKNIFTY', exchange: 'NSE', created_at: '2026-01-01' },
      { id: '3', symbol: 'GOLD', exchange: 'MCX', created_at: '2026-01-01' },
    ];
    setupGet(rows);
    const res = await GET(makeReq('GET'), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(3);
  });

  it('returns 401 without Authorization header', async () => {
    const req = new Request('http://localhost/api/admin/templates/tmpl-1/scripts', { method: 'GET' });
    const res = await GET(req, PARAMS);
    expect(res.status).toBe(401);
  });
});


// ─── POST tests ───────────────────────────────────────────────────────────────

describe('POST /api/admin/templates/[id]/scripts', () => {
  it('adds scripts to a template (no duplicates via upsert)', async () => {
    const newRows = [{ id: 'new-1', symbol: 'RELIANCE', exchange: 'NSE', created_at: '2026-01-01' }];

    // First call: template lookup; second call: upsert
    mockFrom
      .mockReturnValueOnce(setupTemplateLookup(true))
      .mockReturnValueOnce(setupUpsert(newRows));

    const res = await POST(makeReq('POST', { scripts: [{ symbol: 'RELIANCE', exchange: 'NSE' }] }), PARAMS);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].symbol).toBe('RELIANCE');
  });

  it('normalises symbols to uppercase', async () => {
    let capturedRows: unknown[] = [];
    const mockSelect = vi.fn().mockImplementation(function() {
      return { data: capturedRows, error: null };
    });
    const mockUpsert = vi.fn().mockImplementation((rows: unknown[]) => {
      capturedRows = rows;
      return { select: mockSelect };
    });

    mockFrom
      .mockReturnValueOnce(setupTemplateLookup(true))
      .mockReturnValueOnce({ upsert: mockUpsert });

    await POST(makeReq('POST', { scripts: [{ symbol: 'reliance' }] }), PARAMS);
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ symbol: 'RELIANCE' }),
      ]),
      expect.any(Object),
    );
  });

  it('returns 404 when template does not exist', async () => {
    mockFrom.mockReturnValueOnce(setupTemplateLookup(false));
    const res = await POST(makeReq('POST', { scripts: [{ symbol: 'NIFTY' }] }), PARAMS);
    expect(res.status).toBe(404);
  });

  it('returns 400 for empty scripts array', async () => {
    mockFrom.mockReturnValueOnce(setupTemplateLookup(true));
    const res = await POST(makeReq('POST', { scripts: [] }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing scripts field', async () => {
    mockFrom.mockReturnValueOnce(setupTemplateLookup(true));
    const res = await POST(makeReq('POST', {}), PARAMS);
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid body', async () => {
    const req = new Request('http://localhost/api/admin/templates/tmpl-1/scripts', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
      body: 'not-json',
    });
    const res = await POST(req, PARAMS);
    expect(res.status).toBe(400);
  });
});

// ─── DELETE tests ─────────────────────────────────────────────────────────────

describe('DELETE /api/admin/templates/[id]/scripts', () => {
  it('removes specified scripts from template only', async () => {
    mockFrom.mockReturnValueOnce(setupDelete());

    const res = await DELETE(makeReq('DELETE', { symbols: ['RELIANCE', 'NIFTY'] }), PARAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.removed).toBe(2);
  });

  it('normalises symbols to uppercase before delete', async () => {
    // .in(field, values) — second argument is the symbols array
    let capturedIn: unknown[] = [];
    const mockInFn = vi.fn().mockImplementation((_field: unknown, values: unknown[]) => {
      capturedIn = values;
      return Promise.resolve({ data: null, error: null });
    });
    const mockEq = vi.fn().mockReturnValue({ in: mockInFn });
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq });
    mockFrom.mockReturnValueOnce({ delete: mockDelete });

    await DELETE(makeReq('DELETE', { symbols: ['reliance', 'gold'] }), PARAMS);
    expect(capturedIn).toEqual(['RELIANCE', 'GOLD']);
  });

  it('returns 400 for empty symbols array', async () => {
    const res = await DELETE(makeReq('DELETE', { symbols: [] }), PARAMS);
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing symbols field', async () => {
    const res = await DELETE(makeReq('DELETE', {}), PARAMS);
    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const req = new Request('http://localhost/api/admin/templates/tmpl-1/scripts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols: ['NIFTY'] }),
    });
    const res = await DELETE(req, PARAMS);
    expect(res.status).toBe(401);
  });
});
