import type { OptionType } from './positionValidator';

/**
 * parseOptionSymbol
 *
 * Parses an option symbol string into its components.
 * Works in both client and server environments — no external dependencies.
 *
 * Accepts formats like:
 *   "NIFTY25JAN24000CE"
 *   "NSE:NIFTY25JAN24000CE"
 */
export function parseOptionSymbol(
  symbol: string,
): { underlying: string; strike: number; optionType: OptionType } | null {
  const clean = symbol.includes(':') ? symbol.split(':')[1] : symbol;
  const match = clean
    .toUpperCase()
    .match(/^([A-Z]+)(\d{2}[A-Z0-9]{3})(\d+(?:\.\d+)?)(CE|PE)$/);
  if (!match) return null;
  return {
    underlying: match[1],
    strike: parseFloat(match[3]),
    optionType: match[4] as OptionType,
  };
}
