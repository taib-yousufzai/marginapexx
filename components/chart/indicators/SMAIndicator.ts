import { BaseIndicator } from './BaseIndicator';
import { Candle, SMAOptions } from '../types';

export class SMAIndicator extends BaseIndicator<SMAOptions, number> {
  private closes: number[] = [];

  constructor(id: string, options: SMAOptions = { period: 20, source: 'close' }, paneIndex: number = 0) {
    super(id, options, paneIndex);
  }

  initialize(candles: Candle[]): number[] {
    this.reset();
    const source = this.options.source;
    this.closes = candles.map(c => c[source]);
    
    const period = this.options.period;
    const result: number[] = [];
    
    let sum = 0;
    for (let i = 0; i < this.closes.length; i++) {
      sum += this.closes[i];
      if (i >= period) {
        sum -= this.closes[i - period];
      }
      
      if (i >= period - 1) {
        result.push(sum / period);
      } else {
        result.push(NaN);
      }
    }
    
    this.values = result;
    return result;
  }

  nextValue(candle: Candle): number {
    const val = candle[this.options.source];
    this.closes.push(val);
    
    const period = this.options.period;
    if (this.closes.length < period) {
      return NaN;
    }
    
    let sum = 0;
    for (let i = this.closes.length - period; i < this.closes.length; i++) {
      sum += this.closes[i];
    }
    return sum / period;
  }

  momentValue(candle: Candle): number {
    const val = candle[this.options.source];
    const period = this.options.period;
    
    const tempCloses = [...this.closes, val];
    if (tempCloses.length < period) {
      return NaN;
    }
    
    let sum = 0;
    for (let i = tempCloses.length - period; i < tempCloses.length; i++) {
      sum += tempCloses[i];
    }
    return sum / period;
  }

  getSeriesConfig(colors: string[] = ['#2962FF']) {
    return [{
      name: 'value',
      type: 'Line',
      paneIndex: this.paneIndex,
      options: {
        color: colors[0] || '#2962FF',
        lineWidth: 1.5,
        title: `${this.id.toUpperCase()} (${this.options.period})`
      }
    }];
  }

  reset(): void {
    super.reset();
    this.closes = [];
  }
}
