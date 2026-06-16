import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeDelta, isFullSnapshotNeeded } from '../positionDelta';
import type { PositionState } from '../positionValidator';

describe('positionDelta', () => {
  const arbSide = fc.constantFrom<'BUY' | 'SELL' | null>('BUY', 'SELL', null);
  const arbQty = fc.integer({ min: 0, max: 1000 });
  const arbState = fc.record<PositionState>({
    strike_price: fc.constant(26500),
    option_type: fc.constant('CE'),
    side: arbSide,
    quantity: arbQty,
  });

  it('Property 11: Delta updates contain only changed fields', () => {
    fc.assert(
      fc.property(
        arbState,
        arbState,
        (before, after) => {
          const delta = computeDelta(before, after);

          if (before.side === after.side && before.quantity === after.quantity) {
            // No change: should return null
            expect(delta).toBeNull();
          } else {
            expect(delta).not.toBeNull();
            if (delta) {
              expect(delta.strike_price).toBe(after.strike_price);
              expect(delta.option_type).toBe(after.option_type);

              // Side check
              if (before.side === after.side) {
                expect(delta.side).toBeUndefined();
              } else {
                expect(delta.side).toBe(after.side);
              }

              // Qty check
              if (before.quantity === after.quantity) {
                expect(delta.quantity).toBeUndefined();
              } else {
                expect(delta.quantity).toBe(after.quantity);
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('isFullSnapshotNeeded matches disconnection duration', () => {
    // Under 30 seconds
    const recent = Date.now() - 10000; // 10 seconds ago
    expect(isFullSnapshotNeeded(recent)).toBe(false);

    // Over 30 seconds
    const old = Date.now() - 40000; // 40 seconds ago
    expect(isFullSnapshotNeeded(old)).toBe(true);
  });
});
