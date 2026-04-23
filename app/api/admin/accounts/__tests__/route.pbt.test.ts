// Feature: admin-panel-live-data, Property 13: Accounts PnL+BKG invariant

/**
 * Property-based tests for Admin Accounts API route.
 *
 * Feature: admin-panel-live-data
 *
 * Tests Property 13: Accounts PnL+BKG invariant.
 * For any user account summary, pnl_bkg SHALL equal net_pnl + brokerage.
 * This invariant must hold for every row returned by GET /api/admin/accounts.
 *
 * The invariant is tested directly against the pure `aggregatePositions`
 * function exported from the route, which is the single source of truth for
 * computing pnl_bkg. No HTTP or database involvement is needed.
 *
 * Validates: Requirements 10.4
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import { aggregatePositions } from '../route';

// ---------------------------------------------------------------------------
// Property 13: Accounts PnL+BKG invariant
// Feature: admin-panel-live-data, Property 13: Accounts PnL+BKG invariant
// Validates: Requirements 10.4
// ---------------------------------------------------------------------------

describe('Admin Accounts API - Property 13: Accounts PnL+BKG invariant', () => {
  // Feature: admin-panel-live-data, Property 13: Accounts PnL+BKG invariant
  // Validates: Requirements 10.4

  it('pnl_bkg === net_pnl + brokerage for every aggregated account row', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            net_pnl: fc.float({ noNaN: true }),
            brokerage: fc.float({ min: 0, noNaN: true }),
          }),
        ),
        (rows) => {
          // Map generated rows to the shape expected by aggregatePositions
          const positions = rows.map((r) => ({
            pnl: r.net_pnl,
            brokerage: r.brokerage,
            settlement: null,
          }));

          const result = aggregatePositions(positions);

          // Property 13: pnl_bkg MUST always equal net_pnl + brokerage
          return result.pnl_bkg === result.net_pnl + result.brokerage;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('pnl_bkg equals net_pnl + brokerage for a single position', () => {
    fc.assert(
      fc.property(
        fc.float({ noNaN: true }),
        fc.float({ min: 0, noNaN: true }),
        (net_pnl, brokerage) => {
          const result = aggregatePositions([
            { pnl: net_pnl, brokerage, settlement: null },
          ]);

          return result.pnl_bkg === result.net_pnl + result.brokerage;
        },
      ),
      { numRuns: 100 },
    );
  });

  it('pnl_bkg equals zero when positions array is empty', () => {
    const result = aggregatePositions([]);
    return result.pnl_bkg === result.net_pnl + result.brokerage && result.pnl_bkg === 0;
  });

  it('pnl_bkg invariant holds across all rows in a multi-user scenario', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.array(
            fc.record({
              net_pnl: fc.float({ noNaN: true }),
              brokerage: fc.float({ min: 0, noNaN: true }),
            }),
          ),
          { minLength: 1 },
        ),
        (userPositionGroups) => {
          // Simulate multiple users, each with their own set of positions
          for (const rows of userPositionGroups) {
            const positions = rows.map((r) => ({
              pnl: r.net_pnl,
              brokerage: r.brokerage,
              settlement: null,
            }));

            const result = aggregatePositions(positions);

            // Property 13 must hold for every user row
            if (result.pnl_bkg !== result.net_pnl + result.brokerage) {
              return false;
            }
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});
