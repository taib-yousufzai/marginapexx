import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSelect, mockEq, mockGt, mockRpc, mockInsert, adminMock } = vi.hoisted(() => {
  const mockSelect = vi.fn();
  const mockEq = vi.fn();
  const mockGt = vi.fn();
  const mockRpc = vi.fn();
  const mockInsert = vi.fn();

  // Create a builder pattern mock
  const createChain = () => {
    const chain: any = {
      select: mockSelect,
      eq: mockEq,
      gt: mockGt,
      insert: mockInsert
    };
    
    // We add then() so the chain itself can be awaited
    chain.then = function(resolve: any) {
      // By default return empty data, tests can override by resolving mockGt or mockSelect
      return Promise.resolve({ data: [] }).then(resolve);
    };

    return chain;
  };

  mockSelect.mockImplementation(() => createChain());
  mockEq.mockImplementation(() => createChain());
  mockGt.mockImplementation(() => createChain());
  mockInsert.mockImplementation(() => createChain());

  const adminMock = {
    from: vi.fn(() => createChain()),
    rpc: mockRpc
  };

  return { mockSelect, mockEq, mockGt, mockRpc, mockInsert, adminMock };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => adminMock)
}));

vi.mock('@/lib/kiteSession', () => ({
  getSharedKiteSession: vi.fn(() => Promise.resolve({ accessToken: 'mock_token' }))
}));

vi.mock('@/lib/carryBrokerage', () => ({
  calculateCarryBrokerage: vi.fn(() => 0)
}));

// Mock fetch
global.fetch = vi.fn();

// Import route handler after mocking
import { GET } from '../route';

describe('Auto Square Off Cron Job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock the current date to be 16:00 IST (10:30 UTC)
    // 16:00 IST = 960 minutes.
    vi.useFakeTimers();
    const mockDate = new Date('2026-07-06T10:30:00Z'); 
    vi.setSystemTime(mockDate);
  });

  it('should return 401 if secret is invalid', async () => {
    const req = new Request('http://localhost/api/cron/auto-square-off?secret=invalid');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('should process intraday positions if market is closed', async () => {
    process.env.AUTOLOGIN_SECRET = 'secret123';
    
    // Override the `.then` for the chain temporarily
    const originalFrom = adminMock.from;
    adminMock.from = vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gt: vi.fn(() => chain),
        insert: vi.fn(() => chain)
      };
      
      chain.then = function(resolve: any) {
        if (table === 'trading_hours') {
          return Promise.resolve({ data: [{ id: 'nse', name: 'NSE', end_time: '15:30', is_active: true }] }).then(resolve);
        }
        if (table === 'positions') {
          return Promise.resolve({ data: [{
            id: 'pos_1', user_id: 'user_1', symbol: 'RELIANCE', side: 'BUY', settlement: 'nse', product_type: 'INTRADAY', qty_open: 10, entry_price: 2500, ltp: 2550
          }] }).then(resolve);
        }
        if (table === 'profiles') {
          return Promise.resolve({ data: [{ id: 'user_1', intraday_sq_off: true, trading_mode: 'normal' }] }).then(resolve);
        }
        return Promise.resolve({ data: [] }).then(resolve);
      };
      return chain;
    });

    mockRpc.mockResolvedValueOnce({ error: null });

    const req = new Request('http://localhost/api/cron/auto-square-off?secret=secret123');
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.closedMarkets).toContain('nse');
    expect(json.results.intradayClosed).toBe(1);
    
    expect(mockRpc).toHaveBeenCalledWith('close_position', expect.objectContaining({
      p_position_id: 'pos_1',
      p_closed_by: 'SYSTEM_ACTION'
    }));

    adminMock.from = originalFrom;
  });

  it('should skip intraday positions if market is still open', async () => {
    process.env.AUTOLOGIN_SECRET = 'secret123';
    
    const originalFrom = adminMock.from;
    adminMock.from = vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        gt: vi.fn(() => chain)
      };
      
      chain.then = function(resolve: any) {
        if (table === 'trading_hours') {
          return Promise.resolve({ data: [{ id: 'mcx', name: 'MCX', end_time: '23:30', is_active: true }] }).then(resolve);
        }
        return Promise.resolve({ data: [] }).then(resolve);
      };
      return chain;
    });

    const req = new Request('http://localhost/api/cron/auto-square-off?secret=secret123');
    const res = await GET(req);
    const json = await res.json();

    expect(json.success).toBe(true);
    expect(json.message).toBe('No markets are currently closed.');
    
    adminMock.from = originalFrom;
  });
  
  it('should skip carry forward positions', async () => {
    process.env.AUTOLOGIN_SECRET = 'secret123';
    
    const mockEqLocal = vi.fn();
    const originalFrom = adminMock.from;
    adminMock.from = vi.fn((table: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: mockEqLocal.mockImplementation(() => chain),
        gt: vi.fn(() => chain)
      };
      
      chain.then = function(resolve: any) {
        if (table === 'trading_hours') {
          return Promise.resolve({ data: [{ id: 'nse', name: 'NSE', end_time: '15:30', is_active: true }] }).then(resolve);
        }
        return Promise.resolve({ data: [] }).then(resolve);
      };
      return chain;
    });

    const req = new Request('http://localhost/api/cron/auto-square-off?secret=secret123');
    await GET(req);

    expect(mockEqLocal).toHaveBeenCalledWith('product_type', 'INTRADAY');
    
    adminMock.from = originalFrom;
  });
});
