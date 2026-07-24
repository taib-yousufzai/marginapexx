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
export function formatShortName(name: string): string {
  // Check for Options (e.g., NIFTY2672124200CE)
  const optMatch = name.match(/^([A-Z]+).*?(\d+)(CE|PE)$/i);
  if (optMatch) {
    return `${optMatch[1]} ${optMatch[2]} ${optMatch[3].toUpperCase()}`;
  }

  // Check for Futures (e.g., NIFTY26JULFUT)
  const futMatch = name.match(/^([A-Z]+).*?(FUT)$/i);
  if (futMatch) {
    return `${futMatch[1]} FUT`;
  }

  // Default fallback
  return name;
}

export function buildSymbolInfo(symbolName: string, segment: string): LibrarySymbolInfo {
  const isCrypto =
    symbolName.endsWith('USDT') || segment.toUpperCase() === 'CRYPTO';

  const colonIdx = symbolName.indexOf(':');
  const rawName = colonIdx >= 0 ? symbolName.slice(colonIdx + 1) : symbolName;
  const name = formatShortName(rawName);
  const ticker = symbolName;

  const exchange = isCrypto ? 'BINANCE' : deriveExchange(symbolName);
  
  let session = '0915-1530';
  if (isCrypto) session = '24x7';
  else if (exchange === 'MCX') session = '0900-2355';
  else if (symbolName.startsWith('CDS:')) session = '0900-1700';

  return {
    name,
    ticker,
    description: rawName, // Keep the full original name in description
    type: isCrypto ? 'crypto' : 'stock',
    exchange,
    listed_exchange: exchange,
    session,
    timezone: 'Asia/Kolkata',
    pricescale: 100,
    minmov: 1,
    has_intraday: true,
    intraday_multipliers: ['1', '2', '3', '5', '10', '15', '30', '60'],
    supported_resolutions: ['1', '2', '3', '5', '10', '15', '30', '60', 'D'] as ResolutionString[],
    volume_precision: 2,
    data_status: 'streaming',
    format: 'price',
  };
}
