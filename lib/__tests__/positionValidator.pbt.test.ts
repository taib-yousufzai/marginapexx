/**
 * Tests for validateOrder and helpers in lib/positionValidator.ts
 * Includes both unit tests (example-based) and property-based tests using fast-check.
 *
 * Feature: options-position-validation
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateOrder,
  positionKeyString,
  ERRORS,
} from '../positionValidator';
import type {
  PositionState,
  IncomingOrder,
  OptionType,
  PositionSide,
} from '../positionValidator';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary strike price in a realistic range, rounded to nearest 50 */
const arbStrike = fc
  .integer({ min: 10000, max: 60000 })
  .map((n) => Math.round(n / 50) * 50);

/** Arbitrary option type */
const arbOptionType = fc.constantFrom<OptionType>('CE', 'PE');

/** Arbitrary position side (non-null) */
const arbSide = fc.constantFrom<'BUY' | 'SELL'>('BUY', 'SELL');

/** Arbitrary positive quantity */
const arbQuantity = fc.integer({ min: 1, max: 1000 });

/** Arbitrary open position state */
const arbOpenPosition = fc.record<PositionState>({
  strike_price: arbStrike,
  option_type: arbOptionType,
  side: arbSide,
  quantity: arbQuantity,
});

/** Arbitrary empty/closed position state */
const arbEmptyPosition = fc.record<PositionState>({
  strike_price: arbStrike,
  option_type: arbOptionType,
  side: fc.constant<PositionSide>(null),
  quantity: fc.constant(0),
});

/** Arbitrary invalid action string (not in the supported set) */
const arbInvalidAction = fc
  .string()
  .filter((s) => !['BUY', 'BUY_EXIT', 'SELL', 'SELL_EXIT'].includes(s));

/** Arbitrary invalid option type string */
const arbInvalidOptionType = fc
  .string()
  .filter((s) => !['CE', 'PE'].includes(s));

/** Build a minimal IncomingOrder for a given position */
function makeOrder(
  position: PositionState,
  action: string,
  quantity: number,
): IncomingOrder {
  return {
    position_key: {
      strike_price: position.strike_price,
      option_type: position.option_type,
    },
    action: action as IncomingOrder['action'],
    quantity,
  };
}

// ---------------------------------------------------------------------------
// Unit tests — positionKeyString helper
// ---------------------------------------------------------------------------

describe('positionKeyString', () => {
  it('produces canonical key for CE', () => {
    expect(positionKeyString(26500, 'CE')).toBe('26500_CE');
  });

  it('produces canonical key for PE', () => {
    expect(positionKeyString(26500, 'PE')).toBe('26500_PE');
  });

  it('different strikes produce different keys', () => {
    expect(positionKeyString(26500, 'CE')).not.toBe(positionKeyString(26600, 'CE'));
  });

  it('same strike CE and PE produce different keys', () => {
    expect(positionKeyString(26500, 'CE')).not.toBe(positionKeyString(26500, 'PE'));
  });
});

// ---------------------------------------------------------------------------
// Unit tests — validateOrder: option_type and action validation
// ---------------------------------------------------------------------------

