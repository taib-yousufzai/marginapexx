import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { positionStore } from '../../../../lib/positionStore';
import { ERRORS } from '../../../../lib/positionValidator';

// Mock getAdminClient and getUserFromRequest
const mockRpc = vi.fn();
const mockFrom = vi.fn();
const mockSupabase = {
  rpc: mockRpc,
  from: mockFrom,
};

vi.mock('@/lib/adminClient', () => {
  return {
    getAdminClient: () => mockSupabase,
    getUserFromRequest: vi.fn().mockResolvedValue({ id: 'user-123' }),
  };
});

// Mock getSharedKiteSession
vi.mock('@/lib/kiteSession', () => {
  return {
    getSharedKiteSession: vi.fn().mockResolvedValue({ accessToken: 'access-token' }),
  };
});

describe('POST /api/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    positionStore.clear();
    process.env.KITE_API_KEY = 'kite-key';
  });



  function makeRequest(body: any): any {
    return new Request('http://localhost/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' },
      body: JSON.stringify(body),
    });
  }

  it('rejects option BUY order when SELL position is active', async () => {
    const userId = 'user-123';
    // Mock the profiles, segment_settings, quotes queries
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: userId, active: true, read_only: false, segments: ['INDEX-OPT'], balance: 100000 },
            error: null,
          }),
        };
      }
      if (table === 'segment_settings' || table === 'scalper_segment_settings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { trade_allowed: true, max_order_lot: 10, intraday_leverage: 1 },
            error: null,
          }),
        };
      }
      if (table === 'positions' || table === 'market_quotes') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: [], error: null }),
          single: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return { select: vi.fn() };
    });

    // Stub the positionStore getPosition response
    vi.spyOn(positionStore, 'getPosition').mockResolvedValue({
      strike_price: 26500,
      option_type: 'CE',
      side: 'SELL',
      quantity: 5,
    });

    const body = {
      symbol: 'NIFTY2652826500CE',
      kite_instrument: 'NSE:NIFTY2652826500CE',
      segment: 'NSE - Options',
      side: 'BUY',
      order_type: 'MARKET',
      product_type: 'INTRADAY',
      qty: 2,
      lots: 1,
      client_price: 100,
      is_exit: false,
    };

    const req = makeRequest(body);
    const res = await POST(req);
    const resBody = await res.json();

    expect(res.status).toBe(400);
    expect(resBody.error).toBe(ERRORS.CANNOT_BUY_WHILE_SELL_ACTIVE);
  });

  it('accepts valid option BUY order and updates cache atomically', async () => {
    const userId = 'user-123';
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: userId, active: true, read_only: false, segments: ['INDEX-OPT'], balance: 100000 },
            error: null,
          }),
        };
      }
      if (table === 'segment_settings' || table === 'scalper_segment_settings') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { trade_allowed: true, max_order_lot: 10, intraday_leverage: 1 },
            error: null,
          }),
        };
      }
      if (table === 'positions' || table === 'market_quotes') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: [], error: null }),
          single: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      return { select: vi.fn() };
    });

    // Mock empty/null position in the store
    vi.spyOn(positionStore, 'getPosition').mockResolvedValue(null);
    const spyApplyOrder = vi.spyOn(positionStore, 'applyOrder');

    // Mock place_order RPC success
    mockRpc.mockResolvedValue({ data: 'order-123', error: null });

    const body = {
      symbol: 'NIFTY2652826500CE',
      kite_instrument: 'NSE:NIFTY2652826500CE',
      segment: 'NSE - Options',
      side: 'BUY',
      order_type: 'MARKET',
      product_type: 'INTRADAY',
      qty: 2,
      lots: 1,
      client_price: 100,
      is_exit: false,
    };

    const req = makeRequest(body);
    const res = await POST(req);
    const resBody = await res.json();

    expect(res.status).toBe(201);
    expect(resBody.order_id).toBe('order-123');
    expect(spyApplyOrder).toHaveBeenCalledTimes(1);
  });
});
