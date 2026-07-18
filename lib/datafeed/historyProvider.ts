type Bar = any;
type LibrarySymbolInfo = any;
type PeriodParams = any;
type ResolutionString = any;
import { resolutionToBinanceInterval, resolutionToKiteInterval } from './resolutionUtils';

type BinanceKline = any[];

/**
 * Fetches historical bars for a given symbol and resolution.
 *
 * Routes to the Binance API for CRYPTO symbols (segment === 'CRYPTO' or ticker ends with 'USDT'),
 * and to the internal Kite API for all other (Indian market) symbols.
 *
 * Throws on fetch/parse errors so the caller (Datafeed.getBars) can invoke onErrorCallback.
 */
export async function fetchBars(
  symbolInfo: LibrarySymbolInfo,
  resolution: ResolutionString,
  periodParams: PeriodParams,
  segment: string,
): Promise<{ bars: Bar[]; noData: boolean }> {
  try {
    const isCrypto =
      segment.toUpperCase() === 'CRYPTO' ||
      (symbolInfo.ticker ?? symbolInfo.name).endsWith('USDT');

    if (isCrypto) {
      return fetchBinanceBars(symbolInfo.name, resolution, periodParams);
    } else {
      return fetchKiteBars(symbolInfo.ticker ?? symbolInfo.name, resolution, periodParams);
    }
  } catch (err) {
    throw err;
  }
}

/**
 * Fetches bars from the Binance klines REST API.
 * Bar.time is already in milliseconds (kline[0]).
 */
async function fetchBinanceBars(
  symbol: string,
  resolution: ResolutionString,
  periodParams: PeriodParams,
): Promise<{ bars: Bar[]; noData: boolean }> {
  const interval = resolutionToBinanceInterval(resolution);
  const url =
    `https://api.binance.com/api/v3/klines` +
    `?symbol=${symbol}` +
    `&interval=${interval}` +
    `&startTime=${periodParams.from * 1000}` +
    `&endTime=${periodParams.to * 1000}` +
    `&limit=1000`;

  const data: BinanceKline[] = await fetch(url).then((r) => r.json());

  const bars: Bar[] = data.map((k) => ({
    time: k[0], // already in milliseconds
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));

  return { bars, noData: bars.length === 0 };
}

/**
 * Fetches bars from the internal Kite (Zerodha) historical data API.
 * Bar.time is derived from the ISO date string in candle[0].
 */
async function fetchKiteBars(
  ticker: string,
  resolution: ResolutionString,
  periodParams: PeriodParams,
): Promise<{ bars: Bar[]; noData: boolean }> {
  const interval = resolutionToKiteInterval(resolution);
  const url =
    `/api/market/historical` +
    `?symbol=${encodeURIComponent(ticker)}` +
    `&interval=${interval}` +
    `&from=${periodParams.from}` +
    `&to=${periodParams.to}`;

  const json = await fetch(url).then((r) => r.json());

  const candles: any[][] = json?.data?.candles ?? json?.candles ?? [];

  const bars: Bar[] = candles.map((c) => ({
    time: new Date(c[0]).getTime(), // convert ISO string to milliseconds
    open: c[1],
    high: c[2],
    low: c[3],
    close: c[4],
    volume: c[5] ?? 0,
  }));

  return { bars, noData: bars.length === 0 };
}
