/**
 * Unit tests for lib/ledger.ts
 *
 * Feature: ledger-transaction-classification
 */

import { describe, it, expect } from 'vitest';
import { computeLedgerBalance } from '../ledger';
import type { LedgerEntry } from '../ledger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<LedgerEntry> & Pick<LedgerEntry, 'direction' | 'amount'>): LedgerEntry {
  return {
    id: 'test-id',
    user_id: 'user-1',
    entry_type: 'DEPOSIT',
    direction: overrides.direction,
    amount: overrides.amount,
    remarks: null,
    pay_request_id: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeLedgerBalance unit tests
// Requirements: 10.2
// ---------------------------------------------------------------------------

describe('computeLedgerBalance', () => {
  it('returns 0 for an empty list', () => {
    expect(computeLedgerBalance([])).toBe(0);
  });

  it('returns sum of amounts for credits-only entries', () => {
    const entries: LedgerEntry[] = [
      makeEntry({ direction: 'CREDIT', amount: 1000 }),
      makeEntry({ direction: 'CREDIT', amount: 500 }),
      makeEntry({ direction: 'CREDIT', amount: 250 }),
    ];
    expect(computeLedgerBalance(entries)).toBe(1750);
  });

  it('returns negative value for debits-only entries', () => {
    const entries: LedgerEntry[] = [
      makeEntry({ direction: 'DEBIT', amount: 300 }),
      makeEntry({ direction: 'DEBIT', amount: 200 }),
    ];
    expect(computeLedgerBalance(entries)).toBe(-500);
  });

  it('returns correct net value for mixed credits and debits', () => {
    const entries: LedgerEntry[] = [
      makeEntry({ direction: 'CREDIT', amount: 1000 }),
      makeEntry({ direction: 'DEBIT', amount: 300 }),
      makeEntry({ direction: 'CREDIT', amount: 500 }),
      makeEntry({ direction: 'DEBIT', amount: 100 }),
    ];
    // 1000 + 500 - 300 - 100 = 1100
    expect(computeLedgerBalance(entries)).toBe(1100);
  });

  it('returns 0 when total credits equal total debits', () => {
    const entries: LedgerEntry[] = [
      makeEntry({ direction: 'CREDIT', amount: 500 }),
      makeEntry({ direction: 'DEBIT', amount: 500 }),
    ];
    expect(computeLedgerBalance(entries)).toBe(0);
  });

  it('handles a single credit entry', () => {
    const entries: LedgerEntry[] = [makeEntry({ direction: 'CREDIT', amount: 100 })];
    expect(computeLedgerBalance(entries)).toBe(100);
  });

  it('handles a single debit entry', () => {
    const entries: LedgerEntry[] = [makeEntry({ direction: 'DEBIT', amount: 100 })];
    expect(computeLedgerBalance(entries)).toBe(-100);
  });
});
