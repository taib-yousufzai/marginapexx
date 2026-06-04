import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processPendingOrdersAndPositions } from '../orderMatching';

const mockQueryResult = (data: any) => {
  const qb: any = {
    eq: vi.fn().mockImplementation(() => qb),
    single: vi.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] || null : data, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: Array.isArray(data) ? data[0] || null : data, error: null }),
    then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve)
  };
  return qb;
};

// Mock the admin client module
const mockInsert = vi.fn().mockResolvedValue({ data: null, error: null });
const mockUpdate = vi.fn().mockReturnValue(mockQueryResult(null));
const mockSelect = vi.fn();
const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });

const mockSupabase = {
  from: vi.fn().mockImplementation(() => {
    return {
      select: mockSelect,
      insert: mockInsert,
      update: mockUpdate,
      eq: vi.fn().mockImplementation(() => mockQueryResult(null))
    };
  }),
  rpc: mockRpc
};

vi.mock('../adminClient', () => {
  return {
    getAdminClient: () => mockSupabase
  };
});

describe('orderMatching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock select implementations
    mockSelect.mockReturnValue(mockQueryResult([]));
  });

  it('triggers a LIMIT BUY order when ltp <= price', async () => {
    const orders = [
      {
        id: 'ord-1',
        user_id: 'usr-1',
        symbol: 'INFY',
        kite_instrument: 'NSE:INFY',
        segment: 'NSE',
        side: 'BUY',
        status: 'PENDING',
        qty: 10,
        price: 1500,
        trigger_price: null,
        order_type: 'LIMIT',
        stop_loss: 1450,
        target: 1600
      }
    ];

    // Mock fetching pending orders
    mockSelect.mockReturnValue(mockQueryResult(orders));

    const quotes = [{ id: 'NSE:INFY', last_price: 1495 }];
    await processPendingOrdersAndPositions(quotes);

    // Verify order was marked EXECUTED at fill_price
    expect(mockSupabase.from).toHaveBeenCalledWith('orders');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'EXECUTED',
        fill_price: 1500
      })
    );

    // Verify process_executed_position RPC was called
    expect(mockRpc).toHaveBeenCalledWith('process_executed_position', {
      p_order_id: 'ord-1'
    });
  });

  it('does NOT trigger a LIMIT BUY order when ltp > price', async () => {
    const orders = [
      {
        id: 'ord-1',
        user_id: 'usr-1',
        symbol: 'INFY',
        kite_instrument: 'NSE:INFY',
        segment: 'NSE',
        side: 'BUY',
        status: 'PENDING',
        qty: 10,
        price: 1500,
        trigger_price: null,
        order_type: 'LIMIT'
      }
    ];

    mockSelect.mockReturnValue(mockQueryResult(orders));

    const quotes = [{ id: 'NSE:INFY', last_price: 1505 }];
    await processPendingOrdersAndPositions(quotes);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('triggers a LIMIT SELL order when ltp >= price', async () => {
    const orders = [
      {
        id: 'ord-2',
        user_id: 'usr-1',
        symbol: 'TCS',
        kite_instrument: 'NSE:TCS',
        segment: 'NSE',
        side: 'SELL',
        status: 'PENDING',
        qty: 5,
        price: 3400,
        trigger_price: null,
        order_type: 'LIMIT'
      }
    ];

    mockSelect
      .mockReturnValueOnce(mockQueryResult(orders))
      .mockReturnValueOnce(mockQueryResult([{ id: 'pos-abc', side: 'BUY', status: 'open' }]));

    const quotes = [{ id: 'NSE:TCS', last_price: 3405 }];
    await processPendingOrdersAndPositions(quotes);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'EXECUTED',
        fill_price: 3400
      })
    );
  });

  it('triggers a SLM BUY order when ltp >= trigger_price', async () => {
    const orders = [
      {
        id: 'ord-3',
        user_id: 'usr-1',
        symbol: 'RELIANCE',
        kite_instrument: 'NSE:RELIANCE',
        segment: 'NSE',
        side: 'BUY',
        status: 'PENDING',
        qty: 2,
        price: null,
        trigger_price: 2500,
        order_type: 'SLM'
      }
    ];

    mockSelect.mockReturnValue(mockQueryResult(orders));

    const quotes = [{ id: 'NSE:RELIANCE', last_price: 2502 }];
    await processPendingOrdersAndPositions(quotes);

    // SLM executes at market price (LTP)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'EXECUTED',
        fill_price: 2502
      })
    );
  });

  it('closes a BUY position if stop loss is hit', async () => {
    // Mock open positions select call
    const positions = [
      {
        id: 'pos-1',
        user_id: 'usr-1',
        symbol: 'INFY',
        side: 'BUY',
        status: 'open',
        qty_open: 10,
        entry_price: 1500,
        stop_loss: 1480,
        target: 1600,
        settlement: 'NSE'
      }
    ];

    // Select chain mocking
    mockSelect
      .mockReturnValueOnce(mockQueryResult([])) // pending orders
      .mockReturnValueOnce(mockQueryResult(positions)) // open positions
      .mockReturnValueOnce(mockQueryResult({ balance: 10000, auto_sqoff: 90 })) // profile
      .mockReturnValueOnce(mockQueryResult([])); // segment settings

    const quotes = [{ id: 'NSE:INFY', last_price: 1475 }];
    await processPendingOrdersAndPositions(quotes);

    // Should call close_position RPC
    expect(mockRpc).toHaveBeenCalledWith('close_position', {
      p_position_id: 'pos-1',
      p_user_id: 'usr-1',
      p_ltp: 1475,
      p_exit_price: 1473.525,
      p_closed_by: 'AUTO_SL'
    });
  });

  it('closes a BUY position if target is hit', async () => {
    const positions = [
      {
        id: 'pos-2',
        user_id: 'usr-1',
        symbol: 'INFY',
        side: 'BUY',
        status: 'open',
        qty_open: 10,
        entry_price: 1500,
        stop_loss: 1480,
        target: 1600,
        settlement: 'NSE'
      }
    ];

    mockSelect
      .mockReturnValueOnce(mockQueryResult([]))
      .mockReturnValueOnce(mockQueryResult(positions))
      .mockReturnValueOnce(mockQueryResult({ balance: 10000, auto_sqoff: 90 }))
      .mockReturnValueOnce(mockQueryResult([]));

    const quotes = [{ id: 'NSE:INFY', last_price: 1605 }];
    await processPendingOrdersAndPositions(quotes);

    // Should call close_position RPC
    expect(mockRpc).toHaveBeenCalledWith('close_position', {
      p_position_id: 'pos-2',
      p_user_id: 'usr-1',
      p_ltp: 1605,
      p_exit_price: 1603.395,
      p_closed_by: 'AUTO_TARGET'
    });
  });
});
