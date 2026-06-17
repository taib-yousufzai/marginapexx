import { BaseIndicator } from './BaseIndicator';
import { Candle, RSIOptions } from '../types';

export class RSIIndicator extends BaseIndicator<RSIOptions, number> {
  private lastClose = NaN;
  private avgGain = NaN;
  private avgLoss = NaN;
  private closes: number[] = [];

  constructor(id: string, options: RSIOptions = { period: 14 }, paneIndex: number = 1) {
    super(id, options, paneIndex);
  }

  initialize(candles: Candle[]): number[] {
    this.reset();
    const period = this.options.period;
    const result: number[] = [];
    if (candles.length === 0) return result;
    
    this.closes = candles.map(c => c.close);
    if (candles.length < 2) {
      return candles.map(() => NaN);
    }
    
    const gains: number[] = [];
    const losses: number[] = [];
    for (let i = 1; i < this.closes.length; i++) {
      const change = this.closes[i] - this.closes[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? -change : 0);
    }
    
    let sumGain = 0;
    let sumLoss = 0;
    
    // First RSI value at index `period` (which corresponds to candles index `period`)
    for (let i = 0; i < period; i++) {
      sumGain += gains[i];
      sumLoss += losses[i];
    }
    
    let avgGain = sumGain / period;
    let avgLoss = sumLoss / period;
    
    // Pad first `period` candles with NaN
    for (let i = 0; i < period; i++) {
      result.push(NaN);
    }
    
    const calcRSI = (g: number, l: number) => {
      if (l === 0) return 100;
      const rs = g / l;
      return 100 - 100 / (1 + rs);
    };
    
    result.push(calcRSI(avgGain, avgLoss));
    
    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
      result.push(calcRSI(avgGain, avgLoss));
    }
    
    this.avgGain = avgGain;
    this.avgLoss = avgLoss;
    this.lastClose = this.closes[this.closes.length - 1];
    
    this.values = result;
    return result;
  }

  nextValue(candle: Candle): number {
    const change = candle.close - this.lastClose;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    this.closes.push(candle.close);
    
    const period = this.options.period;
    if (isNaN(this.avgGain) || isNaN(this.avgLoss)) {
      this.lastClose = candle.close;
      return NaN;
    }
    
    this.avgGain = (this.avgGain * (period - 1) + gain) / period;
    this.avgLoss = (this.avgLoss * (period - 1) + loss) / period;
    this.lastClose = candle.close;
    
    if (this.avgLoss === 0) return 100;
    const rs = this.avgGain / this.avgLoss;
    return 100 - 100 / (1 + rs);
  }

  momentValue(candle: Candle): number {
    const change = candle.close - this.lastClose;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    
    const period = this.options.period;
    if (isNaN(this.avgGain) || isNaN(this.avgLoss)) {
      return NaN;
    }
    
    const tempAvgGain = (this.avgGain * (period - 1) + gain) / period;
    const tempAvgLoss = (this.avgLoss * (period - 1) + loss) / period;
    
    if (tempAvgLoss === 0) return 100;
    const rs = tempAvgGain / tempAvgLoss;
    return 100 - 100 / (1 + rs);
  }

  getSeriesConfig(colors: string[] = ['#787B86']) {
    return [
      {
        name: 'value',
        type: 'Line',
        paneIndex: this.paneIndex,
        options: {
          color: colors[0] || '#787B86',
          lineWidth: 1.5,
          title: `RSI (${this.options.period})`
        }
      }
    ];
  }

  reset(): void {
    super.reset();
    this.lastClose = NaN;
    this.avgGain = NaN;
    this.avgLoss = NaN;
    this.closes = [];
  }
}
