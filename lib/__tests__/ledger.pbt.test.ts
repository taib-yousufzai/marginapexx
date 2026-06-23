/**
 * Property-based tests for lib/ledger.ts
 * Uses fast-check with a minimum of 100 runs per property.
 *
 * Feature: ledger-transaction-classification
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeLedgerBalance } from '../ledger';
import type { LedgerEntry, EntryType, Direction } from '../ledger';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const entryTypeArb = fc.constantFrom<EntryType>(
  'DEPOSIT',
  'WITHDRAWAL',
  'ADJUSTMENT',
  'CORRECTION',
  'REFUND',
);

const directionArb = fc.constantFrom<Direction>('CREDIT', 'DEBIT');

/** Generates a complete, valid LedgerEntry */
const ledgerEntryArb = fc.record<LedgerEntry>({
  id: fc.uuid(),
  user_id: fc.uuid(),
  entry_type: entryTypeArb,
  direction: directionArb,
  amount: fc.integer({ min: 1, max: 1_000_000 }),
  remarks: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
  pay_request_id: fc.option(fc.uuid(), { nil: null }),
  created_at: fc.date().filter((d) => !isNaN(d.getTime())).map((d) => d.toISOString()),
});

// ---------------------------------------------------------------------------
// Property 10: Balance computation invariant
// Feature: ledger-transaction-classification, Property 10: Balance computation invariant
// ---------------------------------------------------------------------------
describe('Property 10: Balance computation invariant', () => {
  /**
   * Validates: Requirements 10.2, 10.3
   */
  it('computeLedgerBalance equals sum(CREDIT amounts) − sum(DEBIT amounts) for any list of entries', () => {
    fc.assert(
      fc.property(
        fc.array(ledgerEntryArb),
        (entries) => {
          const credits = entries
            .filter((e) => e.direction === 'CREDIT')
            .reduce((s, e) => s + e.amount, 0);
          const debits = entries
            .filter((e) => e.direction === 'DEBIT')
            .reduce((s, e) => s + e.amount, 0);
          expect(computeLedgerBalance(entries)).toBe(credits - debits);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 12: Serialization round-trip
// Feature: ledger-transaction-classification, Property 12: Serialization round-trip
// ---------------------------------------------------------------------------
describe('Property 12: Serialization round-trip', () => {
  /**
   * Validates: Requirements 13.1, 13.2
   */
  it('JSON.parse(JSON.stringify(entry)) deep-equals the original LedgerEntry', () => {
    fc.assert(
      fc.property(
        ledgerEntryArb,
        (entry) => {
          const roundTripped = JSON.parse(JSON.stringify(entry)) as LedgerEntry;
          expect(roundTripped).toEqual(entry);
        },
      ),
      { numRuns: 100 },
    );
  });
});
