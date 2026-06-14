/**
 * Property-based tests for lib/filterEngine.ts using fast-check.
 *
 * Each property verifies a universal correctness guarantee that must hold
 * across all valid inputs, running 100 iterations each.
 *
 * Feature: instrument-contract-filtering
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  isForexOption,
  applyForexFilter,
  applyStrikeRangeFilter,
  applyExpiryFilter,
  applyCryptoWhitelist,
} from '../filterEngine';
import type { Instrument } from '../filterEngine';

// ---------------------------------------------------------------------------
// Generators / Arbitraries
// ---------------------------------------------------------------------------

/** Non-CDS option instrument */
const arbNonCdsOption = fc.record<Instrument>({
  tradingsymbol: fc.string({ minLength: 1, maxLength: 20 }),
  exchange: fc.constantFrom('NSE', 'BSE', 'MCX', 'BCD'),
  instrument_type: fc.constantFrom('CE', 'PE'),
  segment: fc.constantFrom('NFO', 'MCX', 'BFO'),
  option_type: fc.constantFrom('CE', 'PE'),
  strike_price: fc.integer({ min: 1, max: 100000 }),
});

/** CDS CE option (should be excluded by forex filter) */
const arbCdsCe = fc.record<Instrument>({
  tradingsymbol: fc.string({ minLength: 1, maxLength: 20 }),
  exchange: fc.constantFrom('NSE', 'CDS'),
  instrument_type: fc.constant('CE'),
  segment: fc.constant('CDS'),
  option_type: fc.constant('CE'),
});

/** CDS PE option (should be excluded by forex filter) */
const arbCdsPe = fc.record<Instrument>({
  tradingsymbol: fc.string({ minLength: 1, maxLength: 20 }),
  exchange: fc.constantFrom('NSE', 'CDS'),
  instrument_type: fc.constant('PE'),
  segment: fc.constant('CDS'),
  option_type: fc.constant('PE'),
});

/** CDS FUT instrument (should pass forex filter) */
const arbCdsFut = fc.record<Instrument>({
  tradingsymbol: fc.string({ minLength: 1, maxLength: 20 }),
  exchange: fc.constantFrom('NSE', 'CDS'),
  instrument_type: fc.constant('FUT'),
  segment: fc.constant('CDS'),
  // no option_type
});

/** CE option at a given strike */
function makeCeAt(strike: number): Instrument {
  return {
    tradingsymbol: `NIFTY${strike}CE`,
    exchange: 'NSE',
    instrument_type: 'CE',
    option_type: 'CE',
    strike_price: strike,
  };
}

/** PE option at a given strike */
function makePeAt(strike: number): Instrument {
  return {
    tradingsymbol: `NIFTY${strike}PE`,
    exchange: 'NSE',
    instrument_type: 'PE',
    option_type: 'PE',
    strike_price: strike,
  };
}

/** Arbitrary ATM price */
const arbAtmPrice = fc.integer({ min: 100, max: 100000 });

/** Arbitrary strike range N in [1, 20] */
const arbRange = fc.integer({ min: 1, max: 20 });

/** Arbitrary ISO date string (YYYY-MM-DD) between 2020 and 2030 */
const arbDate = fc
  .integer({ min: 2020, max: 2029 })
  .chain((year) =>
    fc.integer({ min: 1, max: 12 }).chain((month) =>
      fc.integer({ min: 1, max: 28 }).map((day) => {
        const mm = String(month).padStart(2, '0');
        const dd = String(day).padStart(2, '0');
        return `${year}-${mm}-${dd}`;
      }),
    ),
  );

/** Arbitrary whitelisted crypto symbol */
const arbWhitelistedSymbol = fc.constantFrom('BTC', 'ETH', 'DOGE');

/** Arbitrary non-whitelisted crypto symbol */
const arbNonWhitelistedSymbol = fc
  .string({ minLength: 1, maxLength: 6 })
  .filter((s) => !['BTC', 'ETH', 'DOGE'].includes(s.toUpperCase()));

/** Build a crypto instrument from a symbol (using name field) */
function makeCryptoByName(symbol: string): Instrument {
  return {
    tradingsymbol: `${symbol}USDT`,
    exchange: 'BCD',
    instrument_type: 'SPOT',
    name: symbol,
  };
}

// ---------------------------------------------------------------------------
// Property 1: Forex Options Exclusion
// Validates: Requirements 1.1, 1.2, 1.4, 1.5
// ---------------------------------------------------------------------------

