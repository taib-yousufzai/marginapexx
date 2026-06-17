import { BaseIndicator } from './BaseIndicator';
import { Candle, EMAOptions } from '../types';

export class EMAIndicator extends BaseIndicator<EMAOptions, number> {
  private lastEma = NaN;
  private k = 0;
  private closes: number[] = [];

  constructor(id: string, options: EMAOptions = { period: 20, source: 'close' }, paneIndex: number = 0) {
    super(id, options, paneIndex);
    this.k = 2 / (this.options.period + 1);
  }

  initialize(candles: Candle[]): number[] {
    this.reset();
    const period = this.options.period;
    const source = this.options.source;
    const result: number[] = [];
    
    if (candles.length === 0) return result;
    
    this.closes = candles.map(c => c[source]);
    let ema = this.closes[0];
    result.push(period > 1 ? NaN : ema);
    
    for (let i = 1; i < this.closes.length; i++) {
      const val = this.closes[i];
      if (i < period - 1) {
        ema = (ema * i + val) / (i + 1);
        result.push(NaN); // Keep NaN to match SMA style and avoid drawing lines before period is complete
      } else if (i === period - 1) {
        ema = (ema * i + val) / (i + 1);
        result.push(ema);
      } else {
        ema = (val - ema) * this.k + ema;
        result.push(ema);
      }
    }
    
    this.lastEma = ema;
    this.values = result;
    return result;
  }

  nextValue(candle: Candle): number {
    const val = candle[this.options.source];
    this.closes.push(val);
    
    if (isNaN(this.lastEma)) {
      this.lastEma = val;
      return val;
    }
    
    const nextEma = (val - this.lastEma) * this.k + this.lastEma;
    this.lastEma = nextEma;
    return nextEma;
  }

  momentValue(candle: Candle): number {
    const val = candle[this.options.source];
    if (isNaN(this.lastEma)) {
      return val;
    }
    return (val - this.lastEma) * this.k + this.lastEma;
  }

  getSeriesConfig(colors: string[] = ['#FF6D00']) {
    return [{
      name: 'value',
      type: 'Line',
      paneIndex: this.paneIndex,
      options: {
        color: colors[0] || '#FF6D00',
        lineWidth: 1.5,
        title: `${this.id.toUpperCase()} (${this.options.period})`
      }
    }];
  }

  reset(): void {
    super.reset();
    this.lastEma = NaN;
    this.closes = [];
  }
}
