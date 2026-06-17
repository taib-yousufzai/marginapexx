import { createChart, IChartApi, ISeriesApi, CandlestickSeries, LineSeries, AreaSeries, BaselineSeries, Time } from 'lightweight-charts';
import { Candle, Timeframe } from '../types';
import { IndicatorManager } from '../indicators/IndicatorManager';
import { PaneManager } from './PaneManager';

export interface ChartControllerConfig {
  container: HTMLElement;
  symbol: string;
  segment: string;
  isDarkMode: boolean;
}

export class ChartController {
  private chart: IChartApi;
  private mainSeries!: ISeriesApi<any>;
  private indicatorManager: IndicatorManager;
  private paneManager: PaneManager;
  
  private symbol: string;
  private segment: string;
  private isDarkMode: boolean;
  private chartType: 'candle' | 'area' | 'bar' | 'baseline' = 'candle';
  
  // Cache of the current candles in memory to track open vs closed candle timestamps
  private candleCache: Candle[] = [];

  constructor(config: ChartControllerConfig) {
    this.symbol = config.symbol;
    this.segment = config.segment;
    this.isDarkMode = config.isDarkMode;

    const gridColor = this.isDarkMode ? '#2A2E39' : '#e0e3eb';
    const textColor = this.isDarkMode ? '#787B86' : '#131722';
    const backgroundColor = this.isDarkMode ? '#131722' : '#ffffff';

    this.chart = createChart(config.container, {
      width: config.container.clientWidth,
      height: config.container.clientHeight,
      layout: {
        background: { color: backgroundColor },
        textColor: textColor,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      },
      grid: {
        vertLines: { color: gridColor, style: 2 }, // Dashed
        horzLines: { color: gridColor, style: 2 }, // Dashed
      },
      crosshair: {
        mode: 1, // Magnet mode on crosshair
        vertLine: { color: '#9598A1', style: 3 }, // Dotted
        horzLine: { color: '#9598A1', style: 3 }, // Dotted
      },
      timeScale: {
        borderColor: gridColor,
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: (p: number) => {
          const isCrypto = this.segment.toUpperCase() === 'CRYPTO' || this.symbol.endsWith('USDT');
          return isCrypto ? p.toFixed(2) : p.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
      }
    });

    this.paneManager = new PaneManager(this.chart);
    this.paneManager.setupPanes(this.isDarkMode);
    
    this.indicatorManager = new IndicatorManager(this.chart);
    
    this.createMainSeries();
  }

  private createMainSeries() {
    if (this.mainSeries) {
      try {
        this.chart.removeSeries(this.mainSeries);
      } catch (e) {}
    }

    const upColor = '#089981';
    const downColor = '#F23645';

    const priceFormat = {
      type: 'price' as const,
      precision: (this.segment.toUpperCase() === 'CRYPTO' || this.symbol.endsWith('USDT')) ? 4 : 2,
      minMove: (this.segment.toUpperCase() === 'CRYPTO' || this.symbol.endsWith('USDT')) ? 0.0001 : 0.05,
    };

    if (this.chartType === 'area') {
      this.mainSeries = this.chart.addSeries(AreaSeries, {
        topColor: 'rgba(8, 153, 129, 0.4)',
        bottomColor: 'rgba(8, 153, 129, 0.0)',
        lineColor: '#089981',
        lineWidth: 2,
        priceFormat,
      }, 0);
    } else if (this.chartType === 'baseline') {
      this.mainSeries = this.chart.addSeries(BaselineSeries, {
        baseValue: { type: 'price', price: 0 },
        topFillColor1: 'rgba(8, 153, 129, 0.28)',
        topFillColor2: 'rgba(8, 153, 129, 0.05)',
        topLineColor: '#089981',
        bottomFillColor1: 'rgba(242, 54, 69, 0.05)',
        bottomFillColor2: 'rgba(242, 54, 69, 0.28)',
        bottomLineColor: '#F23645',
        lineWidth: 2,
        priceFormat,
      }, 0);
    } else {
      // candle or bar
      this.mainSeries = this.chart.addSeries(CandlestickSeries, {
        upColor,
        downColor,
        borderVisible: true,
        wickVisible: true,
        borderColor: upColor,
        borderUpColor: upColor,
        borderDownColor: downColor,
        wickUpColor: upColor,
        wickDownColor: downColor,
        priceFormat,
      }, 0);
    }

    // Restore cached data if we have it
    if (this.candleCache.length > 0) {
      this.applySeriesData(this.candleCache);
    }
  }

  setChartType(type: 'candle' | 'area' | 'bar' | 'baseline') {
    if (this.chartType === type) return;
    this.chartType = type;
    this.createMainSeries();
  }

  getIndicatorManager(): IndicatorManager {
    return this.indicatorManager;
  }

  getPaneManager(): PaneManager {
    return this.paneManager;
  }

  loadHistoricalData(candles: Candle[]) {
    // Unique and sort candles ascending
    const unique = Array.from(new Map(candles.map(item => [item.timestamp, item])).values());
    unique.sort((a, b) => a.timestamp - b.timestamp);
    
    this.candleCache = unique;
    this.applySeriesData(unique);
    this.indicatorManager.initialize(unique);
    this.chart.timeScale().fitContent();
  }

  private applySeriesData(candles: Candle[]) {
    const formatted = candles.map(c => {
      const timeVal = (c.timestamp / 1000) as Time;
      if (this.chartType === 'area' || this.chartType === 'baseline') {
        return { time: timeVal, value: c.close };
      }
      return {
        time: timeVal,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      };
    });
    this.mainSeries.setData(formatted);
  }

  // Receives live price tick. Determines if candle is new or existing, updates main series and indicator engine.
  updateLiveTick(price: number, timestamp: number, timeframe: Timeframe) {
    if (this.candleCache.length === 0) return;

    let intervalMs = 60000;
    if (timeframe === '1m') intervalMs = 60000;
    if (timeframe === '5m') intervalMs = 300000;
    if (timeframe === '15m') intervalMs = 900000;
    if (timeframe === '60m') intervalMs = 3600000;
    if (timeframe === 'day') intervalMs = 86400000;

    const alignedTime = Math.floor(timestamp / intervalMs) * intervalMs;
    const lastCandle = this.candleCache[this.candleCache.length - 1];

    let updatedCandle: Candle;
    let isNewCandle = false;

    if (lastCandle && lastCandle.timestamp === alignedTime) {
      // Update existing open candle
      updatedCandle = {
        timestamp: alignedTime,
        open: lastCandle.open,
        high: Math.max(lastCandle.high, price),
        low: Math.min(lastCandle.low, price),
        close: price,
        volume: lastCandle.volume || 0,
      };
      // Overwrite the last candle in cache
      this.candleCache[this.candleCache.length - 1] = updatedCandle;
    } else {
      // Commit the previous open candle by finalizing indicators first, and then create a new candle
      isNewCandle = true;
      
      // Let's commit the current candle in the cache by signaling it has completed
      this.indicatorManager.update(lastCandle, true);

      updatedCandle = {
        timestamp: alignedTime,
        open: lastCandle ? lastCandle.close : price,
        high: price,
        low: price,
        close: price,
        volume: 0,
      };
      this.candleCache.push(updatedCandle);
    }

    // Update main series on chart
    const timeVal = (updatedCandle.timestamp / 1000) as Time;
    if (this.chartType === 'area' || this.chartType === 'baseline') {
      this.mainSeries.update({ time: timeVal, value: updatedCandle.close });
    } else {
      this.mainSeries.update({
        time: timeVal,
        open: updatedCandle.open,
        high: updatedCandle.high,
        low: updatedCandle.low,
        close: updatedCandle.close,
      });
    }

    // Update indicators on chart
    // If it was a new candle, we already committed the previous candle above.
    // In both cases, we evaluate/run indicators on the current updated candle (either as a new candle init or as a momentValue update).
    // Note that if isNewCandle is true, this first call on the new candle will be a momentValue calculation since the new candle is still open!
    this.indicatorManager.update(updatedCandle, false);
  }

  setTheme(isDarkMode: boolean) {
    if (this.isDarkMode === isDarkMode) return;
    this.isDarkMode = isDarkMode;

    const gridColor = this.isDarkMode ? '#2A2E39' : '#e0e3eb';
    const textColor = this.isDarkMode ? '#787B86' : '#131722';
    const backgroundColor = this.isDarkMode ? '#131722' : '#ffffff';

    this.chart.applyOptions({
      layout: {
        background: { color: backgroundColor },
        textColor: textColor,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      timeScale: {
        borderColor: gridColor,
      }
    });

    this.paneManager.setupPanes(this.isDarkMode);
    
    // Re-create the main series to update its borders and pricing colors
    this.createMainSeries();
  }

  resize() {
    // lightweight-charts handles resizing automatically if autoSize is true.
    // If not, resizeToContainer can be called programmatically.
  }

  resizeToContainer(width: number, height: number) {
    this.chart.resize(width, height);
  }

  destroy() {
    this.indicatorManager.clear();
    try {
      this.chart.remove();
    } catch (e) {}
  }
}
