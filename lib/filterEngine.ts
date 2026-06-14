/**
 * filterEngine.ts
 *
 * Centralised Filter Engine for instrument and contract filtering.
 * All filtering is applied at the backend API layer (serve path only).
 * The data ingestion pipeline (sync-instruments cron) must NOT import this module.
 *
 * Requirements: 1.1, 1.2, 2.2, 3.2, 4.1, 4.2, 5.1, 5.2, 6.1, 9.8
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export interface StrikeConfig {
  indexOptionsRange: number; // default: 5
  mcxOptionsRange: number;   // default: 7
}

export interface FilterContext {
  strikeConfig: StrikeConfig;
  atmPrices: Record<string, number>; // symbol → current market price
  today: string;                     // ISO date string "YYYY-MM-DD"
}

export interface FilterLog {
  event: 'instrument_excluded';
  symbol: string;
  rule: 'FOREX_OPTIONS' | 'CRYPTO_WHITELIST' | 'STRIKE_RANGE' | 'EXPIRY_FILTER';
  segment: string;
  timestamp: string;
}

export interface Instrument {
  id?: string;
  tradingsymbol: string;
  name?: string;
  exchange: string;
  instrument_type: string;
  segment?: string;
  underlying_symbol?: string;
  option_type?: string; // 'CE' | 'PE' | null
  strike_price?: number;
  expiry?: string;
}

export type SegmentKey = string;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_STRIKE_CONFIG: StrikeConfig = {
  indexOptionsRange: 5,
  mcxOptionsRange: 7,
};

const CRYPTO_WHITELIST = new Set(['BTC', 'ETH', 'DOGE']);

// ---------------------------------------------------------------------------
// loadStrikeConfig
// ---------------------------------------------------------------------------

/**
 * Queries the admin_config table for strike range configuration values.
 * Falls back to defaults on missing rows or any DB error.
 * Never throws.
 *
 * Requirements: 2.1, 2.6, 3.1, 3.6
 */
export async function loadStrikeConfig(supabase: SupabaseClient): Promise<StrikeConfig> {
  try {
    const { data, error } = await supabase
      .from('admin_config')
      .select('key, value')
      .in('key', ['index_options_strike_range', 'mcx_options_strike_range']);

    if (error) {
      console.error('[filterEngine] loadStrikeConfig DB error:', error.message);
      return { ...DEFAULT_STRIKE_CONFIG };
    }

    if (!data || data.length === 0) {
      return { ...DEFAULT_STRIKE_CONFIG };
    }

    const rowMap: Record<string, string> = {};
    for (const row of data) {
      rowMap[row.key] = row.value;
    }

    const indexRaw = rowMap['index_options_strike_range'];
    const mcxRaw = rowMap['mcx_options_strike_range'];

    const indexOptionsRange =
      indexRaw !== undefined
        ? (parseInt(indexRaw, 10) || DEFAULT_STRIKE_CONFIG.indexOptionsRange)
        : DEFAULT_STRIKE_CONFIG.indexOptionsRange;

    const mcxOptionsRange =
      mcxRaw !== undefined
        ? (parseInt(mcxRaw, 10) || DEFAULT_STRIKE_CONFIG.mcxOptionsRange)
        : DEFAULT_STRIKE_CONFIG.mcxOptionsRange;

    return { indexOptionsRange, mcxOptionsRange };
  } catch (err) {
    console.error('[filterEngine] loadStrikeConfig unexpected error:', err);
    return { ...DEFAULT_STRIKE_CONFIG };
  }
}

// ---------------------------------------------------------------------------
// isForexOption
// ---------------------------------------------------------------------------

/**
 * Returns true when the instrument is a Forex CE or PE contract.
 * Forex Futures (CDS FUT) and all non-CDS instruments return false.
 *
 * Requirements: 1.1, 1.2
 */
export function isForexOption(instrument: Instrument): boolean {
  const isCds =
    instrument.segment === 'CDS' || instrument.exchange === 'CDS';
  const isOption =
    instrument.option_type === 'CE' || instrument.option_type === 'PE';
  return isCds && isOption;
}

// ---------------------------------------------------------------------------
// applyForexFilter
// ---------------------------------------------------------------------------

