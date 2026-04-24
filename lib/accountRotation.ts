/**
 * Pure account rotation logic for selecting the active payment account.
 * No side effects, no DB calls — all inputs are passed explicitly.
 */

import type { PaymentAccount } from './types/paymentAccount';

export type { PaymentAccount };

/**
 * A PaymentAccount enriched with today's usage statistics.
 * daily_count: number of PENDING + APPROVED DEPOSIT requests today for this account.
 * daily_amount: sum of amounts for those requests.
 */
export type AccountWithStats = PaymentAccount & {
  daily_count: number;
  daily_amount: number;
};

/** Maximum number of deposit requests allowed per account per day. */
export const DAILY_COUNT_LIMIT = 100;

/** Maximum total deposit amount allowed per account per day (in INR). */
export const DAILY_AMOUNT_LIMIT = 50000;

/**
 * Selects the active payment account from a list of accounts with daily usage stats.
 *
 * Selection algorithm:
 *  1. Throw if the list is empty — caller must ensure at least one account exists.
 *  2. Return the first account where both daily_count < DAILY_COUNT_LIMIT
 *     AND daily_amount < DAILY_AMOUNT_LIMIT (under-limit account).
 *  3. If all accounts are over limit, return accounts[0] as a circular fallback
 *     so deposits are never blocked.
 *
 * The caller is responsible for passing accounts pre-sorted by sort_order ASC.
 *
 * @param accounts - Non-empty array of active accounts with daily stats.
 * @returns The selected AccountWithStats.
 * @throws Error if accounts array is empty.
 */
export function selectActiveAccount(accounts: AccountWithStats[]): AccountWithStats {
  if (accounts.length === 0) {
    throw new Error('No active payment accounts available');
  }

  // Return the first account that is under both daily limits
  const underLimit = accounts.find(
    (account) =>
      account.daily_count < DAILY_COUNT_LIMIT && account.daily_amount < DAILY_AMOUNT_LIMIT,
  );

  if (underLimit !== undefined) {
    return underLimit;
  }

  // Circular fallback: all accounts are over limit — return the first one
  return accounts[0];
}
