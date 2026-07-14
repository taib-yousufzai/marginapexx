/**
 * Core types, error constants, and helpers for options position validation.
 * Pure module — no side effects, no I/O.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OptionType = 'CE' | 'PE';

export type PositionSide = 'BUY' | 'SELL' | null;

export type OrderAction = 'BUY' | 'BUY_EXIT' | 'SELL' | 'SELL_EXIT';

/** Canonical string key for a position, e.g. "26500_CE" */
export type PositionKeyString = string;

export interface PositionKey {
  symbol: string;
  strike_price: number;
  option_type: OptionType;
}

export interface PositionState {
  strike_price: number;
  option_type: OptionType;
  /** Direction of the open position. `null` when no position is open. */
  side: PositionSide;
  /** Number of lots/contracts held. Always a non-negative integer. */
  quantity: number;
}

export interface IncomingOrder {
  position_key: PositionKey;
  action: OrderAction;
  /** Positive integer representing the number of lots/contracts. */
  quantity: number;
}

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string };

// ---------------------------------------------------------------------------
// Error constants
// ---------------------------------------------------------------------------

export const ERRORS = {
  CANNOT_BUY_WHILE_SELL_ACTIVE: 'Cannot open BUY position while SELL position is active',
  CANNOT_SELL_WHILE_BUY_ACTIVE: 'Cannot open SELL position while BUY position is active',
  EXIT_QTY_EXCEEDS_POSITION:    'Exit quantity cannot exceed current position quantity',
  NO_ACTIVE_BUY_TO_EXIT:        'Cannot exit BUY: no active BUY position',
  NO_ACTIVE_SELL_TO_EXIT:       'Cannot exit SELL: no active SELL position',
  INVALID_ACTION:               'Invalid action',
  INVALID_OPTION_TYPE:          'Invalid option type',
  INVALID_SIDE_VALUE:           'Invalid side value',
  POSITION_STORE_UNAVAILABLE:   'Position store unavailable, please retry',
  INVALID_STRIKE_PRICE:         'Invalid strike price',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produces the canonical position key string used as a cache/map key.
 * Example: positionKeyString({ symbol: 'NIFTY25JAN24000CE', ... }) → "NIFTY25JAN24000CE"
 */
export function positionKeyString(key: PositionKey): PositionKeyString {
  return key.symbol;
}

/**
 * Checks if the strike price is within allowed bounds.
 * Uses environment variables MIN_STRIKE_PRICE and MAX_STRIKE_PRICE with sensible defaults.
 */
export function isValidStrikePrice(strike: number, _optionType: OptionType): boolean {
  const min = process.env.MIN_STRIKE_PRICE ? Number(process.env.MIN_STRIKE_PRICE) : 0;
  const max = process.env.MAX_STRIKE_PRICE ? Number(process.env.MAX_STRIKE_PRICE) : Number.POSITIVE_INFINITY;
  return strike >= min && strike <= max;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

const VALID_OPTION_TYPES = new Set<string>(['CE', 'PE']);
const VALID_ACTIONS = new Set<string>(['BUY', 'BUY_EXIT', 'SELL', 'SELL_EXIT']);

/**
 * Validates an incoming order against the current position state.
 * Pure function — no side effects, no I/O.
 *
 * Validation is performed in this order:
 *  1. option_type must be 'CE' or 'PE'
 *  2. action must be one of the four supported values
 *  3. Direction and exit rules based on current position state
 */
export function validateOrder(
  order: IncomingOrder,
  currentPosition: PositionState | null,
): ValidationResult {
  // 1. Validate option_type
  if (!VALID_OPTION_TYPES.has(order.position_key.option_type)) {
    return { valid: false, error: ERRORS.INVALID_OPTION_TYPE };
  }
  // Validate strike price range
  if (!isValidStrikePrice(order.position_key.strike_price, order.position_key.option_type)) {
    return { valid: false, error: ERRORS.INVALID_STRIKE_PRICE };
  }

  // 2. Validate action
  if (!VALID_ACTIONS.has(order.action)) {
    return { valid: false, error: ERRORS.INVALID_ACTION };
  }

  // 3. Normalize null position to an empty position
  const position: Pick<PositionState, 'side' | 'quantity'> = currentPosition ?? {
    side: null,
    quantity: 0,
  };

  const { side, quantity } = position;

  switch (order.action) {
    case 'BUY': {
      if (side === 'SELL') {
        return { valid: false, error: ERRORS.CANNOT_BUY_WHILE_SELL_ACTIVE };
      }
      // side === null or side === 'BUY' → accept (open or accumulate)
      return { valid: true };
    }

    case 'SELL': {
      if (side === 'BUY') {
        return { valid: false, error: ERRORS.CANNOT_SELL_WHILE_BUY_ACTIVE };
      }
      // side === null or side === 'SELL' → accept (open or accumulate)
      return { valid: true };
    }

    case 'BUY_EXIT': {
      if (side !== 'BUY') {
        return { valid: false, error: ERRORS.NO_ACTIVE_BUY_TO_EXIT };
      }
      if (order.quantity > quantity) {
        return { valid: false, error: ERRORS.EXIT_QTY_EXCEEDS_POSITION };
      }
      return { valid: true };
    }

    case 'SELL_EXIT': {
      if (side !== 'SELL') {
        return { valid: false, error: ERRORS.NO_ACTIVE_SELL_TO_EXIT };
      }
      if (order.quantity > quantity) {
        return { valid: false, error: ERRORS.EXIT_QTY_EXCEEDS_POSITION };
      }
      return { valid: true };
    }
  }
}
