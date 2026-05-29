import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computePositionGuard } from '../usePositionGuard';
import { ERRORS } from '../../lib/positionValidator';
import type { PositionSide } from '../../lib/positionValidator';

describe('usePositionGuard', () => {
  const strike = 26500;
  const optionType = 'CE';
  const positionKey = { strike_price: strike, option_type: optionType as 'CE' | 'PE' };

  it('Property 9 & 10: UI guard consistency and error passthrough', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<PositionSide>('BUY', 'SELL', null),
        fc.integer({ min: 0, max: 100 }),
        (side, qty) => {
          const openPositions = qty > 0 && side !== null ? [
            { symbol: 'NIFTY2652826500CE', side, qty_open: qty }
          ] : [];

          const guard = computePositionGuard(positionKey, openPositions);

          // Property 9 check: UI guard state consistency
          expect(guard.canSell === false).toBe(side === 'BUY' && qty > 0);
          expect(guard.canBuy === false).toBe(side === 'SELL' && qty > 0);
          expect(guard.canBuyExit === false).toBe(side !== 'BUY' || qty === 0);
          expect(guard.canSellExit === false).toBe(side !== 'SELL' || qty === 0);

          // Property 10 check: Error messages passthrough
          if (!guard.canBuy) {
            expect(guard.disabledReason.BUY).toBe(ERRORS.CANNOT_BUY_WHILE_SELL_ACTIVE);
          } else {
            expect(guard.disabledReason.BUY).toBeNull();
          }

          if (!guard.canSell) {
            expect(guard.disabledReason.SELL).toBe(ERRORS.CANNOT_SELL_WHILE_BUY_ACTIVE);
          } else {
            expect(guard.disabledReason.SELL).toBeNull();
          }

          if (!guard.canBuyExit) {
            expect(guard.disabledReason.BUY_EXIT).toBe(ERRORS.NO_ACTIVE_BUY_TO_EXIT);
          } else {
            expect(guard.disabledReason.BUY_EXIT).toBeNull();
          }

          if (!guard.canSellExit) {
            expect(guard.disabledReason.SELL_EXIT).toBe(ERRORS.NO_ACTIVE_SELL_TO_EXIT);
          } else {
            expect(guard.disabledReason.SELL_EXIT).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it('returns all enabled when positionKey is null', () => {
    const guard = computePositionGuard(null, []);
    expect(guard.canBuy).toBe(true);
    expect(guard.canSell).toBe(true);
    expect(guard.canBuyExit).toBe(true);
    expect(guard.canSellExit).toBe(true);
  });
});