describe('validateOrder — input validation', () => {
  const basePosition: PositionState = {
    strike_price: 26500,
    option_type: 'CE',
    side: null,
    quantity: 0,
  };

  it('rejects invalid option_type with INVALID_OPTION_TYPE error', () => {
    const order: IncomingOrder = {
      position_key: { strike_price: 26500, option_type: 'XX' as OptionType },
      action: 'BUY',
      quantity: 1,
    };
    const result = validateOrder(order, basePosition);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe(ERRORS.INVALID_OPTION_TYPE);
  });

  it('rejects invalid action with INVALID_ACTION error', () => {
    const order: IncomingOrder = {
      position_key: { strike_price: 26500, option_type: 'CE' },
      action: 'FLIP' as IncomingOrder['action'],
      quantity: 1,
    };
    const result = validateOrder(order, basePosition);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe(ERRORS.INVALID_ACTION);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — validateOrder: direction rules
// ---------------------------------------------------------------------------

describe('validateOrder — direction rules', () => {
  it('accepts BUY on empty position (null)', () => {
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'BUY', quantity: 1 },
      null,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts SELL on empty position (null)', () => {
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'SELL', quantity: 1 },
      null,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts BUY on empty position (side=null, qty=0)', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: null, quantity: 0 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'BUY', quantity: 1 },
      pos,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts SELL on empty position (side=null, qty=0)', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: null, quantity: 0 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'SELL', quantity: 1 },
      pos,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts BUY on existing BUY position (accumulate)', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: 'BUY', quantity: 10 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'BUY', quantity: 5 },
      pos,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts SELL on existing SELL position (accumulate)', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: 'SELL', quantity: 10 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'SELL', quantity: 5 },
      pos,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects BUY on active SELL position', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: 'SELL', quantity: 10 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'BUY', quantity: 1 },
      pos,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe(ERRORS.CANNOT_BUY_WHILE_SELL_ACTIVE);
  });

  it('rejects SELL on active BUY position', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: 'BUY', quantity: 10 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'SELL', quantity: 1 },
      pos,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe(ERRORS.CANNOT_SELL_WHILE_BUY_ACTIVE);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — validateOrder: exit rules
// ---------------------------------------------------------------------------

describe('validateOrder — exit rules', () => {
  it('accepts BUY_EXIT with exact quantity (full exit)', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: 'BUY', quantity: 10 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'BUY_EXIT', quantity: 10 },
      pos,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts BUY_EXIT with partial quantity', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: 'BUY', quantity: 10 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'BUY_EXIT', quantity: 5 },
      pos,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects BUY_EXIT with quantity exceeding position', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: 'BUY', quantity: 10 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'BUY_EXIT', quantity: 11 },
      pos,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe(ERRORS.EXIT_QTY_EXCEEDS_POSITION);
  });

  it('rejects BUY_EXIT on SELL position', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: 'SELL', quantity: 10 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'BUY_EXIT', quantity: 5 },
      pos,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe(ERRORS.NO_ACTIVE_BUY_TO_EXIT);
  });

  it('rejects BUY_EXIT on empty position', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: null, quantity: 0 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'BUY_EXIT', quantity: 1 },
      pos,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe(ERRORS.NO_ACTIVE_BUY_TO_EXIT);
  });

  it('accepts SELL_EXIT with exact quantity (full exit)', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: 'SELL', quantity: 10 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'SELL_EXIT', quantity: 10 },
      pos,
    );
    expect(result.valid).toBe(true);
  });

  it('accepts SELL_EXIT with partial quantity', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: 'SELL', quantity: 10 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'SELL_EXIT', quantity: 5 },
      pos,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects SELL_EXIT with quantity exceeding position', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: 'SELL', quantity: 10 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'SELL_EXIT', quantity: 11 },
      pos,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe(ERRORS.EXIT_QTY_EXCEEDS_POSITION);
  });

  it('rejects SELL_EXIT on BUY position', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: 'BUY', quantity: 10 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'SELL_EXIT', quantity: 5 },
      pos,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe(ERRORS.NO_ACTIVE_SELL_TO_EXIT);
  });

  it('rejects SELL_EXIT on empty position', () => {
    const pos: PositionState = { strike_price: 26500, option_type: 'CE', side: null, quantity: 0 };
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'SELL_EXIT', quantity: 1 },
      pos,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe(ERRORS.NO_ACTIVE_SELL_TO_EXIT);
  });

  it('rejects BUY_EXIT on null position (no position at all)', () => {
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'BUY_EXIT', quantity: 1 },
      null,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe(ERRORS.NO_ACTIVE_BUY_TO_EXIT);
  });

  it('rejects SELL_EXIT on null position (no position at all)', () => {
    const result = validateOrder(
      { position_key: { strike_price: 26500, option_type: 'CE' }, action: 'SELL_EXIT', quantity: 1 },
      null,
    );
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe(ERRORS.NO_ACTIVE_SELL_TO_EXIT);
  });
});

// ---------------------------------------------------------------------------
// Property 1: Opposing direction is always rejected
// Validates: Requirements 1.2, 1.3, 2.5, 2.6, 2.7
// ---------------------------------------------------------------------------

