import { describe, it, expect } from 'vitest';
import { Candle } from '../../types';
import { SMAIndicator } from '../SMAIndicator';
import { EMAIndicator } from '../EMAIndicator';
import { RSIIndicator } from '../RSIIndicator';
import { MACDIndicator } from '../MACDIndicator';

// Mock candles for testing
const createMockCandles = (closes: number[]): Candle[] => {
  return closes.map((close, i) => ({
    timestamp: 1600000000000 + i * 60000,
    open: close,
    high: close,
    low: close,
    close: close,
    volume: 100
  }));
};

describe('SMAIndicator', () => {
  it('should calculate correct Simple Moving Average', () => {
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
    const candles = createMockCandles(closes);
    
    // SMA Period = 5
    const sma = new SMAIndicator('sma', { period: 5, source: 'close' });
    const result = sma.initialize(candles);
    
    // Expected result length should match candle length
    expect(result.length).toBe(candles.length);
    
    // First 4 should be NaN (since period is 5)
    expect(isNaN(result[0])).toBe(true);
    expect(isNaN(result[3])).toBe(true);
    
    // 5th element should be (10+11+12+13+14)/5 = 12
    expect(result[4]).toBe(12);
    // 6th element should be (11+12+13+14+15)/5 = 13
    expect(result[5]).toBe(13);
    
    // Live moment value update should not mutate state
    const openCandle: Candle = {
      timestamp: 1600000000000 + 10 * 60000,
      open: 20,
      high: 20,
      low: 20,
      close: 20,
      volume: 100
    };
    
    // momentValue should compute SMA including open price (16+17+18+19+20)/5 = 18
    const momentVal = sma.momentValue(openCandle);
    expect(momentVal).toBe(18);
    
    // nextValue should compute and save
    const nextVal = sma.nextValue(openCandle);
    expect(nextVal).toBe(18);
  });
});

describe('EMAIndicator', () => {
  it('should calculate Exponential Moving Average', () => {
    const closes = [10, 12, 14, 16, 18, 20];
    const candles = createMockCandles(closes);
    
    const ema = new EMAIndicator('ema', { period: 3, source: 'close' });
    const result = ema.initialize(candles);
    
    expect(result.length).toBe(candles.length);
    // EMA period = 3, so first period - 1 (2 elements) are NaN
    expect(isNaN(result[0])).toBe(true);
    
    // SMA of first 3 elements (10+12+14)/3 = 12
    expect(result[2]).toBe(12);
    
    // Next EMA: k = 2/(3+1) = 0.5. (16 - 12) * 0.5 + 12 = 14
    expect(result[3]).toBe(14);
    
    // Next EMA: (18 - 14) * 0.5 + 14 = 16
    expect(result[4]).toBe(16);
  });
});

describe('RSIIndicator', () => {
  it('should calculate Relative Strength Index', () => {
    // A series of candles that goes up continuously
    const closes = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    const candles = createMockCandles(closes);
    
    const rsi = new RSIIndicator('rsi', { period: 14 });
    const result = rsi.initialize(candles);
    
    expect(result.length).toBe(candles.length);
    // Period = 14, first 14 elements should be NaN
    expect(isNaN(result[13])).toBe(true);
    
    // 15th element (index 14) should have a value
    expect(isNaN(result[14])).toBe(false);
    expect(result[14]).toBeGreaterThan(90); // since it's going up non-stop, RSI should be near 100
  });
});

describe('MACDIndicator', () => {
  it('should calculate MACD Line, Signal Line and Histogram', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i) * 5);
    const candles = createMockCandles(closes);
    
    const macd = new MACDIndicator('macd', { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });
    const result = macd.initialize(candles);
    
    expect(result.length).toBe(candles.length);
    
    // Verify properties of MACDValue
    const lastValue = result[result.length - 1];
    expect(lastValue).toHaveProperty('macd');
    expect(lastValue).toHaveProperty('signal');
    expect(lastValue).toHaveProperty('histogram');
    
    // Histogram should match macd - signal difference
    if (!isNaN(lastValue.macd) && !isNaN(lastValue.signal)) {
      expect(lastValue.histogram).toBeCloseTo(lastValue.macd - lastValue.signal);
    }
  });
});
