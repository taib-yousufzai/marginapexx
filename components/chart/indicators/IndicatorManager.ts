import { IChartApi, ISeriesApi, LineSeries, HistogramSeries } from 'lightweight-charts';
import { BaseIndicator } from './BaseIndicator';
import { Candle } from '../types';

export class IndicatorManager {
  private chart: IChartApi;
  private indicators: Map<string, BaseIndicator> = new Map();
  private seriesMap: Map<string, Map<string, ISeriesApi<any>>> = new Map();

  constructor(chart: IChartApi) {
    this.chart = chart;
  }

  addIndicator(id: string, indicator: BaseIndicator, colors?: string[]) {
    if (this.indicators.has(id)) {
      this.removeIndicator(id);
    }

    this.indicators.set(id, indicator);
    const configList = indicator.getSeriesConfig(colors);
    const indicatorSeries = new Map<string, ISeriesApi<any>>();

    for (const config of configList) {
      let series: ISeriesApi<any>;
      if (config.type === 'Histogram') {
        series = this.chart.addSeries(HistogramSeries, config.options, config.paneIndex);
      } else {
        series = this.chart.addSeries(LineSeries, config.options, config.paneIndex);
      }
      indicatorSeries.set(config.name, series);
    }

    this.seriesMap.set(id, indicatorSeries);
  }

  removeIndicator(id: string) {
    const indicatorSeries = this.seriesMap.get(id);
    if (indicatorSeries) {
      for (const series of indicatorSeries.values()) {
        try {
          this.chart.removeSeries(series);
        } catch (e) {
          console.error(`Error removing series for indicator ${id}:`, e);
        }
      }
      this.seriesMap.delete(id);
    }

    const indicator = this.indicators.get(id);
    if (indicator) {
      indicator.destroy();
      this.indicators.delete(id);
    }
  }

  hasIndicator(id: string): boolean {
    return this.indicators.has(id);
  }

  getIndicator(id: string): BaseIndicator | undefined {
    return this.indicators.get(id);
  }

  initialize(candles: Candle[]) {
    // Reset and initialize all indicators
    for (const [id, indicator] of this.indicators.entries()) {
      const calculatedValues = indicator.initialize(candles);
      this.updateSeriesData(id, candles, calculatedValues);
    }
  }

  update(candle: Candle, isNewCandle: boolean) {
    for (const [id, indicator] of this.indicators.entries()) {
      const value = indicator.update(candle, isNewCandle);
      this.updateSeriesPoint(id, candle.timestamp, value);
    }
  }

  private updateSeriesData(id: string, candles: Candle[], values: any[]) {
    const indicatorSeries = this.seriesMap.get(id);
    if (!indicatorSeries) return;

    for (const [name, series] of indicatorSeries.entries()) {
      const seriesData = candles.map((c, index) => {
        const val = values[index];
        const timeValue = (c.timestamp / 1000) as any; // lightweight-charts expects UNIX seconds
        
        if (typeof val === 'number') {
          return {
            time: timeValue,
            value: isNaN(val) ? undefined : val
          };
        } else if (val && typeof val === 'object') {
          const innerVal = val[name];
          if (name === 'histogram') {
            // Volume-style coloring for histogram
            const color = innerVal >= 0 ? '#26a69a' : '#ef5350';
            return {
              time: timeValue,
              value: isNaN(innerVal) ? undefined : innerVal,
              color
            };
          }
          return {
            time: timeValue,
            value: isNaN(innerVal) ? undefined : innerVal
          };
        }
        return { time: timeValue, value: undefined };
      }).filter(d => d.value !== undefined); // filter out empty values to avoid LWC issues

      series.setData(seriesData);
    }
  }

  private updateSeriesPoint(id: string, timestamp: number, value: any) {
    const indicatorSeries = this.seriesMap.get(id);
    if (!indicatorSeries) return;

    const timeValue = (timestamp / 1000) as any;

    for (const [name, series] of indicatorSeries.entries()) {
      if (typeof value === 'number') {
        if (!isNaN(value)) {
          series.update({
            time: timeValue,
            value: value
          });
        }
      } else if (value && typeof value === 'object') {
        const innerVal = value[name];
        if (!isNaN(innerVal)) {
          if (name === 'histogram') {
            const color = innerVal >= 0 ? '#26a69a' : '#ef5350';
            series.update({
              time: timeValue,
              value: innerVal,
              color
            } as any);
          } else {
            series.update({
              time: timeValue,
              value: innerVal
            });
          }
        }
      }
    }
  }

  clear() {
    for (const id of Array.from(this.indicators.keys())) {
      this.removeIndicator(id);
    }
  }
}
