'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CandlestickSeries, IChartApi, ISeriesApi, Time, CandlestickData } from 'lightweight-charts';

interface TradingChartProps {
  symbol: string;         // e.g., "BTCUSDT" or "NSE:INFY"
  segment: string;        // e.g., "CRYPTO" or "EQ"
  liveQuote?: any;        // Live quote object to update the last candle
}

type Timeframe = '1m' | '5m' | '15m' | '60m' | 'day';

export default function TradingChart({ symbol, segment, liveQuote }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const isCrypto = segment.toUpperCase() === 'CRYPTO' || symbol.endsWith('USDT');

  // Convert timeframe to Binance or Kite interval string
  const getIntervalString = () => {
    if (isCrypto) {
      // Binance intervals
      switch (timeframe) {
        case '1m': return '1m';
        case '5m': return '5m';
        case '15m': return '15m';
        case '60m': return '1h';
        case 'day': return '1d';
        default: return '5m';
      }
    } else {
      // Kite intervals
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

    // Create Chart Instance
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(243, 244, 246, 0.05)' },
        horzLines: { color: 'rgba(243, 244, 246, 0.05)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderVisible: false,
      },
      rightPriceScale: {
        borderVisible: false,
      },
      crosshair: {
        mode: 1, // Normal crosshair
        vertLine: {
          width: 1,
          color: 'rgba(255, 255, 255, 0.4)',
          style: 3,
        },
        horzLine: {
          width: 1,
          color: 'rgba(255, 255, 255, 0.4)',
          style: 3,
        },
      },
    });

    chartRef.current = chart;

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10B981',
      downColor: '#EF4444',
      borderVisible: false,
      wickUpColor: '#10B981',
      wickDownColor: '#EF4444',
    });

    candlestickSeriesRef.current = candlestickSeries;

    const resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || entries[0].target !== chartContainerRef.current) return;
      const newRect = entries[0].contentRect;
      chart.applyOptions({ width: newRect.width, height: newRect.height });
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // Fetch Historical Data
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        let data: CandlestickData[] = [];

        if (isCrypto) {
          // Fetch from Binance
          const interval = getIntervalString();
          const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`);
          const json = await res.json();
          if (!Array.isArray(json)) throw new Error(json.msg || 'Failed to fetch');
          data = json.map((k: any) => ({
            time: (k[0] / 1000) as Time,
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
          }));
        } else {
          // Fetch from our Kite wrapper API
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
              // Lightweight charts expects Unix timestamp in seconds for intraday
              // and standard YYYY-MM-DD string for D timeframe. For simplicity we pass timestamp in seconds.
              const timeOffset = dt.getTimezoneOffset() * 60; // offset in seconds
              return {
                time: (dt.getTime() / 1000 - timeOffset) as Time,
                open: c[1],
                high: c[2],
                low: c[3],
                close: c[4],
              };
            });
          } else {
            throw new Error(json.error || 'Failed to load historical data');
          }
        }

        if (isMounted && candlestickSeriesRef.current) {
          // Remove duplicates and sort
          const uniqueData = Array.from(new Map(data.map(item => [item.time, item])).values());
          uniqueData.sort((a, b) => (a.time as number) - (b.time as number));
          
          candlestickSeriesRef.current.setData(uniqueData);
          setLoading(false);
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
    if (!liveQuote || !candlestickSeriesRef.current || loading) return;
    
    // We update the last candle or create a new one based on timestamp.
    // For simplicity, we'll just forcefully update the current live price.
    // Note: To properly form candles, we need a time boundary check. 
    // This is a basic implementation that updates the last price.
    const currentTime = Math.floor(Date.now() / 1000);
    // Align current time to the nearest timeframe interval
    let intervalSeconds = 60;
    if (timeframe === '1m') intervalSeconds = 60;
    if (timeframe === '5m') intervalSeconds = 300;
    if (timeframe === '15m') intervalSeconds = 900;
    if (timeframe === '60m') intervalSeconds = 3600;
    if (timeframe === 'day') intervalSeconds = 86400;

    const alignedTime = (Math.floor(currentTime / intervalSeconds) * intervalSeconds) as Time;

    try {
      const data = candlestickSeriesRef.current.data();
      const lastCandle: any = data.length > 0 ? data[data.length - 1] : null;

      const lastPrice = liveQuote.lastPrice || liveQuote.last_price;
      if (!lastPrice) return;

      if (lastCandle && lastCandle.time === alignedTime) {
        candlestickSeriesRef.current.update({
          time: alignedTime,
          open: lastCandle.open,
          high: Math.max(lastCandle.high, lastPrice),
          low: Math.min(lastCandle.low, lastPrice),
          close: lastPrice,
        });
      } else {
        candlestickSeriesRef.current.update({
          time: alignedTime,
          open: lastCandle ? lastCandle.close : lastPrice,
          high: lastPrice,
          low: lastPrice,
          close: lastPrice,
        });
      }
    } catch (e) {
      // Data might not be set yet
    }
  }, [liveQuote, timeframe, loading]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* Chart Header / Timeframes */}
      <div style={{ display: 'flex', padding: '10px 14px', gap: '8px', borderBottom: '1px solid var(--border-light)', overflowX: 'auto', flexShrink: 0 }}>
        {(['1m', '5m', '15m', '60m', 'day'] as Timeframe[]).map(tf => (
          <button
            key={tf}
            onClick={() => setTimeframe(tf)}
            style={{
              background: timeframe === tf ? 'rgba(44, 142, 90, 0.1)' : 'transparent',
              color: timeframe === tf ? '#2C8E5A' : 'var(--text-secondary)',
              border: timeframe === tf ? '1px solid rgba(44, 142, 90, 0.5)' : '1px solid transparent',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '0.75rem',
              fontWeight: 700,
              cursor: 'pointer',
              textTransform: 'uppercase'
            }}
          >
            {tf}
          </button>
        ))}
      </div>
      
      {/* Chart Container */}
      <div style={{ flex: 1, position: 'relative', minHeight: '300px' }}>
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.02)', zIndex: 10 }}>
            <i className="fas fa-circle-notch fa-spin" style={{ color: '#2C8E5A', fontSize: '1.5rem' }}></i>
          </div>
        )}
        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.02)', zIndex: 10, padding: '20px', textAlign: 'center' }}>
            <i className="fas fa-exclamation-triangle" style={{ color: '#DC2626', fontSize: '2rem', marginBottom: '10px' }}></i>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>{error}</div>
          </div>
        )}
        <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
