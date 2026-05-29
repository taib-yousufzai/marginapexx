import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { positionStore, parseOptionSymbol } from '../positionStore';
import { ERRORS } from '../positionValidator';
import type { IncomingOrder, PositionState } from '../positionValidator';

// Mock the admin client module
const mockSelect = vi.fn();
const mockSupabase = {
  from: vi.fn().mockImplementation((table: string) => {
    return {
      select: mockSelect,
    };
  }),
  channel: vi.fn().mockReturnValue({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
  }),
};

vi.mock('../adminClient', () => {
  return {
    getAdminClient: () => mockSupabase,
  };
});

describe('parseOptionSymbol', () => {
  it('parses valid Call option symbols', () => {
    const res = parseOptionSymbol('NIFTY2652826500CE');
    expect(res).toEqual({
      underlying: 'NIFTY',
      strike: 26500,
      optionType: 'CE',
    });
  });

  it('parses valid Put option symbols', () => {
    const res = parseOptionSymbol('BANKNIFTY2652845000PE');
    expect(res).toEqual({
      underlying: 'BANKNIFTY',
      strike: 45000,
      optionType: 'PE',
    });
  });

  it('parses option symbols with exchange prefixes', () => {
    const res = parseOptionSymbol('NFO:NIFTY2652826500CE');
    expect(res).toEqual({
      underlying: 'NIFTY',
      strike: 26500,
      optionType: 'CE',
    });
  });

  it('returns null for non-option symbols', () => {
    expect(parseOptionSymbol('INFY')).toBeNull();
    expect(parseOptionSymbol('NSE:INFY')).toBeNull();
  });
});

