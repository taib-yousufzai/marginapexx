import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { NextRequest } from 'next/server';

// Mock dependencies
vi.mock('@/lib/adminClient', () => {
  const mockRpc = vi.fn();
  const mockFrom = vi.fn();
  
  return {
    getAdminClient: vi.fn(() => ({
      rpc: mockRpc,
      from: mockFrom,
    })),
    getUserFromRequest: vi.fn(),
  };
});

vi.mock('@/lib/kiteSession', () => ({
  getSharedKiteSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/brokerage', () => ({
  calculateCarryBrokerage: vi.fn().mockReturnValue(0),
}));

global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({}),
});

describe('User Position Close POST /api/positions/close', () => {
  let mockRpc: any;
  let mockFrom: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const adminClientModule = await import('@/lib/adminClient');
    (adminClientModule.getUserFromRequest as any).mockResolvedValue({ id: 'user-456' });
    
    const adminClient = adminClientModule.getAdminClient();
    mockRpc = adminClient.rpc;
    mockFrom = adminClient.from;

    mockFrom.mockImplementation((table: string) => {
      const qb: any = {
        select: vi.fn(() => qb),
        in: vi.fn(() => qb),
        eq: vi.fn(() => qb),
        single: vi.fn(() => qb),
      };
      
      qb.then = function(resolve: any) {
        if (table === 'positions') {
          resolve({
            data: [{
              id: 'pos-123',
              user_id: 'user-456',
              symbol: 'NIFTY',
              side: 'BUY',
              settlement: 'NSE',
              qty_open: 50,
              entry_price: 100,
              ltp: 110,
              product_type: 'INTRADAY',
              entry_time: new Date(Date.now() - 500000).toISOString(),
            }],
            error: null,
          });
        } else if (table === 'profiles') {
          resolve({
            data: { parent_id: null, trading_mode: 'normal' },
            error: null,
          });
        } else if (table === 'trading_hours') {
          resolve({
            data: [{
              id: 'nse',
              name: 'NSE',
              start_time: '00:00',
              end_time: '23:59',
              is_active: true,
            }],
            error: null,
          });
        } else if (table === 'segment_settings') {
          resolve({
            data: [{
              segment: 'NSE',
              side: 'BUY',
              exit_buffer: 0.17,
              profit_hold_sec: 0,
              loss_hold_sec: 0,
            }],
            error: null,
          });
        } else {
          resolve({ data: null, error: null });
        }
      };
      
      return qb;
    });

    mockRpc.mockResolvedValue({ data: 500, error: null });
  });

  it('should call close_position RPC with p_closed_by: "USER"', async () => {
    const req = new NextRequest('http://localhost/api/positions/close', {
      method: 'POST',
      body: JSON.stringify({ positionIds: ['pos-123'] }),
    });
    
    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);

    // Verify RPC call arguments
    expect(mockRpc).toHaveBeenCalledTimes(1);
    const rpcArgs = mockRpc.mock.calls[0];
    expect(rpcArgs[0]).toBe('close_position');
    expect(rpcArgs[1]).toMatchObject({
      p_position_id: 'pos-123',
      p_user_id: 'user-456',
      p_closed_by: 'USER_ACTION', // Tracking field
    });
  });
});