describe('Property 1: Forex Options Exclusion', () => {
  /**
   * Validates: Requirements 1.1, 1.2, 1.4, 1.5
   */
  it('applyForexFilter output has zero items where isForexOption is true', () => {
    // Generate a mixed list of CDS CE, CDS PE, CDS FUT, and non-CDS options
    const arbMixedInstruments = fc.array(
      fc.oneof(arbCdsCe, arbCdsPe, arbCdsFut, arbNonCdsOption),
      { minLength: 0, maxLength: 30 },
    );

    fc.assert(
      fc.property(arbMixedInstruments, (instruments) => {
        const result = applyForexFilter(instruments);
        // After filtering, no instrument in the result should be a Forex option
        for (const instrument of result) {
          if (isForexOption(instrument)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Strike Range Filtering Produces Exactly N CE + N PE
// Validates: Requirements 2.2, 2.3, 3.2, 3.3, 9.2, 9.3
// ---------------------------------------------------------------------------

describe('Property 2: Strike Range Filtering Produces Exactly N CE + N PE', () => {
  /**
   * Validates: Requirements 2.2, 2.3, 3.2, 3.3, 9.2, 9.3
   */
  it('output has exactly N CE and N PE when input has at least N of each', () => {
    // Generate N, atmPrice, and then build a pool with >= N CE and >= N PE
    const arbTestInput = arbRange.chain((n) =>
      arbAtmPrice.chain((atmPrice) =>
        // extra CE strikes: n..n+10 more than needed
        fc.integer({ min: 0, max: 10 }).chain((ceExtra) =>
          fc.integer({ min: 0, max: 10 }).map((peExtra) => {
            // Generate distinct strike offsets: -500*k to +500*k
            const totalCe = n + ceExtra;
            const totalPe = n + peExtra;
            // Use predictable strikes around atmPrice
            const ceStrikes = Array.from({ length: totalCe }, (_, i) =>
              atmPrice + (i - Math.floor(totalCe / 2)) * 100,
            );
            const peStrikes = Array.from({ length: totalPe }, (_, i) =>
              atmPrice + (i - Math.floor(totalPe / 2)) * 100,
            );
            const instruments: Instrument[] = [
              ...ceStrikes.map(makeCeAt),
              ...peStrikes.map(makePeAt),
            ];
            return { n, atmPrice, instruments };
          }),
        ),
      ),
    );

    fc.assert(
      fc.property(arbTestInput, ({ n, atmPrice, instruments }) => {
        const result = applyStrikeRangeFilter(instruments, atmPrice, n);
        const ceCount = result.filter((i) => i.option_type === 'CE').length;
        const peCount = result.filter((i) => i.option_type === 'PE').length;

        // Should have exactly N CE and N PE
        return ceCount === n && peCount === n;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Current Expiry Only
// Validates: Requirements 4.1, 4.2, 4.4, 9.4
// ---------------------------------------------------------------------------

describe('Property 4: Current Expiry Only', () => {
  const TODAY = '2024-06-01';

  /**
   * Validates: Requirements 4.1, 4.2, 4.4, 9.4
   */
  it('returns single-element array equal to the minimum active date', () => {
    // Generate at least 1 active date (>= TODAY) plus an optional set of expired dates
    const arbActiveDates = fc
      .array(arbDate.filter((d) => d >= TODAY), { minLength: 1, maxLength: 10 });
    const arbExpiredDates = fc.array(
      arbDate.filter((d) => d < TODAY),
      { minLength: 0, maxLength: 10 },
    );

    fc.assert(
      fc.property(arbActiveDates, arbExpiredDates, (activeDates, expiredDates) => {
        const allDates = [...activeDates, ...expiredDates];
        const result = applyExpiryFilter(allDates, TODAY);

        // Must be a single-element array
        if (result.length !== 1) return false;

        // The returned date must be >= today
        if (result[0] < TODAY) return false;

        // The returned date must be the minimum active date
        const expectedMin = activeDates.reduce((min, d) => (d < min ? d : min), activeDates[0]);
        return result[0] === expectedMin;
      }),
      { numRuns: 100 },
    );
  });

  it('returns [] when all dates are expired', () => {
    const arbAllExpired = fc.array(
      arbDate.filter((d) => d < TODAY),
      { minLength: 1, maxLength: 10 },
    );

    fc.assert(
      fc.property(arbAllExpired, (expiredDates) => {
        const result = applyExpiryFilter(expiredDates, TODAY);
        return result.length === 0;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Crypto Whitelist Exclusion
// Validates: Requirements 5.1, 5.2, 5.3, 5.4, 9.5
// ---------------------------------------------------------------------------

describe('Property 5: Crypto Whitelist Exclusion', () => {
  /**
   * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 9.5
   */
  it('output contains only BTC, ETH, DOGE symbols', () => {
    const arbCryptoList = fc.array(
      fc.oneof(
        arbWhitelistedSymbol.map(makeCryptoByName),
        arbNonWhitelistedSymbol.map(makeCryptoByName),
      ),
      { minLength: 0, maxLength: 30 },
    );

    const WHITELIST = new Set(['BTC', 'ETH', 'DOGE']);

    fc.assert(
      fc.property(arbCryptoList, (instruments) => {
        const result = applyCryptoWhitelist(instruments);
        for (const instrument of result) {
          const sym = (instrument.underlying_symbol ?? instrument.name ?? '').toUpperCase();
          if (!WHITELIST.has(sym)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Invalid Strike Range Rejected (admin config validation)
// Validates: Requirements 7.4, 7.5
// ---------------------------------------------------------------------------

describe('Property 6: Invalid Strike Range Rejected', () => {
  /**
   * Validates: Requirements 7.4, 7.5
   *
   * Tests the concept of positive-integer validation for admin config values.
   * A valid strike range must be a positive integer (> 0).
   */
  const isValidStrikeRange = (v: unknown): boolean =>
    Number.isInteger(v) && (v as number) > 0;

  it('rejects zero and negative integers', () => {
    const arbNonPositiveInt = fc.integer({ min: -10000, max: 0 });

    fc.assert(
      fc.property(arbNonPositiveInt, (v) => {
        return !isValidStrikeRange(v);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects float values', () => {
    // Generate floats that are not whole numbers (use Math.fround for 32-bit float bounds)
    const arbFloat = fc.float({ min: Math.fround(0.001), max: Math.fround(10000), noNaN: true }).filter((v) => !Number.isInteger(v));

    fc.assert(
      fc.property(arbFloat, (v) => {
        return !isValidStrikeRange(v);
      }),
      { numRuns: 100 },
    );
  });

  it('rejects null and undefined', () => {
    expect(isValidStrikeRange(null)).toBe(false);
    expect(isValidStrikeRange(undefined)).toBe(false);
    expect(isValidStrikeRange('')).toBe(false);
    expect(isValidStrikeRange('5')).toBe(false); // string, not integer
  });

  it('rejects negative numbers', () => {
    const arbNegative = fc.integer({ min: -10000, max: -1 });

    fc.assert(
      fc.property(arbNegative, (v) => {
        return !isValidStrikeRange(v);
      }),
      { numRuns: 100 },
    );
  });

  it('accepts positive integers', () => {
    const arbPositiveInt = fc.integer({ min: 1, max: 1000 });

    fc.assert(
      fc.property(arbPositiveInt, (v) => {
        return isValidStrikeRange(v);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Watchlist Rejects Excluded Instruments
// Validates: Requirements 1.4, 5.6, 8.4
// ---------------------------------------------------------------------------

describe('Property 7: Watchlist Rejects Excluded Instruments', () => {
  /**
   * Validates: Requirements 1.4, 5.6, 8.4
   *
   * For any Forex CE/PE instrument, isForexOption returns true.
   * For any instrument whose underlying_symbol is not BTC/ETH/DOGE,
   * it is excluded by applyCryptoWhitelist.
   */
  it('isForexOption returns true for any CDS CE/PE instrument', () => {
    const arbForexCePe = fc.oneof(arbCdsCe, arbCdsPe);

    fc.assert(
      fc.property(arbForexCePe, (instrument) => {
        return isForexOption(instrument) === true;
      }),
      { numRuns: 100 },
    );
  });

  it('applyCryptoWhitelist excludes all non-whitelisted symbols', () => {
    const WHITELIST = new Set(['BTC', 'ETH', 'DOGE']);

    fc.assert(
      fc.property(arbNonWhitelistedSymbol, (symbol) => {
        const instrument: Instrument = {
          tradingsymbol: `${symbol}USDT`,
          exchange: 'BCD',
          instrument_type: 'SPOT',
          underlying_symbol: symbol,
        };
        const result = applyCryptoWhitelist([instrument]);
        // Non-whitelisted symbol should be excluded (result should be empty)
        for (const i of result) {
          const sym = (i.underlying_symbol ?? i.name ?? '').toUpperCase();
          if (WHITELIST.has(sym)) continue;
          return false; // non-whitelisted found in result
        }
        // If result contains the instrument, it must have been whitelisted
        return result.length === 0 || WHITELIST.has(symbol.toUpperCase());
      }),
      { numRuns: 100 },
    );
  });
});