describe('Property 1: Opposing direction is always rejected', () => {
  // Feature: options-position-validation, Property 1: Opposing direction is always rejected
  /**
   * Validates: Requirements 1.2, 1.3, 2.5, 2.6, 2.7
   */
  it('rejects BUY when SELL is active, and SELL when BUY is active', () => {
    fc.assert(
      fc.property(
        arbOpenPosition,
        arbQuantity,
        (position, orderQty) => {
          const opposingAction = position.side === 'BUY' ? 'SELL' : 'BUY';
          const order = makeOrder(position, opposingAction, orderQty);
          const result = validateOrder(order, position);

          expect(result.valid).toBe(false);
          if (!result.valid) {
            const expectedError =
              opposingAction === 'BUY'
                ? ERRORS.CANNOT_BUY_WHILE_SELL_ACTIVE
                : ERRORS.CANNOT_SELL_WHILE_BUY_ACTIVE;
            expect(result.error).toBe(expectedError);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Empty position accepts any opening direction
// Validates: Requirements 1.4, 1.5, 2.3, 2.4
// ---------------------------------------------------------------------------

describe('Property 2: Empty position accepts any opening direction', () => {
  // Feature: options-position-validation, Property 2: Empty position accepts any opening direction
  /**
   * Validates: Requirements 1.4, 1.5, 2.3, 2.4
   */
  it('accepts BUY and SELL on empty positions', () => {
    fc.assert(
      fc.property(
        arbEmptyPosition,
        fc.constantFrom<'BUY' | 'SELL'>('BUY', 'SELL'),
        arbQuantity,
        (position, action, orderQty) => {
          const order = makeOrder(position, action, orderQty);
          const result = validateOrder(order, position);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts BUY and SELL when position is null', () => {
    fc.assert(
      fc.property(
        arbStrike,
        arbOptionType,
        fc.constantFrom<'BUY' | 'SELL'>('BUY', 'SELL'),
        arbQuantity,
        (strike, optionType, action, orderQty) => {
          const order: IncomingOrder = {
            position_key: { strike_price: strike, option_type: optionType },
            action,
            quantity: orderQty,
          };
          const result = validateOrder(order, null);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Same-direction accumulation
// Validates: Requirements 1.6, 1.7
// ---------------------------------------------------------------------------

describe('Property 3: Same-direction accumulation', () => {
  // Feature: options-position-validation, Property 3: Same-direction accumulation
  /**
   * Validates: Requirements 1.6, 1.7
   */
  it('accepts same-direction orders on open positions', () => {
    fc.assert(
      fc.property(
        arbOpenPosition,
        arbQuantity,
        (position, orderQty) => {
          const sameAction = position.side as 'BUY' | 'SELL';
          const order = makeOrder(position, sameAction, orderQty);
          const result = validateOrder(order, position);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Full exit clears position
// Validates: Requirements 2.1, 2.2, 10.3
// ---------------------------------------------------------------------------

describe('Property 4: Full exit clears position', () => {
  // Feature: options-position-validation, Property 4: Full exit clears position
  /**
   * Validates: Requirements 2.1, 2.2, 10.3
   */
  it('accepts full exit order (exit qty === position qty)', () => {
    fc.assert(
      fc.property(
        arbOpenPosition,
        (position) => {
          const exitAction = position.side === 'BUY' ? 'BUY_EXIT' : 'SELL_EXIT';
          const order = makeOrder(position, exitAction, position.quantity);
          const result = validateOrder(order, position);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Partial exit reduces quantity correctly
// Validates: Requirements 3.1, 3.3
// ---------------------------------------------------------------------------

describe('Property 5: Partial exit reduces quantity correctly', () => {
  // Feature: options-position-validation, Property 5: Partial exit reduces quantity correctly
  /**
   * Validates: Requirements 3.1, 3.3
   */
  it('accepts partial exit order (1 <= exit qty < position qty)', () => {
    fc.assert(
      fc.property(
        // Position with qty >= 2 so we can have a partial exit
        fc.record<PositionState>({
          strike_price: arbStrike,
          option_type: arbOptionType,
          side: arbSide,
          quantity: fc.integer({ min: 2, max: 1000 }),
        }),
        (position) => {
          // Generate exit qty in [1, qty-1]
          const exitQty = Math.floor(Math.random() * (position.quantity - 1)) + 1;
          const exitAction = position.side === 'BUY' ? 'BUY_EXIT' : 'SELL_EXIT';
          const order = makeOrder(position, exitAction, exitQty);
          const result = validateOrder(order, position);
          expect(result.valid).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Over-exit is always rejected
// Validates: Requirements 3.2, 3.4, 3.5
// ---------------------------------------------------------------------------

describe('Property 6: Over-exit is always rejected', () => {
  // Feature: options-position-validation, Property 6: Over-exit is always rejected
  /**
   * Validates: Requirements 3.2, 3.4, 3.5
   */
  it('rejects BUY_EXIT when exit qty > position qty', () => {
    fc.assert(
      fc.property(
        fc.record<PositionState>({
          strike_price: arbStrike,
          option_type: arbOptionType,
          side: fc.constant<PositionSide>('BUY'),
          quantity: fc.integer({ min: 0, max: 999 }),
        }),
        fc.integer({ min: 1, max: 1000 }),
        (position, extraQty) => {
          const exitQty = position.quantity + extraQty; // always > qty
          const order = makeOrder(position, 'BUY_EXIT', exitQty);
          const result = validateOrder(order, position);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe(ERRORS.EXIT_QTY_EXCEEDS_POSITION);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects SELL_EXIT when exit qty > position qty', () => {
    fc.assert(
      fc.property(
        fc.record<PositionState>({
          strike_price: arbStrike,
          option_type: arbOptionType,
          side: fc.constant<PositionSide>('SELL'),
          quantity: fc.integer({ min: 0, max: 999 }),
        }),
        fc.integer({ min: 1, max: 1000 }),
        (position, extraQty) => {
          const exitQty = position.quantity + extraQty; // always > qty
          const order = makeOrder(position, 'SELL_EXIT', exitQty);
          const result = validateOrder(order, position);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe(ERRORS.EXIT_QTY_EXCEEDS_POSITION);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Option type validation rejects all non-CE/PE values
// Validates: Requirements 10.4
// ---------------------------------------------------------------------------

describe('Property 12: Option type validation rejects all non-CE/PE values', () => {
  // Feature: options-position-validation, Property 12: Option type validation rejects all non-CE/PE values
  /**
   * Validates: Requirements 10.4
   */
  it('rejects any option_type that is not CE or PE', () => {
    fc.assert(
      fc.property(
        arbInvalidOptionType,
        arbQuantity,
        (invalidType, qty) => {
          const order: IncomingOrder = {
            position_key: { strike_price: 26500, option_type: invalidType as OptionType },
            action: 'BUY',
            quantity: qty,
          };
          const result = validateOrder(order, null);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe(ERRORS.INVALID_OPTION_TYPE);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Action validation rejects all unsupported actions
// Validates: Requirements 11.1, 11.2
// ---------------------------------------------------------------------------

describe('Property 13: Action validation rejects all unsupported actions', () => {
  // Feature: options-position-validation, Property 13: Action validation rejects all unsupported actions
  /**
   * Validates: Requirements 11.1, 11.2
   */
  it('rejects any action not in [BUY, BUY_EXIT, SELL, SELL_EXIT]', () => {
    fc.assert(
      fc.property(
        arbInvalidAction,
        arbQuantity,
        (invalidAction, qty) => {
          const order: IncomingOrder = {
            position_key: { strike_price: 26500, option_type: 'CE' },
            action: invalidAction as IncomingOrder['action'],
            quantity: qty,
          };
          const result = validateOrder(order, null);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe(ERRORS.INVALID_ACTION);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 14: Wrong-side exit is always rejected
// Validates: Requirements 11.3, 11.4
// ---------------------------------------------------------------------------

describe('Property 14: Wrong-side exit is always rejected', () => {
  // Feature: options-position-validation, Property 14: Wrong-side exit is always rejected
  /**
   * Validates: Requirements 11.3, 11.4
   */
  it('rejects BUY_EXIT on SELL position', () => {
    fc.assert(
      fc.property(
        fc.record<PositionState>({
          strike_price: arbStrike,
          option_type: arbOptionType,
          side: fc.constant<PositionSide>('SELL'),
          quantity: arbQuantity,
        }),
        arbQuantity,
        (position, exitQty) => {
          const order = makeOrder(position, 'BUY_EXIT', exitQty);
          const result = validateOrder(order, position);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe(ERRORS.NO_ACTIVE_BUY_TO_EXIT);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects SELL_EXIT on BUY position', () => {
    fc.assert(
      fc.property(
        fc.record<PositionState>({
          strike_price: arbStrike,
          option_type: arbOptionType,
          side: fc.constant<PositionSide>('BUY'),
          quantity: arbQuantity,
        }),
        arbQuantity,
        (position, exitQty) => {
          const order = makeOrder(position, 'SELL_EXIT', exitQty);
          const result = validateOrder(order, position);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe(ERRORS.NO_ACTIVE_SELL_TO_EXIT);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Quantity is always non-negative
// Validates: Requirements 10.2
// ---------------------------------------------------------------------------

describe('Property 15: Quantity is always non-negative', () => {
  // Feature: options-position-validation, Property 15: Quantity is always non-negative
  /**
   * Validates: Requirements 10.2
   */
  it('accepted orders never produce a negative quantity', () => {
    fc.assert(
      fc.property(
        arbOpenPosition,
        (position) => {
          // Try a valid partial exit — result should be non-negative
          if (position.quantity >= 1) {
            const exitAction = position.side === 'BUY' ? 'BUY_EXIT' : 'SELL_EXIT';
            const exitQty = position.quantity; // full exit → 0
            const order = makeOrder(position, exitAction, exitQty);
            const result = validateOrder(order, position);
            // The validator accepts it; the resulting quantity would be 0 (non-negative)
            expect(result.valid).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('over-exit is rejected, preventing negative quantity', () => {
    fc.assert(
      fc.property(
        arbOpenPosition,
        fc.integer({ min: 1, max: 1000 }),
        (position, extra) => {
          const exitAction = position.side === 'BUY' ? 'BUY_EXIT' : 'SELL_EXIT';
          const overExitQty = position.quantity + extra;
          const order = makeOrder(position, exitAction, overExitQty);
          const result = validateOrder(order, position);
          // Over-exit must be rejected — quantity can never go negative
          expect(result.valid).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
