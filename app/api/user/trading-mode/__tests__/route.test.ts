import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockSingle = vi.fn();
const mockSelectEq = vi.fn();
const mockSelect = vi.fn();
const mockUpdateEq = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: vi.fn(() => ({
      select: mockSelect,
      update: mockUpdate,
    })),
  })),
}));

import { GET, POST } from '../route';

function makeGetRequest(authHeader?: string): Request {
  const headers: Record<string, string> = {};
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  return new Request('http://localhost/api/user/trading-mode', {
    method: 'GET',
    headers,
  });
}

function makePostRequest(body: Record<string, unknown>, authHeader?: string): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authHeader !== undefined) {
    headers['Authorization'] = authHeader;
  }
  return new Request('http://localhost/api/user/trading-mode', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

  mockGetUser.mockResolvedValue({
    data: { user: { id: 'user-uuid' } },
    error: null,
  });

  // Reset default chain mocks
  mockSelectEq.mockReturnValue({ single: mockSingle });
  mockSelect.mockReturnValue({ eq: mockSelectEq });

  mockUpdateEq.mockResolvedValue({ error: null });
  mockUpdate.mockReturnValue({ eq: mockUpdateEq });
});

describe('GET /api/user/trading-mode', () => {
  it('returns unauthorized if token is missing', async () => {
    const req = makeGetRequest();
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it('returns trading mode and lock information', async () => {
    mockSingle.mockResolvedValue({
      data: { trading_mode: 'scalper', mode_locked_until: '2026-05-27T00:00:00.000Z' },
      error: null,
    });

    const req = makeGetRequest('Bearer valid-token');
    const res = await GET(req as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      trading_mode: 'scalper',
      mode_locked_until: '2026-05-27T00:00:00.000Z',
    });
  });
});

describe('POST /api/user/trading-mode', () => {
  it('returns 400 for invalid body or missing trading_mode', async () => {
    const req = makePostRequest({}, 'Bearer valid-token');
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns success immediately if mode is already set to the target mode', async () => {
    mockSingle.mockResolvedValue({
      data: { trading_mode: 'normal', mode_locked_until: null },
      error: null,
    });

    const req = makePostRequest({ trading_mode: 'normal' }, 'Bearer valid-token');
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      success: true,
      trading_mode: 'normal',
      mode_locked_until: null,
    });
  });

  it('blocks switching from scalper to normal if lock has not expired', async () => {
    const futureDate = new Date(Date.now() + 3600000).toISOString(); // 1 hour in future
    mockSingle.mockResolvedValue({
      data: { trading_mode: 'scalper', mode_locked_until: futureDate },
      error: null,
    });

    const req = makePostRequest({ trading_mode: 'normal' }, 'Bearer valid-token');
    const res = await POST(req as any);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Cannot switch back to Normal Mode');
  });

  it('allows switching to scalper and sets 48 hour lock', async () => {
    mockSingle.mockResolvedValue({
      data: { trading_mode: 'normal', mode_locked_until: null },
      error: null,
    });

    const req = makePostRequest({ trading_mode: 'scalper' }, 'Bearer valid-token');
    const res = await POST(req as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.trading_mode).toBe('scalper');
    expect(body.mode_locked_until).toBeDefined();
    
    const lockTime = new Date(body.mode_locked_until).getTime();
    expect(lockTime - Date.now()).toBeGreaterThan(47 * 60 * 60 * 1000); // approx 48h
  });
});
