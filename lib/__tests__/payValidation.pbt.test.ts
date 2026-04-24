/**
 * Property-based tests for validatePayRequest and computeBalance in lib/payValidation.ts
 * Uses fast-check with a minimum of 100 runs per property.
 *
 * Feature: pay-in-out
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePayRequest, computeBalance } from '../payValidation';
import type { WalletRules } from '../payValidation';

/** Default wallet rules used as a baseline in most tests */
const defaultRules: WalletRules = {
  withdraw_enabled: true,
  allowed_days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  start_time: '00:00',
  end_time: '23:59',
  min_withdraw: 100,
  min_deposit: 1000,
};

/** A Monday at 12:00 UTC — always within the default allowed window */
const mondayNoon = new Date('2024-01-08T12:00:00Z'); // 2024-01-08 is a Monday

// ---------------------------------------------------------------------------
// Property 5: Wallet rules validation — invalid type rejected
// ---------------------------------------------------------------------------
describe('Property 5: Wallet rules validation — invalid type rejected', () => {
  // Feature: pay-in-out, Property 5: Wallet rules validation — invalid type rejected
  it('rejects any type string that is not DEPOSIT or WITHDRAWAL', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => s !== 'DEPOSIT' && s !== 'WITHDRAWAL'),
        (invalidType) => {
          const result = validatePayRequest(
            { type: invalidType, amount: 1000 },
            defaultRules,
            mondayNoon,
          );
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe('Invalid type');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.2
   */
  it('rejects null body', () => {
    const result = validatePayRequest(null, defaultRules, mondayNoon);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe('Invalid type');
  });

  it('rejects missing type field', () => {
    const result = validatePayRequest({ amount: 1000 }, defaultRules, mondayNoon);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe('Invalid type');
  });
});

// ---------------------------------------------------------------------------
// Property 6: Wallet rules validation — non-positive amount rejected
// ---------------------------------------------------------------------------
describe('Property 6: Wallet rules validation — non-positive amount rejected', () => {
  // Feature: pay-in-out, Property 6: Wallet rules validation — non-positive amount rejected
  it('rejects zero and negative amounts for DEPOSIT', () => {
    fc.assert(
      fc.property(
        // Use integer-based negatives and zero to avoid 32-bit float constraint issues
        fc.oneof(fc.constant(0), fc.integer({ min: -1_000_000, max: -1 })),
        (nonPositiveAmount) => {
          const result = validatePayRequest(
            { type: 'DEPOSIT', amount: nonPositiveAmount },
            defaultRules,
            mondayNoon,
          );
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe('Invalid amount');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Validates: Requirements 3.3
   */
  it('rejects zero and negative amounts for WITHDRAWAL', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(0), fc.integer({ min: -1_000_000, max: -1 })),
        (nonPositiveAmount) => {
          const result = validatePayRequest(
            { type: 'WITHDRAWAL', amount: nonPositiveAmount },
            defaultRules,
            mondayNoon,
          );
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe('Invalid amount');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Wallet rules validation — deposit below minimum rejected
// ---------------------------------------------------------------------------
describe('Property 7: Wallet rules validation — deposit below minimum rejected', () => {
  // Feature: pay-in-out, Property 7: Wallet rules validation — deposit below minimum rejected
  /**
   * Validates: Requirements 3.4
   */
  it('rejects DEPOSIT amounts strictly below min_deposit', () => {
    fc.assert(
      fc.property(
        // Use integers to avoid 32-bit float constraint issues with fc.float
        fc.integer({ min: 2, max: 100_000 }).chain((minDeposit) =>
          fc
            .integer({ min: 1, max: minDeposit - 1 })
            .map((amount) => ({ minDeposit, amount })),
        ),
        ({ minDeposit, amount }) => {
          const rules: WalletRules = { ...defaultRules, min_deposit: minDeposit };
          const result = validatePayRequest(
            { type: 'DEPOSIT', amount },
            rules,
            mondayNoon,
          );
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe('Amount below minimum deposit');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Wallet rules validation — withdrawal outside allowed window rejected
// ---------------------------------------------------------------------------
describe('Property 8: Wallet rules validation — withdrawal outside allowed window rejected', () => {
  const allDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // Feature: pay-in-out, Property 8: Wallet rules validation — withdrawal outside allowed window rejected
  /**
   * Validates: Requirements 3.6, 3.7
   */
  it('rejects WITHDRAWAL on a day not in allowed_days', () => {
    fc.assert(
      fc.property(
        // Pick a subset of days as allowed_days, then pick a day NOT in that subset
        fc
          .subarray(allDays, { minLength: 0, maxLength: 6 })
          .chain((allowedDays) => {
            const disallowedDays = allDays.filter((d) => !allowedDays.includes(d));
            if (disallowedDays.length === 0) {
              // All days allowed — skip by returning a dummy that won't be used
              return fc.constant(null);
            }
            return fc.constantFrom(...disallowedDays).map((day) => ({ allowedDays, day }));
          })
          .filter((v): v is { allowedDays: string[]; day: string } => v !== null),
        ({ allowedDays, day }) => {
          // Map day name to a UTC date on that day of week
          const dayIndex = allDays.indexOf(day);
          // 2024-01-07 is a Sunday (index 0), so offset by dayIndex
          const date = new Date(`2024-01-0${7 + dayIndex}T12:00:00Z`);

          const rules: WalletRules = {
            ...defaultRules,
            allowed_days: allowedDays,
            start_time: '00:00',
            end_time: '23:59',
          };
          const result = validatePayRequest(
            {
              type: 'WITHDRAWAL',
              amount: rules.min_withdraw + 1,
              account_name: 'Test User',
              account_no: '123456789',
              ifsc: 'SBIN0001234',
            },
            rules,
            date,
          );
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe('Withdrawals not allowed on this day');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('rejects WITHDRAWAL outside the time window', () => {
    // Use a fixed Monday so the day check passes
    const monday = new Date('2024-01-08T00:00:00Z'); // Monday

    fc.assert(
      fc.property(
        // Generate start/end window and a time outside it
        fc
          .tuple(
            fc.integer({ min: 1, max: 22 }), // startHour
            fc.integer({ min: 1, max: 22 }), // endHour offset
          )
          .chain(([startHour, endOffset]) => {
            const endHour = Math.min(startHour + endOffset, 23);
            const startTime = `${String(startHour).padStart(2, '0')}:00`;
            const endTime = `${String(endHour).padStart(2, '0')}:00`;
            // Pick an hour outside [startHour, endHour)
            const outsideHours = [];
            for (let h = 0; h < 24; h++) {
              if (h < startHour || h >= endHour) outsideHours.push(h);
            }
            if (outsideHours.length === 0) return fc.constant(null);
            return fc.constantFrom(...outsideHours).map((hour) => ({ startTime, endTime, hour }));
          })
          .filter((v): v is { startTime: string; endTime: string; hour: number } => v !== null),
        ({ startTime, endTime, hour }) => {
          const testDate = new Date(monday);
          testDate.setUTCHours(hour, 0, 0, 0);

          const rules: WalletRules = {
            ...defaultRules,
            allowed_days: ['Monday'],
            start_time: startTime,
            end_time: endTime,
          };
          const result = validatePayRequest(
            {
              type: 'WITHDRAWAL',
              amount: rules.min_withdraw + 1,
              account_name: 'Test User',
              account_no: '123456789',
              ifsc: 'SBIN0001234',
            },
            rules,
            testDate,
          );
          expect(result.valid).toBe(false);
          if (!result.valid) {
            // Could be day error or time error — both are 400
            expect(result.status).toBe(400);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Wallet rules validation — withdrawal below minimum rejected
// ---------------------------------------------------------------------------
describe('Property 9: Wallet rules validation — withdrawal below minimum rejected', () => {
  // Feature: pay-in-out, Property 9: Wallet rules validation — withdrawal below minimum rejected
  /**
   * Validates: Requirements 3.8
   */
  it('rejects WITHDRAWAL amounts strictly below min_withdraw', () => {
    fc.assert(
      fc.property(
        // Use integers to avoid 32-bit float constraint issues with fc.float
        fc.integer({ min: 2, max: 100_000 }).chain((minWithdraw) =>
          fc
            .integer({ min: 1, max: minWithdraw - 1 })
            .map((amount) => ({ minWithdraw, amount })),
        ),
        ({ minWithdraw, amount }) => {
          const rules: WalletRules = { ...defaultRules, min_withdraw: minWithdraw };
          const result = validatePayRequest(
            {
              type: 'WITHDRAWAL',
              amount,
              account_name: 'Test User',
              account_no: '123456789',
              ifsc: 'SBIN0001234',
            },
            rules,
            mondayNoon,
          );
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe('Amount below minimum withdrawal');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 1: Balance invariant
// ---------------------------------------------------------------------------
describe('Property 1: Balance invariant', () => {
  // Feature: pay-in-out, Property 1: Balance invariant
  /**
   * Validates: Requirements 4.2, 4.3, 4.5, 18.4
   */
  it('computeBalance equals deposits minus withdrawals for any transaction array', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            type: fc.constantFrom('DEPOSIT', 'WITHDRAWAL'),
            // Use integer amounts to avoid floating-point precision issues with fc.float constraints
            amount: fc.integer({ min: 1, max: 1_000_000 }),
          }),
        ),
        (transactions) => {
          const deposits = transactions
            .filter((t) => t.type === 'DEPOSIT')
            .reduce((s, t) => s + t.amount, 0);
          const withdrawals = transactions
            .filter((t) => t.type === 'WITHDRAWAL')
            .reduce((s, t) => s + t.amount, 0);
          expect(computeBalance(transactions)).toBeCloseTo(deposits - withdrawals, 5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('returns 0 for an empty transaction array', () => {
    expect(computeBalance([])).toBe(0);
  });
});
