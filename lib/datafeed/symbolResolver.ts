type LibrarySymbolInfo = any;
type ResolutionString = any;

/**
 * Derives the exchange name from a Kite-style exchange-prefixed symbol.
 * Falls back to "NSE" for unrecognised or un-prefixed symbols.
 */
export function deriveExchange(symbolName: string): string {
  if (symbolName.startsWith('NSE:')) return 'NSE';
  if (symbolName.startsWith('BSE:')) return 'BSE';
  if (symbolName.startsWith('MCX:')) return 'MCX';
  if (symbolName.startsWith('NFO:') || symbolName.startsWith('BFO:')) return 'NSE';
  if (symbolName.startsWith('CDS:')) return 'NSE';
  return 'NSE';
}

/**
 * Builds a TradingView `LibrarySymbolInfo` object for the given symbol and segment.
 *
 * - CRYPTO path: symbolName ends with "USDT" OR segment === "CRYPTO" (case-insensitive)
 *   → session "24x7", exchange "BINANCE"
 * - Indian path: all other symbols
 *   → session "0915-1530", exchange derived from kiteSymbol prefix via `deriveExchange`
 *
 * The ":" separator is used to split the display name from the ticker:
 *   - If present: name = substring after ":", ticker = full symbolName
 *   - If absent:  name = ticker = symbolName
 *
 * Common fields always set:
 *   timezone: "Asia/Kolkata", pricescale: 100, minmov: 1,
 *   has_intraday: true, supported_resolutions: ['1','5','15','60','D'],
 *   format: 'price', data_status: 'streaming'
 */
export function buildSymbolInfo(symbolName: string, segment: string): LibrarySymbolInfo {
  const isCrypto =
    symbolName.endsWith('USDT') || segment.toUpperCase() === 'CRYPTO';

  const colonIdx = symbolName.indexOf(':');
  const name = colonIdx >= 0 ? symbolName.slice(colonIdx + 1) : symbolName;
  const ticker = symbolName;

  const exchange = isCrypto ? 'BINANCE' : deriveExchange(symbolName);
  const session = isCrypto ? '24x7' : '0915-1530';

  return {
    name,
    ticker,
    description: name,
    type: isCrypto ? 'crypto' : 'stock',
    exchange,
    listed_exchange: exchange,
    session,
    timezone: 'Asia/Kolkata',
    pricescale: 100,
    minmov: 1,
    has_intraday: true,
    supported_resolutions: ['1', '5', '15', '60', 'D'] as ResolutionString[],
    volume_precision: 2,
    data_status: 'streaming',
    format: 'price',
  };
}
