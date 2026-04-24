/**
 * Property-based tests for selectActiveAccount in lib/accountRotation.ts
 * Uses fast-check with a minimum of 100 runs per property.
 *
 * Feature: pay-in-out
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  selectActiveAccount,
  DAILY_COUNT_LIMIT,
  DAILY_AMOUNT_LIMIT,
} from '../accountRotation';
import type { AccountWithStats } from '../accountRotation';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Generates a valid AccountWithStats with controllable daily stats */
const accountWithStatsArbitrary = fc.record({
  id: fc.uuid(),
  account_holder: fc.string({ minLength: 1, maxLength: 50 }),
  bank_name: fc.string({ minLength: 1, maxLength: 50 }),
  account_no: fc.string({ minLength: 1, maxLength: 20 }),
  ifsc: fc.string({ minLength: 1, maxLength: 15 }),
  upi_id: fc.string({ minLength: 1, maxLength: 50 }),
  qr_image_url: fc.webUrl(),
  is_active: fc.boolean(),
  sort_order: fc.integer({ min: 0, max: 100 }),
  created_at: fc.constant(new Date().toISOString()),
  updated_at: fc.constant(new Date().toISOString()),
  daily_count: fc.integer({ min: 0, max: 200 }),
  daily_amount: fc.integer({ min: 0, max: 100_000 }),
});

/** Generates an AccountWithStats that is under both daily limits */
const underLimitAccountArbitrary = fc.record({
  id: fc.uuid(),
  account_holder: fc.string({ minLength: 1, maxLength: 50 }),
  bank_name: fc.string({ minLength: 1, maxLength: 50 }),
  account_no: fc.string({ minLength: 1, maxLength: 20 }),
  ifsc: fc.string({ minLength: 1, maxLength: 15 }),
  upi_id: fc.string({ minLength: 1, maxLength: 50 }),
  qr_image_url: fc.webUrl(),
  is_active: fc.boolean(),
  sort_order: fc.integer({ min: 0, max: 100 }),
  created_at: fc.constant(new Date().toISOString()),
  updated_at: fc.constant(new Date().toISOString()),
  daily_count: fc.integer({ min: 0, max: DAILY_COUNT_LIMIT - 1 }),
  daily_amount: fc.integer({ min: 0, max: DAILY_AMOUNT_LIMIT - 1 }),
});

/** Generates an AccountWithStats that is over at least one daily limit */
const overLimitAccountArbitrary = fc.oneof(
  // Over count limit
  fc.record({
    id: fc.uuid(),
    account_holder: fc.string({ minLength: 1, maxLength: 50 }),
    bank_name: fc.string({ minLength: 1, maxLength: 50 }),
    account_no: fc.string({ minLength: 1, maxLength: 20 }),
    ifsc: fc.string({ minLength: 1, maxLength: 15 }),
    upi_id: fc.string({ minLength: 1, maxLength: 50 }),
    qr_image_url: fc.webUrl(),
    is_active: fc.boolean(),
    sort_order: fc.integer({ min: 0, max: 100 }),
    created_at: fc.constant(new Date().toISOString()),
    updated_at: fc.constant(new Date().toISOString()),
    daily_count: fc.integer({ min: DAILY_COUNT_LIMIT, max: 200 }),
    daily_amount: fc.integer({ min: 0, max: DAILY_AMOUNT_LIMIT - 1 }),
  }),
  // Over amount limit
  fc.record({
    id: fc.uuid(),
    account_holder: fc.string({ minLength: 1, maxLength: 50 }),
    bank_name: fc.string({ minLength: 1, maxLength: 50 }),
    account_no: fc.string({ minLength: 1, maxLength: 20 }),
    ifsc: fc.string({ minLength: 1, maxLength: 15 }),
    upi_id: fc.string({ minLength: 1, maxLength: 50 }),
    qr_image_url: fc.webUrl(),
    is_active: fc.boolean(),
    sort_order: fc.integer({ min: 0, max: 100 }),
    created_at: fc.constant(new Date().toISOString()),
    updated_at: fc.constant(new Date().toISOString()),
    daily_count: fc.integer({ min: 0, max: DAILY_COUNT_LIMIT - 1 }),
    daily_amount: fc.integer({ min: DAILY_AMOUNT_LIMIT, max: 100_000 }),
  }),
);

