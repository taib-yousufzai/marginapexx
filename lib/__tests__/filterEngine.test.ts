/**
 * Unit tests for lib/filterEngine.ts
 *
 * Tests specific examples and edge cases for all Filter Engine functions.
 * Feature: instrument-contract-filtering
 */

import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  loadStrikeConfig,
  isForexOption,
  applyForexFilter,
  applyExpiryFilter,
  applyStrikeRangeFilter,
  applyCryptoWhitelist,
} from '../filterEngine';
import type { Instrument } from '../filterEngine';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

function makeMockSupabase(data: unknown[] | null, error: { message: string } | null) {
  return {
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data, error }),
      }),
    }),
  } as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// loadStrikeConfig
// ---------------------------------------------------------------------------

describe('loadStrikeConfig', () => {
  it('returns defaults when admin_config rows are absent (empty array)', async () => {
    const supabase = makeMockSupabase([], null);
    const config = await loadStrikeConfig(supabase);
    expect(config).toEqual({ indexOptionsRange: 5, mcxOptionsRange: 7 });
  });

  it('returns defaults on DB error', async () => {
    const supabase = makeMockSupabase(null, { message: 'db error' });
    const config = await loadStrikeConfig(supabase);
    expect(config).toEqual({ indexOptionsRange: 5, mcxOptionsRange: 7 });
  });

  it('parses index_options_strike_range and mcx_options_strike_range correctly', async () => {
    const supabase = makeMockSupabase(
      [
        { key: 'index_options_strike_range', value: '10' },
        { key: 'mcx_options_strike_range', value: '3' },
      ],
      null,
    );
    const config = await loadStrikeConfig(supabase);
    expect(config).toEqual({ indexOptionsRange: 10, mcxOptionsRange: 3 });
  });

  it('uses default for a missing key when only one row is returned', async () => {
    const supabase = makeMockSupabase(
      [{ key: 'index_options_strike_range', value: '8' }],
      null,
    );
    const config = await loadStrikeConfig(supabase);
    expect(config.indexOptionsRange).toBe(8);
    expect(config.mcxOptionsRange).toBe(7); // default
  });
});

// ---------------------------------------------------------------------------
// isForexOption
// ---------------------------------------------------------------------------

