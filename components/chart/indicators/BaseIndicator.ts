import { Candle } from '../types';

export abstract class BaseIndicator<TOptions = any, TValue = any> {
  protected options: TOptions;
  protected values: TValue[] = [];
  public paneIndex: number = 0;
  public id: string;

  constructor(id: string, options: TOptions, paneIndex: number = 0) {
    this.id = id;
    this.options = options;
    this.paneIndex = paneIndex;
  }

  abstract initialize(candles: Candle[]): TValue[];
  abstract nextValue(candle: Candle): TValue;
  abstract momentValue(candle: Candle): TValue;
  
  update(candle: Candle, isNewCandle: boolean): TValue {
    if (isNewCandle) {
      const val = this.nextValue(candle);
      this.values.push(val);
      return val;
    } else {
      return this.momentValue(candle);
    }
  }

  abstract getSeriesConfig(colors?: string[]): any[];

  getValues(): TValue[] {
    return this.values;
  }

  getOptions(): TOptions {
    return this.options;
  }

  reset(): void {
    this.values = [];
  }

  destroy(): void {}
}