// ---------------------------------------------------------------------------
// Property 11: Rotation never blocks
// ---------------------------------------------------------------------------
describe('Property 11: Rotation never blocks', () => {
  // Feature: pay-in-out, Property 11: Rotation never blocks
  /**
   * Validates: Requirements 27.4, 27.5
   */
  it('always returns a non-null account for any non-empty list', () => {
    fc.assert(
      fc.property(
        fc.array(accountWithStatsArbitrary, { minLength: 1 }),
        (accounts) => {
          const result = selectActiveAccount(accounts);
          expect(result).not.toBeNull();
          expect(result).not.toBeUndefined();
          // Result must be one of the input accounts
          expect(accounts).toContain(result);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('throws when given an empty array', () => {
    expect(() => selectActiveAccount([])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Property 12: Rotation respects limits
// ---------------------------------------------------------------------------
describe('Property 12: Rotation respects limits', () => {
  // Feature: pay-in-out, Property 12: Rotation respects limits
  /**
   * Validates: Requirements 27.3, 27.6
   */
  it('returns an under-limit account when at least one exists', () => {
    fc.assert(
      fc.property(
        // Generate a list with at least one under-limit account mixed with over-limit ones
        fc.array(overLimitAccountArbitrary, { minLength: 0, maxLength: 5 }).chain(
          (overLimitAccounts) =>
            underLimitAccountArbitrary.map((underLimitAccount) => ({
              // Place the under-limit account at a random position
              accounts: [...overLimitAccounts, underLimitAccount],
              underLimitAccount,
            })),
        ),
        ({ accounts, underLimitAccount }) => {
          const result = selectActiveAccount(accounts);
          // The result must be under both limits
          expect(result.daily_count).toBeLessThan(DAILY_COUNT_LIMIT);
          expect(result.daily_amount).toBeLessThan(DAILY_AMOUNT_LIMIT);
          // The result must be the first under-limit account in the list
          const firstUnderLimit = accounts.find(
            (a) =>
              a.daily_count < DAILY_COUNT_LIMIT && a.daily_amount < DAILY_AMOUNT_LIMIT,
          );
          expect(result).toBe(firstUnderLimit);
          // Suppress unused variable warning
          void underLimitAccount;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 13: Circular fallback returns first by sort_order
// ---------------------------------------------------------------------------
describe('Property 13: Circular fallback returns first by sort_order', () => {
  // Feature: pay-in-out, Property 13: Circular fallback returns first by sort_order
  /**
   * Validates: Requirements 27.4
   */
  it('returns accounts[0] when all accounts are over limit', () => {
    fc.assert(
      fc.property(
        fc.array(overLimitAccountArbitrary, { minLength: 1 }),
        (overLimitAccounts) => {
          const result = selectActiveAccount(overLimitAccounts);
          // Must return the first element (caller is responsible for sort_order pre-sorting)
          expect(result).toBe(overLimitAccounts[0]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Unit tests — specific examples
// ---------------------------------------------------------------------------
describe('selectActiveAccount — unit tests', () => {
  const makeAccount = (
    id: string,
    daily_count: number,
    daily_amount: number,
    sort_order = 0,
  ): AccountWithStats => ({
    id,
    account_holder: 'Test Holder',
    bank_name: 'Test Bank',
    account_no: '123456789',
    ifsc: 'SBIN0001234',
    upi_id: 'test@upi',
    qr_image_url: 'https://example.com/qr.png',
    is_active: true,
    sort_order,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    daily_count,
    daily_amount,
  });

  it('returns the first under-limit account', () => {
    const accounts = [
      makeAccount('a1', DAILY_COUNT_LIMIT, 0),       // over count limit
      makeAccount('a2', 0, DAILY_AMOUNT_LIMIT),       // over amount limit
      makeAccount('a3', 5, 1000),                     // under both limits
      makeAccount('a4', 0, 0),                        // also under limits
    ];
    expect(selectActiveAccount(accounts).id).toBe('a3');
  });

  it('returns accounts[0] as fallback when all are over limit', () => {
    const accounts = [
      makeAccount('a1', DAILY_COUNT_LIMIT, 0, 1),
      makeAccount('a2', 0, DAILY_AMOUNT_LIMIT, 2),
      makeAccount('a3', DAILY_COUNT_LIMIT, DAILY_AMOUNT_LIMIT, 3),
    ];
    expect(selectActiveAccount(accounts).id).toBe('a1');
  });

  it('returns the single account even if it is over limit', () => {
    const accounts = [makeAccount('a1', DAILY_COUNT_LIMIT + 1, DAILY_AMOUNT_LIMIT + 1)];
    expect(selectActiveAccount(accounts).id).toBe('a1');
  });

  it('returns the only account when it is under limit', () => {
    const accounts = [makeAccount('a1', 0, 0)];
    expect(selectActiveAccount(accounts).id).toBe('a1');
  });

  it('throws for empty array', () => {
    expect(() => selectActiveAccount([])).toThrow('No active payment accounts available');
  });

  it('treats daily_count === DAILY_COUNT_LIMIT as over limit', () => {
    const accounts = [
      makeAccount('a1', DAILY_COUNT_LIMIT, 0),  // exactly at limit — over
      makeAccount('a2', 0, 0),                   // under
    ];
    expect(selectActiveAccount(accounts).id).toBe('a2');
  });

  it('treats daily_amount === DAILY_AMOUNT_LIMIT as over limit', () => {
    const accounts = [
      makeAccount('a1', 0, DAILY_AMOUNT_LIMIT),  // exactly at limit — over
      makeAccount('a2', 0, 0),                    // under
    ];
    expect(selectActiveAccount(accounts).id).toBe('a2');
  });
});
