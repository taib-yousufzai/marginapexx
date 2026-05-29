import { describe, it, expect, beforeAll } from 'vitest';
import { validateOrder, ERRORS, isValidStrikePrice } from '../positionValidator';
import { IncomingOrder, PositionState } from '../positionValidator';

// Helper to create order
function makeOrder(strike: number, optionType: 'CE' | 'PE', action: 'BUY' | 'SELL' | 'BUY_EXIT' | 'SELL_EXIT', qty: number): IncomingOrder {
  return {
    position_key: { strike_price: strike, option_type: optionType },
    action,
    quantity: qty,
  };
}

describe('validateOrder – strike price validation', () => {
  it('passes when strike price within default bounds', () => {
    const order = makeOrder(1500, 'CE', 'BUY', 1);
    const result = validateOrder(order, null);
    expect(result.valid).toBe(true);
  });

  it('fails with INVALID_STRIKE_PRICE when strike below MIN_STRIKE_PRICE', () => {
    process.env.MIN_STRIKE_PRICE = '1000';
    const order = makeOrder(500, 'CE', 'BUY', 1);
    const result = validateOrder(order, null);
    expect(result).toEqual({ valid: false, error: ERRORS.INVALID_STRIKE_PRICE });
  });

  it('fails with INVALID_STRIKE_PRICE when strike above MAX_STRIKE_PRICE', () => {
    process.env.MAX_STRIKE_PRICE = '2000';
    const order = makeOrder(2500, 'PE', 'BUY', 1);
    const result = validateOrder(order, null);
    expect(result).toEqual({ valid: false, error: ERRORS.INVALID_STRIKE_PRICE });
  });

  it('clears env overrides after tests', () => {
    delete process.env.MIN_STRIKE_PRICE;
    delete process.env.MAX_STRIKE_PRICE;
    const order = makeOrder(3000, 'CE', 'BUY', 1);
    const result = validateOrder(order, null);
    expect(result.valid).toBe(true);
  });
});
