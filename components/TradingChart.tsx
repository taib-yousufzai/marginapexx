'use client';

import React, { useEffect, useRef, useState } from 'react';
import { init, dispose, Chart, KLineData, LineType, TooltipShowRule } from 'klinecharts';
import './trading-chart.css';

interface TradingChartProps {
  symbol: string;         // e.g., "BTCUSDT" or "NSE:INFY"
  segment: string;        // e.g., "CRYPTO" or "EQ"
  liveQuote?: any;        // Live quote object to update the last candle
}

type Timeframe = '1m' | '5m' | '15m' | '60m' | 'day';

export default function TradingChart({ symbol, segment, liveQuote }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // For the legend overlay
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePct, setPriceChangePct] = useState<number>(0);

  // Active Drawing Tool state
  const [activeDrawingTool, setActiveDrawingTool] = useState<string | null>(null);

  const isCrypto = segment.toUpperCase() === 'CRYPTO' || symbol.endsWith('USDT');

  // Convert timeframe to Binance or Kite interval string
  const getIntervalString = () => {
    if (isCrypto) {
      switch (timeframe) {
        case '1m': return '1m';
        case '5m': return '5m';
        case '15m': return '15m';
        case '60m': return '1h';
        case 'day': return '1d';
        default: return '5m';
      }
    } else {
      switch (timeframe) {
        case '1m': return 'minute';
        case '5m': return '5minute';
        case '15m': return '15minute';
        case '60m': return '60minute';
        case 'day': return 'day';
        default: return '5minute';
      }
    }
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const isDarkMode = document.body.classList.contains('dark');
    const backgroundColor = isDarkMode ? '#131722' : '#ffffff';
    const textColor = isDarkMode ? '#787B86' : '#131722';
    const gridColor = isDarkMode ? '#363c4e' : '#e0e3eb';

    // Create klinecharts Instance
    const chart = init(chartContainerRef.current, {
      styles: {
        grid: {
          horizontal: { color: gridColor, style: LineType.Dashed },
          vertical: { color: gridColor, style: LineType.Dashed }
        },
        candle: {
          bar: {
            upColor: '#089981',
            downColor: '#F23645',
            noChangeColor: '#888888',
            upBorderColor: '#089981',
            downBorderColor: '#F23645',
            noChangeBorderColor: '#888888',
            upWickColor: '#089981',
            downWickColor: '#F23645',
            noChangeWickColor: '#888888'
          },
          priceMark: {
            show: true,
            high: { show: false },
            low: { show: false },
            last: {
              show: true,
              upColor: '#089981',
              downColor: '#F23645',
              noChangeColor: '#888888',
              line: { show: true, style: LineType.Dashed, size: 1 },
              text: {
                show: true,
                size: 12,
                paddingLeft: 4,
                paddingTop: 4,
                paddingRight: 4,
                paddingBottom: 4,
                color: '#FFFFFF'
              }
            }
          },
          tooltip: {
            showRule: TooltipShowRule.None // We use our own legend overlay
          }
        },
        xAxis: {
          tickText: { color: textColor },
          axisLine: { color: gridColor }
        },
        yAxis: {
          tickText: { color: textColor },
          axisLine: { color: gridColor }
        },
        crosshair: {
          horizontal: { line: { color: '#9598A1', style: LineType.Dashed } },
          vertical: { line: { color: '#9598A1', style: LineType.Dashed } }
        }
      }
    });

    if (chart) {
      chartRef.current = chart;
    }

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== chartContainerRef.current) return;
      chart?.resize();
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (chartContainerRef.current) {
        dispose(chartContainerRef.current);
      }
    };
  }, []);

  // Fetch Historical Data
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        let data: KLineData[] = [];

        if (isCrypto) {
          const interval = getIntervalString();
          const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`);
          const json = await res.json();
          if (!Array.isArray(json)) throw new Error(json.msg || 'Failed to fetch');
          data = json.map((k: any) => ({
            timestamp: parseInt(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
          }));
        } else {
          const toDate = new Date();
          let fromDate = new Date();
          
          if (timeframe === 'day') {
            fromDate.setFullYear(fromDate.getFullYear() - 1);
          } else if (timeframe === '60m') {
            fromDate.setDate(fromDate.getDate() - 30);
          } else if (timeframe === '15m') {
            fromDate.setDate(fromDate.getDate() - 10);
          } else {
            fromDate.setDate(fromDate.getDate() - 4);
          }

          const from = fromDate.toISOString().split('T')[0];
          const to = toDate.toISOString().split('T')[0];
          const interval = getIntervalString();

          const res = await fetch(`/api/market/historical?symbol=${encodeURIComponent(symbol)}&interval=${interval}&from=${from}&to=${to}`);
          const json = await res.json();
          
          if (res.ok && json.candles) {
            data = json.candles.map((c: any) => {
              const dt = new Date(c[0]);
              return {
                timestamp: dt.getTime(),
                open: c[1],
                high: c[2],
                low: c[3],
                close: c[4],
                volume: c[5] || 0,
              };
            });
          } else {
            throw new Error(json.error || 'Failed to load historical data');
          }
        }

        if (isMounted && chartRef.current) {
          const uniqueData = Array.from(new Map(data.map(item => [item.timestamp, item])).values());
          uniqueData.sort((a, b) => a.timestamp - b.timestamp);
          
          chartRef.current.applyNewData(uniqueData);
          setLoading(false);

          if (uniqueData.length > 0) {
            const last = uniqueData[uniqueData.length - 1];
            setCurrentPrice(last.close);
            if (uniqueData.length > 1) {
              const prev = uniqueData[uniqueData.length - 2];
              const change = last.close - prev.close;
              setPriceChange(change);
              setPriceChangePct((change / prev.close) * 100);
            }
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => { isMounted = false; };
  }, [symbol, timeframe, isCrypto]);

  // Update with live quote
  useEffect(() => {
    if (!liveQuote || !chartRef.current || loading) return;
    
    const currentTime = Date.now();
    let intervalMs = 60000;
    if (timeframe === '1m') intervalMs = 60000;
    if (timeframe === '5m') intervalMs = 300000;
    if (timeframe === '15m') intervalMs = 900000;
    if (timeframe === '60m') intervalMs = 3600000;
    if (timeframe === 'day') intervalMs = 86400000;

    const alignedTime = Math.floor(currentTime / intervalMs) * intervalMs;

    try {
      const dataList = chartRef.current.getDataList();
      const lastCandle = dataList.length > 0 ? dataList[dataList.length - 1] : null;

      const lastPrice = liveQuote.lastPrice || liveQuote.last_price;
      if (!lastPrice) return;

      setCurrentPrice(lastPrice);
      setPriceChange(liveQuote.change || (lastPrice - (lastCandle?.open || lastPrice)));
      setPriceChangePct(liveQuote.changePercent || 0);

      if (lastCandle && lastCandle.timestamp === alignedTime) {
        chartRef.current.updateData({
          timestamp: alignedTime,
          open: lastCandle.open,
          high: Math.max(lastCandle.high, lastPrice),
          low: Math.min(lastCandle.low, lastPrice),
          close: lastPrice,
          volume: lastCandle.volume
        });
      } else {
        chartRef.current.updateData({
          timestamp: alignedTime,
          open: lastCandle ? lastCandle.close : lastPrice,
          high: lastPrice,
          low: lastPrice,
          close: lastPrice,
          volume: 0
        });
      }
    } catch (e) {}
  }, [liveQuote, timeframe, loading]);

  const displayExchange = isCrypto ? 'BINANCE' : (symbol.includes('SENSEX') || symbol.includes('BANKEX')) ? 'BSE' : 'NSE';
  const isUp = priceChange >= 0;

  const handleDrawingTool = (toolName: string) => {
    if (!chartRef.current) return;
    
    if (activeDrawingTool === toolName) {
      // User clicked active tool again to cancel it
      setActiveDrawingTool(null);
    } else {
      setActiveDrawingTool(toolName);
      chartRef.current.createOverlay({
        name: toolName,
        id: `overlay_${Date.now()}`,
        onDrawEnd: (event: any) => {
          // If it's a text annotation, ask for the text
          if (toolName === 'simpleAnnotation') {
            const text = window.prompt('Enter your text annotation:');
            if (text) {
              chartRef.current?.overrideOverlay({ id: event.overlay.id, name: toolName, extendData: text });
            } else {
              // Remove if user cancels the prompt
              chartRef.current?.removeOverlay({ id: event.overlay.id });
            }
          }
          // Deactivate tool after finishing the drawing
          setActiveDrawingTool(null);
          return true;
        }
      });
    }
  };

  return (
    <div className="tc-wrapper">
      {/* Top Toolbar */}
      <div className="tc-top-toolbar">
        <button className="tc-icon-btn" onClick={() => {
            const sheet = document.getElementById('chartSheet'); 
            const overlay = document.getElementById('chartSheetOverlay'); 
            if (sheet) sheet.classList.remove('open'); 
            if (overlay) overlay.classList.remove('active'); 
        }}>
          <i className="fas fa-arrow-left"></i>
        </button>

        <div className="tc-symbol-search">
          <i className="fas fa-search" style={{ opacity: 0.6 }}></i>
          {symbol}
        </div>

        <div className="tc-divider"></div>

        {/* Timeframes */}
        {(['1m', '5m', '15m', '60m', 'day'] as Timeframe[]).map(tf => (
          <div
            key={tf}
            className={`tc-timeframe ${timeframe === tf ? 'active' : ''}`}
            onClick={() => setTimeframe(tf)}
          >
            {tf}
          </div>
        ))}

        <div className="tc-divider"></div>

        <button className="tc-icon-btn"><i className="fas fa-chart-simple"></i></button>
        <button className="tc-icon-btn"><i className="fas fa-subscript" style={{ fontSize: '0.9rem' }}></i></button>
        <button className="tc-icon-btn"><i className="fas fa-pen" style={{ fontSize: '0.9rem' }}></i></button>
        <button className="tc-icon-btn"><i className="far fa-copy" style={{ fontSize: '1rem' }}></i></button>

        <div className="tc-right-icons">
          <button className="tc-icon-btn"><i className="far fa-square"></i></button>
        </div>
      </div>
      
      {/* Main Area */}
      <div className="tc-main-area">
        {/* Left Toolbar - Now Functional with klinecharts */}
        <div className="tc-left-toolbar">
          <div className={`tc-tool-icon ${!activeDrawingTool ? 'active' : ''}`} onClick={() => setActiveDrawingTool(null)} title="Crosshair">
            <i className="fas fa-crosshairs"></i>
          </div>
          <div className={`tc-tool-icon ${activeDrawingTool === 'rayLine' ? 'active' : ''}`} onClick={() => handleDrawingTool('rayLine')} title="Trendline">
            <i className="fas fa-location-arrow" style={{ transform: 'rotate(45deg)' }}></i>
          </div>
          <div className={`tc-tool-icon ${activeDrawingTool === 'fibonacciLine' ? 'active' : ''}`} onClick={() => handleDrawingTool('fibonacciLine')} title="Fibonacci">
            <i className="fas fa-align-left"></i>
          </div>
          <div className={`tc-tool-icon ${activeDrawingTool === 'simpleAnnotation' ? 'active' : ''}`} onClick={() => handleDrawingTool('simpleAnnotation')} title="Text Annotation">
            <div style={{ fontWeight: 'bold', fontFamily: 'serif' }}>T</div>
          </div>
          <div className={`tc-tool-icon ${activeDrawingTool === 'priceLine' ? 'active' : ''}`} onClick={() => handleDrawingTool('priceLine')} title="Price Line">
            <i className="fas fa-minus"></i>
          </div>
        </div>

        {/* Chart Container */}
        <div className="tc-chart-container">
          {/* Legend Overlay */}
          <div className="tc-legend-overlay">
            <div className="tc-legend-top">
              <span className="tc-legend-title">{symbol}</span>
              <span style={{ color: '#9CA3AF' }}>•</span>
              <span className="tc-legend-tf">{timeframe.replace('m', '').replace('day', 'D')}</span>
              <span style={{ color: '#9CA3AF' }}>•</span>
              <span className="tc-legend-exchange">{displayExchange}</span>
              <span className="tc-legend-status"></span>
            </div>
            {currentPrice > 0 && (
              <div className="tc-legend-bottom">
                <span className={`tc-legend-price ${isUp ? 'up' : 'down'}`}>
                  {currentPrice.toFixed(2)}
                </span>
                <span className={`tc-legend-price ${isUp ? 'up' : 'down'}`} style={{ fontSize: '0.8rem', marginLeft: '2px' }}>
                  {isUp ? '+' : ''}{priceChange.toFixed(2)} ({isUp ? '+' : ''}{priceChangePct.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>

          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', zIndex: 10 }}>
              <i className="fas fa-circle-notch fa-spin" style={{ color: '#2962FF', fontSize: '1.5rem' }}></i>
            </div>
          )}
          {error && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '20px', textAlign: 'center' }}>
              <i className="fas fa-exclamation-triangle" style={{ color: '#F23645', fontSize: '2rem', marginBottom: '10px' }}></i>
              <div style={{ color: '#F23645', fontSize: '0.8rem', fontWeight: 600 }}>{error}</div>
            </div>
          )}
          <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
        </div>
      </div>
    </div>
  );
}
