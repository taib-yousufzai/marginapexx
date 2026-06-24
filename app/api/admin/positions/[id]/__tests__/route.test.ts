/**
 * Regression tests: Position Lifecycle Accounting
 *
 * Covers two bugs fixed in PATCH /api/admin/positions/[id]:
 *
 * ISSUE 1 — Square Off vs Delete: losses were getting reset after square-off
 *   Root cause: the PATCH else-branch unconditionally deleted the PNL_CREDIT/DEBIT
 *   transaction (ref_id = position_id) whenever the position was not in 'closed'
 *   status.  Because close_position() stores the settled PnL transaction with the
 *   same ref_id, any subsequent admin PATCH to the now-closed position (e.g. editing
 *   brokerage, sl, tp) that still had status !== 'closed' in the payload would wipe
 *   the realized loss — reversing the wallet debit.
 *
 *   Fix: only delete the PnL transaction when the admin explicitly changes status
 *   FROM 'closed' back to 'open'.  For any other edit on an open position, leave
 *   the existing PNL transaction untouched.
 *
 * ISSUE 2 — Admin edits bypass risk engine:
 *   Root cause: the liquidation check trigger condition only tested for avg_price /
 *   qty_open / qty_total in the update payload — it did not include ltp.  When an
 *   admin changes the current mark price (ltp), the floating PnL of every BUY/SELL
 *   position changes, but no liquidation check was run.
 *
 *   Fix: add 'ltp' to the set of PnL-affecting fields that trigger the risk check.
 *
 * All tests use pure exported functions, no mocks or HTTP needed.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  calculateClosedPnl,
  pnlAffectingFieldsChanged,
  isStatusExplicitlyReopened,
} from '../../../../../../lib/positionAccountingHelpers';
import {
  computeLiquidationThreshold,
  computeFreeMargin,
} from '../../../../../../lib/liquidationEngine';

// ─────────────────────────────────────────────────────────────────────────────
// 1. calculateClosedPnl
// ─────────────────────────────────────────────────────────────────────────────

describe('calculateClosedPnl', () => {
  describe('BUY positions', () => {
    it('returns positive PnL when exit > entry (profit)', () => {
      // BUY at 100, exit at 120, qty 10 → profit ₹200
      expect(calculateClosedPnl('BUY', 100, 120, 10)).toBe(200);
    });

    it('returns negative PnL when exit < entry (loss)', () => {
      // BUY at 100, exit at 80, qty 10 → loss -₹200
      expect(calculateClosedPnl('BUY', 100, 80, 10)).toBe(-200);
    });

    it('returns zero PnL when exit equals entry (breakeven)', () => {
      expect(calculateClosedPnl('BUY', 100, 100, 10)).toBe(0);
    });
  });

  describe('SELL positions', () => {
    it('returns positive PnL when entry > exit (profit on short)', () => {
      // SELL at 100, exit at 80, qty 10 → profit ₹200
      expect(calculateClosedPnl('SELL', 100, 80, 10)).toBe(200);
    });

    it('returns negative PnL when entry < exit (loss on short)', () => {
      // SELL at 100, exit at 120, qty 10 → loss -₹200
      expect(calculateClosedPnl('SELL', 100, 120, 10)).toBe(-200);
    });

    it('returns zero when entry equals exit', () => {
      expect(calculateClosedPnl('SELL', 100, 100, 10)).toBe(0);
    });
  });

  it('scales linearly with qty', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
        (entry, exit, qty) => {
          const singleUnit = calculateClosedPnl('BUY', entry, exit, 1);
          const scaled = calculateClosedPnl('BUY', entry, exit, qty);
          return Math.abs(scaled - singleUnit * qty) < 0.0001;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('BUY and SELL PnL are exact opposites for the same price movement', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: 1, max: 10000, noNaN: true, noDefaultInfinity: true }),
        fc.integer({ min: 1, max: 10000 }),
        (entry, exit, qty) => {
          const buyPnl = calculateClosedPnl('BUY', entry, exit, qty);
          const sellPnl = calculateClosedPnl('SELL', entry, exit, qty);
          return Math.abs(buyPnl + sellPnl) < 0.0001;
        },
      ),
      { numRuns: 200 },
    );
  });

  // REGRESSION: Square-off example from the bug report
  // Wallet = ₹1000, running loss = ₹200, brokerage = ₹20
  // After square-off the wallet should be ₹780, NOT ₹1000.
  // This test verifies the PnL calculation for a losing BUY position is correct
  // and negative (a loss that reduces the wallet when settled via PNL_DEBIT).
  it('REGRESSION: losing BUY produces negative PnL (wallet reduction, not reset)', () => {
    // Entry ₹1000, exit ₹800, qty 1 → PnL = -₹200 → wallet debited ₹200
    const pnl = calculateClosedPnl('BUY', 1000, 800, 1);
    expect(pnl).toBe(-200);
    expect(pnl).toBeLessThan(0); // confirms it is a debit, not a credit
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. pnlAffectingFieldsChanged
// ─────────────────────────────────────────────────────────────────────────────

describe('pnlAffectingFieldsChanged', () => {
  it('returns true when avg_price is in the update payload', () => {
    expect(pnlAffectingFieldsChanged({ avg_price: 150 })).toBe(true);
  });

  it('returns true when qty_open is in the update payload', () => {
    expect(pnlAffectingFieldsChanged({ qty_open: 5 })).toBe(true);
  });

  it('returns true when qty_total is in the update payload', () => {
    expect(pnlAffectingFieldsChanged({ qty_total: 10 })).toBe(true);
  });

  // REGRESSION: ltp was previously NOT in the trigger condition — this was the
  // root cause of Issue 2.  Admin changing the mark price must trigger the risk check.
  it('REGRESSION: returns true when ltp is in the update payload (was previously missing)', () => {
    expect(pnlAffectingFieldsChanged({ ltp: 200 })).toBe(true);
  });

  it('returns false for fields that do not affect floating PnL', () => {
    expect(pnlAffectingFieldsChanged({ sl: 90 })).toBe(false);
    expect(pnlAffectingFieldsChanged({ tp: 150 })).toBe(false);
    expect(pnlAffectingFieldsChanged({ brokerage: 50 })).toBe(false);
    expect(pnlAffectingFieldsChanged({ duration_seconds: 3600 })).toBe(false);
    expect(pnlAffectingFieldsChanged({ settlement: 'NFO' })).toBe(false);
    expect(pnlAffectingFieldsChanged({ exit_price: 120 })).toBe(false);
  });

  it('returns false for an empty update payload', () => {
    expect(pnlAffectingFieldsChanged({})).toBe(false);
  });

  it('returns true when any PnL-affecting field is present alongside non-affecting fields', () => {
    expect(pnlAffectingFieldsChanged({ sl: 90, ltp: 200, brokerage: 20 })).toBe(true);
    expect(pnlAffectingFieldsChanged({ sl: 90, avg_price: 100 })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. isStatusExplicitlyReopened
// ─────────────────────────────────────────────────────────────────────────────

describe('isStatusExplicitlyReopened', () => {
  // REGRESSION: The original code deleted the PnL transaction for ANY open-position
  // edit. The fix restricts deletion to only when status explicitly changes from
  // 'closed' → something else.

  it('returns true when status changes from closed to open (explicit reopen)', () => {
    expect(
      isStatusExplicitlyReopened({ status: 'open' }, 'closed', 'open'),
    ).toBe(true);
  });

  it('REGRESSION: returns false when editing an open position that stays open (must NOT delete PnL tx)', () => {
    // Admin edits ltp on an open position — status stays 'open' → no PnL tx deletion
    expect(
      isStatusExplicitlyReopened({ ltp: 200 }, 'open', 'open'),
    ).toBe(false);
  });

  it('REGRESSION: returns false when editing a closed position without changing status', () => {
    // Admin edits brokerage on a closed position — PnL tx must be preserved
    expect(
      isStatusExplicitlyReopened({ brokerage: 50 }, 'closed', 'closed'),
    ).toBe(false);
  });

  it('returns false when status is in payload but position was already open', () => {
    expect(
      isStatusExplicitlyReopened({ status: 'open' }, 'open', 'open'),
    ).toBe(false);
  });

  it('returns false when status changes from open to closed (normal square-off path)', () => {
    expect(
      isStatusExplicitlyReopened({ status: 'closed' }, 'open', 'closed'),
    ).toBe(false);
  });

  it('returns false when status not in update payload', () => {
    expect(
      isStatusExplicitlyReopened({ avg_price: 100 }, 'closed', 'open'),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Liquidation threshold (pure function from liquidationEngine)
// ─────────────────────────────────────────────────────────────────────────────

describe('computeLiquidationThreshold', () => {
  it('computes correct threshold for standard inputs', () => {
    // balance ₹1000, 90% → threshold = -₹900
    expect(computeLiquidationThreshold(1000, 90)).toBe(-900);
  });

  it('REGRESSION: threshold at ₹1000 balance, 90% should be -₹900 (from bug report)', () => {
    const threshold = computeLiquidationThreshold(1000, 90);
    expect(threshold).toBe(-900);

    // A floating PnL of -₹200 does NOT breach this threshold (should NOT liquidate)
    expect(-200).toBeGreaterThan(threshold);

    // A floating PnL of -₹1100 DOES breach this threshold (should liquidate)
    expect(-1100).toBeLessThanOrEqual(threshold);
  });

  it('returns 0 when balance is 0', () => {
    expect(computeLiquidationThreshold(0, 90)).toBe(0);
  });

  it('returns 0 when percentage is 0', () => {
    expect(computeLiquidationThreshold(1000, 0)).toBe(0);
  });

  it('returns 0 when balance is negative', () => {
    expect(computeLiquidationThreshold(-500, 90)).toBe(0);
  });

  it('threshold is always negative for valid inputs', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1_000_000), noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true, noDefaultInfinity: true }),
        (balance, pct) => {
          const threshold = computeLiquidationThreshold(balance, pct);
          return threshold < 0;
        },
      ),
      { numRuns: 200 },
    );
  });

  it('threshold scales proportionally with balance', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.01), max: Math.fround(1_000_000), noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(100), noNaN: true, noDefaultInfinity: true }),
        (balance, pct) => {
          const t1 = computeLiquidationThreshold(balance, pct);
          const t2 = computeLiquidationThreshold(balance * 2, pct);
          return Math.abs(t2 - t1 * 2) < 0.0001;
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. computeFreeMargin (pure function from liquidationEngine)
// ─────────────────────────────────────────────────────────────────────────────

describe('computeFreeMargin', () => {
  it('free margin = balance - locked margin', () => {
    expect(computeFreeMargin(1000, 400)).toBe(600);
  });

  it('returns negative free margin when locked margin exceeds balance', () => {
    expect(computeFreeMargin(500, 800)).toBe(-300);
  });

  it('returns full balance when no margin is locked', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        (balance) => computeFreeMargin(balance, 0) === balance,
      ),
      { numRuns: 100 },
    );
  });

  it('free margin is balance - locked (property)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        fc.float({ min: 0, max: 1_000_000, noNaN: true, noDefaultInfinity: true }),
        (balance, locked) => {
          const result = computeFreeMargin(balance, locked);
          return Math.abs(result - (balance - locked)) < 0.0001;
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. End-to-end scenario: liquidation check after admin ltp edit
// ─────────────────────────────────────────────────────────────────────────────

describe('liquidation trigger after admin ltp edit — end-to-end scenario', () => {
  /**
   * Scenario from the bug report:
   *   Wallet = ₹1000, auto_sqoff = 90% → threshold = -₹900
   *   Admin changes entry_price so that floating PnL becomes -₹1100
   *   Expected: liquidation check detects breach → auto-square-off
   *
   * This test verifies that:
   *   1. pnlAffectingFieldsChanged detects the ltp change
   *   2. computeLiquidationThreshold produces the correct threshold
   *   3. The floating PnL of -₹1100 correctly breaches the -₹900 threshold
   */
  it('correctly identifies liquidation should trigger when PnL breaches threshold after admin edit', () => {
    const balance = 1000;
    const autoSqoffPercent = 90;
    const updatePayload = { ltp: 200 }; // admin changed mark price

    // Step 1: pnlAffectingFieldsChanged must return true for ltp
    expect(pnlAffectingFieldsChanged(updatePayload)).toBe(true);

    // Step 2: threshold is -₹900
    const threshold = computeLiquidationThreshold(balance, autoSqoffPercent);
    expect(threshold).toBe(-900);

    // Step 3: floating PnL -₹1100 breaches the threshold → liquidate
    const floatingPnl = -1100;
    expect(floatingPnl <= threshold).toBe(true);
  });

  it('correctly identifies liquidation should NOT trigger when PnL is within threshold', () => {
    const balance = 1000;
    const autoSqoffPercent = 90;
    const updatePayload = { ltp: 200 };

    expect(pnlAffectingFieldsChanged(updatePayload)).toBe(true);

    const threshold = computeLiquidationThreshold(balance, autoSqoffPercent);

    // Floating PnL -₹200 does not breach -₹900
    const floatingPnl = -200;
    expect(floatingPnl > threshold).toBe(true);
  });
});