/**
 * Filters out all Forex CE/PE contracts from the list.
 * Emits a structured console.log (FilterLog) for each excluded item.
 *
 * Requirements: 1.1, 9.8
 */
export function applyForexFilter(instruments: Instrument[]): Instrument[] {
  const result: Instrument[] = [];
  const timestamp = new Date().toISOString();

  for (const instrument of instruments) {
    if (isForexOption(instrument)) {
      const log: FilterLog = {
        event: 'instrument_excluded',
        symbol: instrument.tradingsymbol,
        rule: 'FOREX_OPTIONS',
        segment: instrument.segment ?? instrument.exchange ?? '',
        timestamp,
      };
      console.log(JSON.stringify(log));
    } else {
      result.push(instrument);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// applyCryptoWhitelist
// ---------------------------------------------------------------------------

/**
 * Keeps only instruments whose underlying_symbol or name is one of
 * BTC, ETH, DOGE (case-insensitive). Logs each exclusion.
 *
 * Requirements: 5.1, 5.2, 9.8
 */
export function applyCryptoWhitelist(instruments: Instrument[]): Instrument[] {
  const result: Instrument[] = [];
  const timestamp = new Date().toISOString();

  for (const instrument of instruments) {
    const symbolRaw = instrument.underlying_symbol ?? instrument.name ?? '';
    const symbol = symbolRaw.toUpperCase();

    if (CRYPTO_WHITELIST.has(symbol)) {
      result.push(instrument);
    } else {
      const log: FilterLog = {
        event: 'instrument_excluded',
        symbol: instrument.tradingsymbol,
        rule: 'CRYPTO_WHITELIST',
        segment: instrument.segment ?? instrument.exchange ?? '',
        timestamp,
      };
      console.log(JSON.stringify(log));
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// applyStrikeRangeFilter
// ---------------------------------------------------------------------------

/**
 * Selects the N closest CE contracts and N closest PE contracts by absolute
 * distance to atmPrice. If fewer than N of either type are available, returns
 * all available contracts of that type. Logs each excluded strike.
 *
 * Requirements: 2.2, 3.2, 9.8
 */
export function applyStrikeRangeFilter(
  instruments: Instrument[],
  atmPrice: number,
  range: number,
): Instrument[] {
  const ceContracts = instruments.filter((i) => i.option_type === 'CE');
  const peContracts = instruments.filter((i) => i.option_type === 'PE');

  // Sort each group by distance from ATM (ascending)
  const byDistance = (a: Instrument, b: Instrument) => {
    const distA = Math.abs((a.strike_price ?? 0) - atmPrice);
    const distB = Math.abs((b.strike_price ?? 0) - atmPrice);
    return distA - distB;
  };

  ceContracts.sort(byDistance);
  peContracts.sort(byDistance);

  const selectedCe = ceContracts.slice(0, range);
  const selectedPe = peContracts.slice(0, range);

  const excludedCe = ceContracts.slice(range);
  const excludedPe = peContracts.slice(range);

  const timestamp = new Date().toISOString();

  for (const instrument of [...excludedCe, ...excludedPe]) {
    const log: FilterLog = {
      event: 'instrument_excluded',
      symbol: instrument.tradingsymbol,
      rule: 'STRIKE_RANGE',
      segment: instrument.segment ?? instrument.exchange ?? '',
      timestamp,
    };
    console.log(JSON.stringify(log));
  }

  // Also pass through non-CE/PE instruments unchanged
  const otherInstruments = instruments.filter(
    (i) => i.option_type !== 'CE' && i.option_type !== 'PE',
  );

  return [...otherInstruments, ...selectedCe, ...selectedPe];
}

// ---------------------------------------------------------------------------
// applyMcxStrikeRangeFilter
// ---------------------------------------------------------------------------

/**
 * MCX-specific strike range filter: directional split around ATM.
 * Returns 10 CE above ATM + 10 CE below ATM + 10 PE above ATM + 10 PE below ATM = 40 total.
 * The count per direction is fixed at 10.
 *
 * CE above ATM = N CE contracts with strike_price >= atmPrice (ascending, nearest first)
 * CE below ATM = N CE contracts with strike_price <  atmPrice (descending, nearest first)
 * PE above ATM = N PE contracts with strike_price >= atmPrice (ascending, nearest first)
 * PE below ATM = N PE contracts with strike_price <  atmPrice (descending, nearest first)
 *
 * If the pool has fewer than N contracts in a direction, all available are returned.
 */
export const MCX_STRIKES_PER_DIRECTION = 10;

export function applyMcxStrikeRangeFilter(
  instruments: Instrument[],
  atmPrice: number,
): Instrument[] {
  const n = MCX_STRIKES_PER_DIRECTION;
  const timestamp = new Date().toISOString();

  const select = (pool: Instrument[], ascending: boolean, limit: number): Instrument[] => {
    const sorted = [...pool].sort((a, b) =>
      ascending
        ? (a.strike_price ?? 0) - (b.strike_price ?? 0)
        : (b.strike_price ?? 0) - (a.strike_price ?? 0),
    );
    const selected = sorted.slice(0, limit);
    const excluded = sorted.slice(limit);
    for (const instrument of excluded) {
      console.log(
        JSON.stringify({
          event: 'instrument_excluded',
          symbol: instrument.tradingsymbol,
          rule: 'STRIKE_RANGE',
          segment: instrument.segment ?? instrument.exchange ?? '',
          timestamp,
        } satisfies FilterLog),
      );
    }
    return selected;
  };

  const ceAbove = instruments.filter((i) => i.option_type === 'CE' && (i.strike_price ?? 0) >= atmPrice);
  const ceBelow = instruments.filter((i) => i.option_type === 'CE' && (i.strike_price ?? 0) < atmPrice);
  const peAbove = instruments.filter((i) => i.option_type === 'PE' && (i.strike_price ?? 0) >= atmPrice);
  const peBelow = instruments.filter((i) => i.option_type === 'PE' && (i.strike_price ?? 0) < atmPrice);

  const others = instruments.filter((i) => i.option_type !== 'CE' && i.option_type !== 'PE');

  return [
    ...others,
    ...select(ceAbove, true, n),   // nearest N above ATM (ascending)
    ...select(ceBelow, false, n),  // nearest N below ATM (descending = closest first)
    ...select(peAbove, true, n),
    ...select(peBelow, false, n),
  ];
}

// ---------------------------------------------------------------------------
// applyExpiryFilter
// ---------------------------------------------------------------------------

/**
 * Returns a single-element array containing the earliest expiry date >= today.
 * Returns [] when no active expiries exist.
 * Dates must be ISO strings 'YYYY-MM-DD'.
 *
 * Requirements: 4.1, 4.2
 */
export function applyExpiryFilter(expiries: string[], today: string): string[] {
  const active = expiries.filter((expiry) => expiry >= today);

  if (active.length === 0) {
    return [];
  }

  const minExpiry = active.reduce((min, e) => (e < min ? e : min), active[0]);
  return [minExpiry];
}

// ---------------------------------------------------------------------------
// applyAllFilters
// ---------------------------------------------------------------------------

/**
 * Master filter function that composes all rules per segment.
 *
 * Segment routing:
 *  - 'CDS'           → applyForexFilter
 *  - 'CRYPTO'/'BCD'  → applyCryptoWhitelist
 *  - 'NFO'           → applyExpiryFilter on expiries, then applyStrikeRangeFilter
 *                       with ctx.strikeConfig.indexOptionsRange
 *  - 'MCX' options   → applyExpiryFilter on expiries, then applyStrikeRangeFilter
 *                       with ctx.strikeConfig.mcxOptionsRange
 *  - All other option segments → applyExpiryFilter on expiries first
 *
 * Requirements: 1.1, 2.2, 3.2, 4.1, 4.2, 5.1, 5.2, 6.1
 */
export function applyAllFilters(
  instruments: Instrument[],
  segment: SegmentKey,
  ctx: FilterContext,
): Instrument[] {
  const seg = segment.toUpperCase();

  // Forex segment: remove CE/PE options
  if (seg === 'CDS') {
    return applyForexFilter(instruments);
  }

  // Crypto segment: whitelist BTC, ETH, DOGE
  if (seg === 'CRYPTO' || seg === 'BCD') {
    return applyCryptoWhitelist(instruments);
  }

  // Index options (NFO)
  if (seg === 'NFO') {
    const withActiveExpiry = filterByActiveExpiry(instruments, ctx.today);
    const optionInstruments = withActiveExpiry.filter(
      (i) => i.option_type === 'CE' || i.option_type === 'PE',
    );
    const nonOptionInstruments = withActiveExpiry.filter(
      (i) => i.option_type !== 'CE' && i.option_type !== 'PE',
    );

    const atmPrice = resolveAtmPrice(optionInstruments, ctx.atmPrices);
    if (atmPrice === null) {
      return withActiveExpiry;
    }

    return [
      ...nonOptionInstruments,
      ...applyStrikeRangeFilter(optionInstruments, atmPrice, ctx.strikeConfig.indexOptionsRange),
    ];
  }

  // MCX options
  if (seg === 'MCX') {
    const withActiveExpiry = filterByActiveExpiry(instruments, ctx.today);
    const optionInstruments = withActiveExpiry.filter(
      (i) => i.option_type === 'CE' || i.option_type === 'PE',
    );
    const nonOptionInstruments = withActiveExpiry.filter(
      (i) => i.option_type !== 'CE' && i.option_type !== 'PE',
    );

    const atmPrice = resolveAtmPrice(optionInstruments, ctx.atmPrices);
    if (atmPrice === null) {
      return withActiveExpiry;
    }

    return [
      ...nonOptionInstruments,
      ...applyStrikeRangeFilter(optionInstruments, atmPrice, ctx.strikeConfig.mcxOptionsRange),
    ];
  }

  // All other segments with options: apply expiry filtering only
  const hasOptions = instruments.some(
    (i) => i.option_type === 'CE' || i.option_type === 'PE',
  );
  if (hasOptions) {
    return filterByActiveExpiry(instruments, ctx.today);
  }

  // No applicable rules — return as-is
  return instruments;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Filters instruments to those with the nearest active expiry.
 * Non-option instruments (no expiry) are passed through unchanged.
 */
function filterByActiveExpiry(instruments: Instrument[], today: string): Instrument[] {
  const withExpiry = instruments.filter((i) => i.expiry !== undefined && i.expiry !== null);
  const withoutExpiry = instruments.filter((i) => i.expiry === undefined || i.expiry === null);

  const expiries = [...new Set(withExpiry.map((i) => i.expiry as string))];
  const activeExpiries = applyExpiryFilter(expiries, today);

  if (activeExpiries.length === 0) {
    // No active expiries — emit EXPIRY_FILTER log for all expiry-bearing instruments
    const timestamp = new Date().toISOString();
    for (const instrument of withExpiry) {
      const log: FilterLog = {
        event: 'instrument_excluded',
        symbol: instrument.tradingsymbol,
        rule: 'EXPIRY_FILTER',
        segment: instrument.segment ?? instrument.exchange ?? '',
        timestamp,
      };
      console.log(JSON.stringify(log));
    }
    return withoutExpiry;
  }

  const activeSet = new Set(activeExpiries);
  const kept: Instrument[] = [];
  const timestamp = new Date().toISOString();

  for (const instrument of withExpiry) {
    if (activeSet.has(instrument.expiry as string)) {
      kept.push(instrument);
    } else {
      const log: FilterLog = {
        event: 'instrument_excluded',
        symbol: instrument.tradingsymbol,
        rule: 'EXPIRY_FILTER',
        segment: instrument.segment ?? instrument.exchange ?? '',
        timestamp,
      };
      console.log(JSON.stringify(log));
    }
  }

  return [...withoutExpiry, ...kept];
}

/**
 * Resolves the ATM price for a set of option instruments from the atmPrices map.
 * Returns null when no price can be found (triggers fallback to all-strikes).
 */
function resolveAtmPrice(
  instruments: Instrument[],
  atmPrices: Record<string, number>,
): number | null {
  for (const instrument of instruments) {
    const symbol = instrument.underlying_symbol ?? instrument.name ?? instrument.tradingsymbol;
    if (symbol && atmPrices[symbol] !== undefined) {
      return atmPrices[symbol];
    }
  }
  return null;
}
