export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '60m' | 'day';

export interface IndicatorValueMap {
  [key: string]: number | undefined;
}

export type IndicatorValue = number | IndicatorValueMap;

export interface SMAOptions {
  period: number;
  source: 'close' | 'open' | 'high' | 'low';
}

export interface EMAOptions {
  period: number;
  source: 'close' | 'open' | 'high' | 'low';
}

export interface RSIOptions {
  period: number;
}

export interface MACDOptions {
  fastPeriod: number;
  slowPeriod: number;
  signalPeriod: number;
}

export interface MACDValue {
  macd: number;
  signal: number;
  histogram: number;
}