describe('isForexOption', () => {
  it('returns true for CDS segment CE option', () => {
    const instrument: Instrument = {
      tradingsymbol: 'USDINR-CE',
      exchange: 'NSE',
      instrument_type: 'CE',
      segment: 'CDS',
      option_type: 'CE',
    };
    expect(isForexOption(instrument)).toBe(true);
  });

  it('returns true for CDS exchange PE option', () => {
    const instrument: Instrument = {
      tradingsymbol: 'EURINR-PE',
      exchange: 'CDS',
      instrument_type: 'PE',
      option_type: 'PE',
    };
    expect(isForexOption(instrument)).toBe(true);
  });

  it('returns false for CDS FUT (no option_type)', () => {
    const instrument: Instrument = {
      tradingsymbol: 'USDINR-FUT',
      exchange: 'NSE',
      instrument_type: 'FUT',
      segment: 'CDS',
    };
    expect(isForexOption(instrument)).toBe(false);
  });

  it('returns false for NSE CE option (non-CDS)', () => {
    const instrument: Instrument = {
      tradingsymbol: 'NIFTY-CE',
      exchange: 'NSE',
      instrument_type: 'CE',
      segment: 'NFO',
      option_type: 'CE',
    };
    expect(isForexOption(instrument)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// applyExpiryFilter
// ---------------------------------------------------------------------------

describe('applyExpiryFilter', () => {
  it('returns [] when all dates are before today (all expired)', () => {
    const expiries = ['2023-01-01', '2023-06-15', '2023-12-31'];
    const today = '2024-01-01';
    expect(applyExpiryFilter(expiries, today)).toEqual([]);
  });

  it('returns the minimum active date when dates are mixed', () => {
    const expiries = ['2023-12-01', '2024-06-15', '2024-03-21', '2025-01-01'];
    const today = '2024-01-01';
    const result = applyExpiryFilter(expiries, today);
    expect(result).toEqual(['2024-03-21']);
  });

  it('returns [] when expiries array is empty', () => {
    expect(applyExpiryFilter([], '2024-01-01')).toEqual([]);
  });

  it('returns the single date when it equals today (today is active)', () => {
    const expiries = ['2024-06-01'];
    const today = '2024-06-01';
    const result = applyExpiryFilter(expiries, today);
    expect(result).toEqual(['2024-06-01']);
  });

  it('returns the earliest of multiple active dates', () => {
    const expiries = ['2024-06-20', '2024-06-06', '2024-06-13'];
    const today = '2024-06-01';
    const result = applyExpiryFilter(expiries, today);
    expect(result).toEqual(['2024-06-06']);
  });
});

// ---------------------------------------------------------------------------
// applyStrikeRangeFilter
// ---------------------------------------------------------------------------

describe('applyStrikeRangeFilter', () => {
  /** Helper to build a simple option instrument */
  function makeOption(strike: number, type: 'CE' | 'PE'): Instrument {
    return {
      tradingsymbol: `NIFTY${strike}${type}`,
      exchange: 'NSE',
      instrument_type: type,
      option_type: type,
      strike_price: strike,
    };
  }

  it('N=5 on exactly 5 CE + 5 PE returns all 10', () => {
    const atmPrice = 22000;
    const instruments: Instrument[] = [
      ...([21800, 21900, 22000, 22100, 22200].map((s) => makeOption(s, 'CE'))),
      ...([21800, 21900, 22000, 22100, 22200].map((s) => makeOption(s, 'PE'))),
    ];
    const result = applyStrikeRangeFilter(instruments, atmPrice, 5);
    const ceCount = result.filter((i) => i.option_type === 'CE').length;
    const peCount = result.filter((i) => i.option_type === 'PE').length;
    expect(ceCount).toBe(5);
    expect(peCount).toBe(5);
  });

  it('N=5 on 3 CE + 10 PE returns 3 CE + 5 PE (pool-constrained)', () => {
    const atmPrice = 22000;
    const ceInstruments = [21900, 22000, 22100].map((s) => makeOption(s, 'CE'));
    const peInstruments = [
      21500, 21600, 21700, 21800, 21900, 22000, 22100, 22200, 22300, 22400,
    ].map((s) => makeOption(s, 'PE'));
    const result = applyStrikeRangeFilter([...ceInstruments, ...peInstruments], atmPrice, 5);
    const ceCount = result.filter((i) => i.option_type === 'CE').length;
    const peCount = result.filter((i) => i.option_type === 'PE').length;
    expect(ceCount).toBe(3);
    expect(peCount).toBe(5);
  });

  it('selects the N closest strikes to ATM', () => {
    const atmPrice = 22000;
    // CE strikes: 21500 (far), 21900 (close), 22000 (ATM), 22100 (close), 22500 (far)
    const ceInstruments = [21500, 21900, 22000, 22100, 22500].map((s) => makeOption(s, 'CE'));
    // N=2: expect 22000 and one of 21900/22100 (both distance 100), not 21500 or 22500
    const result = applyStrikeRangeFilter(ceInstruments, atmPrice, 2);
    const selectedCe = result.filter((i) => i.option_type === 'CE');
    expect(selectedCe).toHaveLength(2);
    // The 2 closest should be 22000 (dist 0) and either 21900 or 22100 (dist 100)
    const selectedStrikes = selectedCe.map((i) => i.strike_price).sort((a, b) => a! - b!);
    expect(selectedStrikes).toContain(22000);
    // 21500 and 22500 (dist 500) should NOT be included
    expect(selectedStrikes).not.toContain(21500);
    expect(selectedStrikes).not.toContain(22500);
  });

  it('passes through non-CE/PE instruments unchanged', () => {
    const atmPrice = 22000;
    const fut: Instrument = {
      tradingsymbol: 'NIFTY-FUT',
      exchange: 'NSE',
      instrument_type: 'FUT',
    };
    const ceInstruments = [21900, 22000, 22100, 22200, 22300].map((s) => makeOption(s, 'CE'));
    const result = applyStrikeRangeFilter([fut, ...ceInstruments], atmPrice, 3);
    // FUT should still be in result
    const futInResult = result.find((i) => i.tradingsymbol === 'NIFTY-FUT');
    expect(futInResult).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// applyCryptoWhitelist
// ---------------------------------------------------------------------------

describe('applyCryptoWhitelist', () => {
  function makeCrypto(symbol: string, underlying?: string): Instrument {
    return {
      tradingsymbol: `${symbol}USDT`,
      exchange: 'BCD',
      instrument_type: 'SPOT',
      underlying_symbol: underlying,
      name: symbol,
    };
  }

  it('allows BTC, ETH, DOGE through', () => {
    const instruments = [
      makeCrypto('BTC'),
      makeCrypto('ETH'),
      makeCrypto('DOGE'),
    ];
    const result = applyCryptoWhitelist(instruments);
    expect(result).toHaveLength(3);
    const symbols = result.map((i) => i.name);
    expect(symbols).toContain('BTC');
    expect(symbols).toContain('ETH');
    expect(symbols).toContain('DOGE');
  });

  it('excludes SOL and XRP', () => {
    const instruments = [
      makeCrypto('SOL'),
      makeCrypto('XRP'),
      makeCrypto('BTC'),
    ];
    const result = applyCryptoWhitelist(instruments);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('BTC');
  });

  it('uses underlying_symbol when available (case-insensitive)', () => {
    const instrument: Instrument = {
      tradingsymbol: 'bitcoin',
      exchange: 'BCD',
      instrument_type: 'SPOT',
      underlying_symbol: 'btc', // lowercase
    };
    const result = applyCryptoWhitelist([instrument]);
    expect(result).toHaveLength(1);
  });

  it('excludes instruments with no matching symbol', () => {
    const instruments = [
      makeCrypto('ADA'),
      makeCrypto('BNB'),
    ];
    const result = applyCryptoWhitelist(instruments);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// applyForexFilter
// ---------------------------------------------------------------------------

describe('applyForexFilter', () => {
  it('removes CDS CE and CDS PE options, keeps CDS FUT', () => {
    const instruments: Instrument[] = [
      { tradingsymbol: 'USDINR-FUT', exchange: 'NSE', instrument_type: 'FUT', segment: 'CDS' },
      { tradingsymbol: 'USDINR24CE', exchange: 'NSE', instrument_type: 'CE', segment: 'CDS', option_type: 'CE' },
      { tradingsymbol: 'USDINR24PE', exchange: 'NSE', instrument_type: 'PE', segment: 'CDS', option_type: 'PE' },
    ];
    const result = applyForexFilter(instruments);
    expect(result).toHaveLength(1);
    expect(result[0].tradingsymbol).toBe('USDINR-FUT');
  });

  it('keeps non-CDS instruments untouched', () => {
    const instruments: Instrument[] = [
      { tradingsymbol: 'NIFTY-CE', exchange: 'NSE', instrument_type: 'CE', segment: 'NFO', option_type: 'CE' },
      { tradingsymbol: 'BTCUSDT', exchange: 'BCD', instrument_type: 'SPOT' },
    ];
    const result = applyForexFilter(instruments);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when all instruments are Forex options', () => {
    const instruments: Instrument[] = [
      { tradingsymbol: 'USDINR24CE', exchange: 'CDS', instrument_type: 'CE', option_type: 'CE' },
      { tradingsymbol: 'EURINR24PE', exchange: 'CDS', instrument_type: 'PE', option_type: 'PE' },
    ];
    const result = applyForexFilter(instruments);
    expect(result).toHaveLength(0);
  });
});