describe('PositionStore', () => {
  const userId = 'user-123';

  beforeEach(() => {
    vi.clearAllMocks();
    positionStore.clear();
  });

  it('initialize() queries DB and populates the cache', async () => {
    const dbPositions = [
      { symbol: 'NIFTY2652826500CE', side: 'BUY', qty_open: 5 },
      { symbol: 'BANKNIFTY2652845000PE', side: 'SELL', qty_open: 10 },
    ];

    mockSelect.mockReturnValue({
      eq: vi.fn().mockImplementation((col: string, val: any) => {
        if (col === 'user_id') {
          return {
            eq: vi.fn().mockResolvedValue({ data: dbPositions, error: null }),
          };
        }
        return { eq: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }),
    });

    await positionStore.initialize(userId);

    const cePos = await positionStore.getPosition(userId, { strike_price: 26500, option_type: 'CE' });
    expect(cePos).toEqual({
      strike_price: 26500,
      option_type: 'CE',
      side: 'BUY',
      quantity: 5,
    });

    const pePos = await positionStore.getPosition(userId, { strike_price: 45000, option_type: 'PE' });
    expect(pePos).toEqual({
      strike_price: 45000,
      option_type: 'PE',
      side: 'SELL',
      quantity: 10,
    });
  });

  it('applyOrder() validates and executes dbCall, and updates cache atomically', async () => {
    // Start with empty cache
    mockSelect.mockReturnValue({
      eq: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    });

    const order: IncomingOrder = {
      position_key: { strike_price: 26500, option_type: 'CE' },
      action: 'BUY',
      quantity: 5,
    };

    const mockDbCall = vi.fn().mockResolvedValue({ orderId: 'ord-999', fillPrice: 150 });

    const res = await positionStore.applyOrder(userId, order, mockDbCall);

    expect(res).toEqual({ orderId: 'ord-999', fillPrice: 150 });
    expect(mockDbCall).toHaveBeenCalledTimes(1);

    const pos = await positionStore.getPosition(userId, { strike_price: 26500, option_type: 'CE' });
    expect(pos).toEqual({
      strike_price: 26500,
      option_type: 'CE',
      side: 'BUY',
      quantity: 5,
    });
  });

  it('applyOrder() leaves cache unchanged when order is rejected', async () => {
    // Seed with a BUY position
    const dbPositions = [
      { symbol: 'NIFTY2652826500CE', side: 'BUY', qty_open: 5 },
    ];
    mockSelect.mockReturnValue({
      eq: vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockResolvedValue({ data: dbPositions, error: null }),
      })),
    });

    // Try a SELL order (invalid since opposing direction is prohibited)
    const order: IncomingOrder = {
      position_key: { strike_price: 26500, option_type: 'CE' },
      action: 'SELL',
      quantity: 2,
    };

    const mockDbCall = vi.fn();

    await expect(positionStore.applyOrder(userId, order, mockDbCall)).rejects.toThrow(
      ERRORS.CANNOT_SELL_WHILE_BUY_ACTIVE
    );

    expect(mockDbCall).not.toHaveBeenCalled();

    // Verify cache remains unchanged
    const pos = await positionStore.getPosition(userId, { strike_price: 26500, option_type: 'CE' });
    expect(pos).toEqual({
      strike_price: 26500,
      option_type: 'CE',
      side: 'BUY',
      quantity: 5,
    });
  });

  it('reconcile() resets the initialized status and queries DB again', async () => {
    const dbPositions1 = [
      { symbol: 'NIFTY2652826500CE', side: 'BUY', qty_open: 5 },
    ];
    const dbPositions2 = [
      { symbol: 'NIFTY2652826500CE', side: 'BUY', qty_open: 10 },
    ];

    mockSelect
      .mockReturnValueOnce({
        eq: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockResolvedValue({ data: dbPositions1, error: null }),
        })),
      })
      .mockReturnValueOnce({
        eq: vi.fn().mockImplementation(() => ({
          eq: vi.fn().mockResolvedValue({ data: dbPositions2, error: null }),
        })),
      });

    // Initial load
    const pos1 = await positionStore.getPosition(userId, { strike_price: 26500, option_type: 'CE' });
    expect(pos1?.quantity).toBe(5);

    // Reconcile
    await positionStore.reconcile(userId);

    // Verify load is done again from second call
    const pos2 = await positionStore.getPosition(userId, { strike_price: 26500, option_type: 'CE' });
    expect(pos2?.quantity).toBe(10);
  });

  // Feature: options-position-validation, Property 7: CE and PE are independent
  it('Property 7: CE and PE positions on the same strike are independent', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom<'BUY' | 'SELL'>('BUY', 'SELL'),
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom<'BUY' | 'SELL'>('BUY', 'SELL'),
        fc.integer({ min: 1, max: 100 }),
        async (ceSide, ceQty, peSide, peQty) => {
          positionStore.clear();

          // Mock database return empty array
          mockSelect.mockReturnValue({
            eq: vi.fn().mockImplementation(() => ({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          });

          const ceOrder: IncomingOrder = {
            position_key: { strike_price: 26500, option_type: 'CE' },
            action: ceSide,
            quantity: ceQty,
          };

          const peOrder: IncomingOrder = {
            position_key: { strike_price: 26500, option_type: 'PE' },
            action: peSide,
            quantity: peQty,
          };

          const mockDbCall = vi.fn().mockResolvedValue({ orderId: 'id', fillPrice: 10 });

          // Apply CE order
          await positionStore.applyOrder(userId, ceOrder, mockDbCall);
          // Apply PE order
          await positionStore.applyOrder(userId, peOrder, mockDbCall);

          // Get both positions
          const cePos = await positionStore.getPosition(userId, { strike_price: 26500, option_type: 'CE' });
          const pePos = await positionStore.getPosition(userId, { strike_price: 26500, option_type: 'PE' });

          // Assert CE is unaffected by PE and vice versa
          expect(cePos).toEqual({
            strike_price: 26500,
            option_type: 'CE',
            side: ceSide,
            quantity: ceQty,
          });
          expect(pePos).toEqual({
            strike_price: 26500,
            option_type: 'PE',
            side: peSide,
            quantity: peQty,
          });
        }
      ),
      { numRuns: 100 }
    );
  });
});
