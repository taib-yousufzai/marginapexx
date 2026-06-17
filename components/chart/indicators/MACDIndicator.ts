import { BaseIndicator } from './BaseIndicator';
import { Candle, MACDOptions, MACDValue } from '../types';

class SimpleEMARunner {
  private period: number;
  private k: number;
  private lastEma = NaN;

  constructor(period: number) {
    this.period = period;
    this.k = 2 / (period + 1);
  }

  initialize(values: number[]): number[] {
    const result: number[] = [];
    if (values.length === 0) return result;
    
    // Find the first non-NaN value
    let startIndex = -1;
    for (let i = 0; i < values.length; i++) {
      if (!isNaN(values[i])) {
        startIndex = i;
        break;
      }
    }

    if (startIndex === -1) {
      return values.map(() => NaN);
    }

    for (let i = 0; i < startIndex; i++) {
      result.push(NaN);
    }

    let ema = values[startIndex];
    result.push(ema);

    for (let i = startIndex + 1; i < values.length; i++) {
      const val = values[i];
      if (isNaN(val)) {
        result.push(NaN);
      } else {
        ema = (val - ema) * this.k + ema;
        result.push(ema);
      }
    }
    
    this.lastEma = ema;
    return result;
  }

  nextValue(val: number): number {
    if (isNaN(val)) return NaN;
    if (isNaN(this.lastEma)) {
      this.lastEma = val;
      return val;
    }
    const nextEma = (val - this.lastEma) * this.k + this.lastEma;
    this.lastEma = nextEma;
    return nextEma;
  }

  momentValue(val: number): number {
    if (isNaN(val)) return NaN;
    if (isNaN(this.lastEma)) return val;
    return (val - this.lastEma) * this.k + this.lastEma;
  }

  reset(): void {
    this.lastEma = NaN;
  }
}

export class MACDIndicator extends BaseIndicator<MACDOptions, MACDValue> {
  private fastRunner: SimpleEMARunner;
  private slowRunner: SimpleEMARunner;
  private signalRunner: SimpleEMARunner;
  private closes: number[] = [];

  constructor(id: string, options: MACDOptions = { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, paneIndex: number = 2) {
    super(id, options, paneIndex);
    this.fastRunner = new SimpleEMARunner(options.fastPeriod);
    this.slowRunner = new SimpleEMARunner(options.slowPeriod);
    this.signalRunner = new SimpleEMARunner(options.signalPeriod);
  }

  initialize(candles: Candle[]): MACDValue[] {
    this.reset();
    if (candles.length === 0) return [];
    
    this.closes = candles.map(c => c.close);
    
    const fastEMAs = this.fastRunner.initialize(this.closes);
    const slowEMAs = this.slowRunner.initialize(this.closes);
    
    const macdLines: number[] = [];
    for (let i = 0; i < this.closes.length; i++) {
      const macd = fastEMAs[i] - slowEMAs[i];
      macdLines.push(macd);
    }
    
    const signalLines = this.signalRunner.initialize(macdLines);
    
    const result: MACDValue[] = [];
    for (let i = 0; i < this.closes.length; i++) {
      const macd = macdLines[i];
      const signal = signalLines[i];
      const histogram = macd - signal;
      
      result.push({
        macd: isNaN(macd) ? NaN : macd,
        signal: isNaN(signal) ? NaN : signal,
        histogram: isNaN(histogram) ? NaN : histogram
      });
    }
    
    this.values = result;
    return result;
  }

  nextValue(candle: Candle): MACDValue {
    const close = candle.close;
    this.closes.push(close);
    
    const fast = this.fastRunner.nextValue(close);
    const slow = this.slowRunner.nextValue(close);
    const macd = fast - slow;
    const signal = this.signalRunner.nextValue(macd);
    const histogram = macd - signal;
    
    return {
      macd: isNaN(macd) ? NaN : macd,
      signal: isNaN(signal) ? NaN : signal,
      histogram: isNaN(histogram) ? NaN : histogram
    };
  }

  momentValue(candle: Candle): MACDValue {
    const close = candle.close;
    const fast = this.fastRunner.momentValue(close);
    const slow = this.slowRunner.momentValue(close);
    const macd = fast - slow;
    const signal = this.signalRunner.momentValue(macd);
    const histogram = macd - signal;
    
    return {
      macd: isNaN(macd) ? NaN : macd,
      signal: isNaN(signal) ? NaN : signal,
      histogram: isNaN(histogram) ? NaN : histogram
    };
  }

  getSeriesConfig(colors: string[] = ['#2962FF', '#FF6D00', '#26a69a', '#ef5350']) {
    return [
      {
        name: 'macd',
        type: 'Line',
        paneIndex: this.paneIndex,
        options: {
          color: colors[0] || '#2962FF',
          lineWidth: 1.5,
          title: 'MACD'
        }
      },
      {
        name: 'signal',
        type: 'Line',
        paneIndex: this.paneIndex,
        options: {
          color: colors[1] || '#FF6D00',
          lineWidth: 1.5,
          title: 'Signal'
        }
      },
      {
        name: 'histogram',
        type: 'Histogram',
        paneIndex: this.paneIndex,
        options: {
          color: colors[2] || '#26a69a',
          title: 'Histogram',
          priceFormat: {
            type: 'volume'
          }
        }
      }
    ];
  }

  reset(): void {
    super.reset();
    this.fastRunner.reset();
    this.slowRunner.reset();
    this.signalRunner.reset();
    this.closes = [];
  }
}
