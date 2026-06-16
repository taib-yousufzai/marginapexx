'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { init, dispose, Chart, KLineData, LineType, TooltipShowRule } from 'klinecharts';
import { useMyOrders } from '@/hooks/useMyOrders';
import { useMyPositions, EnrichedPosition } from '@/hooks/useMyPositions';
import { useOrderEntry } from '@/hooks/useOrderEntry';
import './trading-chart.css';

interface TradingChartProps {
  symbol: string;         // e.g., "BTCUSDT" or "NSE:INFY"
  segment: string;        // e.g., "CRYPTO" or "EQ"
  liveQuote?: any;        // Live quote object to update the last candle
}

type Timeframe = '1m' | '5m' | '15m' | '60m' | 'day';

function getLotSize(name: string): number {
  const n = name.toUpperCase();
  if (n.includes('BANKNIFTY') || n.includes('BANKEX')) return 15;
  if (n.includes('FINNIFTY')) return 40;
  if (n.includes('MIDCP') || n.includes('MIDCAP')) return 75;
  if (n.includes('SENSEX')) return 10;
  if (n.includes('NIFTY')) return 25;
  if (n.includes('GOLDM')) return 10;
  if (n.includes('GOLD')) return 100;
  if (n.includes('SILVERM')) return 5;
  if (n.includes('SILVER')) return 30;
  if (n.includes('CRUDEOIL')) return 100;
  if (n.includes('NATURALGAS')) return 1250;
  return 1;
}

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

  // --- Real Data Hooks ---
  const { orders, cancelOrder, refresh: refreshOrders } = useMyOrders();
  const { positions, refresh: refreshPositions } = useMyPositions();
  const { placeOrder, closePosition } = useOrderEntry();

  // --- Dashboard States ---
  const [isOrderBlockVisible, setIsOrderBlockVisible] = useState<boolean>(false);
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [qtyValue, setQtyValue] = useState<number>(100);
  const [useLots, setUseLots] = useState<boolean>(false);
  const [orderCarry, setOrderCarry] = useState<'normal' | 'carry'>('normal');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [activeSegment, setActiveSegment] = useState<'chain' | 'orders' | 'positions'>('orders');
  const [isPanelExpanded, setIsPanelExpanded] = useState<boolean>(false);
  const [balance, setBalance] = useState<number>(50000);
  const [toast, setToast] = useState<{ visible: boolean; msg: string; isError?: boolean }>({ visible: false, msg: '' });

  // Get lot size of instrument
  const lotSize = useMemo(() => getLotSize(symbol), [symbol]);

  // Toast helper
  const showToast = (msg: string, isError = false) => {
    setToast({ visible: true, msg, isError });
    setTimeout(() => setToast({ visible: false, msg: '' }), 2000);
  };

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

  // Get user's actual funds balance
  useEffect(() => {
    fetch('/api/pay/balance')
      .then(res => res.json())
      .then(data => {
        if (typeof data.balance === 'number') {
          setBalance(data.balance);
        }
      })
      .catch(() => {});
  }, []);

  // Initialize/Dispose Klinecharts
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const isDarkMode = document.body.classList.contains('dark') || document.body.classList.contains('black');
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
            setLimitPrice(last.close.toFixed(2));
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
      if (limitPrice === '') setLimitPrice(lastPrice.toFixed(2));
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

  // Drawing Tools Click handler
  const handleDrawingTool = (toolName: string) => {
    if (!chartRef.current) return;
    
    if (activeDrawingTool === toolName) {
      setActiveDrawingTool(null);
    } else {
      setActiveDrawingTool(toolName);
      chartRef.current.createOverlay({
        name: toolName,
        id: `overlay_${Date.now()}`,
        onDrawEnd: (event: any) => {
          if (toolName === 'simpleAnnotation') {
            const text = window.prompt('Enter your text annotation:');
            if (text) {
              chartRef.current?.overrideOverlay({ id: event.overlay.id, name: toolName, extendData: text });
            } else {
              chartRef.current?.removeOverlay({ id: event.overlay.id });
            }
          }
          setActiveDrawingTool(null);
          return true;
        }
      });
    }
  };

  // Stepper for quantity
  const handleQtyStep = (delta: number) => {
    setQtyValue(prev => Math.max(useLots ? 1 : lotSize, prev + delta * (useLots ? 1 : lotSize)));
  };

  // Toggle Lots vs Qty
  const handleUnitChange = (lotsActive: boolean) => {
    setUseLots(lotsActive);
    setQtyValue(prev => {
      if (lotsActive) {
        return Math.max(1, Math.floor(prev / lotSize));
      } else {
        return prev * lotSize;
      }
    });
  };

  // Place actual order
  const handleSubmitOrder = async () => {
    const finalQty = useLots ? qtyValue * lotSize : qtyValue;
    const finalPrice = orderType === 'limit' ? parseFloat(limitPrice) : currentPrice;
    
    if (orderType === 'limit' && (isNaN(finalPrice) || finalPrice <= 0)) {
      showToast('Please enter a valid limit price', true);
      return;
    }

    const reqMargin = Math.ceil(finalPrice * finalQty * 0.12);
    if (reqMargin > balance) {
      showToast('Insufficient margin', true);
      return;
    }

    showToast('Placing order...');
    const res = await placeOrder({
      symbol: symbol,
      kite_instrument: symbol,
      segment: segment,
      side: orderSide,
      qty: finalQty,
      lots: useLots ? qtyValue : 0,
      order_type: orderType.toUpperCase() as any,
      product_type: orderCarry === 'carry' ? 'CARRY' : 'INTRADAY',
      client_price: finalPrice,
      is_exit: false
    });

    if (res.success) {
      showToast(`${orderSide} Order Placed Successfully!`);
      setIsOrderBlockVisible(false);
      refreshOrders();
      refreshPositions();
    } else {
      showToast(res.error || 'Failed to place order', true);
    }
  };

  // Cancel actual order
  const handleCancelOrder = async (id: string) => {
    showToast('Cancelling order...');
    const res = await cancelOrder(id);
    if (res.success) {
      showToast('Order cancelled');
      refreshOrders();
    } else {
      showToast(res.error || 'Cancel failed', true);
    }
  };

  // Exit actual position
  const handleExitPosition = async (id: string) => {
    showToast('Exiting position...');
    const res = await closePosition(id);
    if (res.success) {
      showToast('Position closed');
      refreshPositions();
    } else {
      showToast(res.error || 'Exit failed', true);
    }
  };

  // Add more to current position
  const handleAddMorePosition = (pos: EnrichedPosition) => {
    setOrderSide(pos.side);
    setQtyValue(pos.qty_open);
    setUseLots(false);
    setOrderCarry(pos.product_type === 'CARRY' ? 'carry' : 'normal');
    setIsOrderBlockVisible(true);
  };

  // Total Real-time P&L for this symbol positions
  const currentSymbolPositions = positions.filter(p => p.symbol.toUpperCase() === symbol.toUpperCase() && (p.status === 'open' || p.status === 'active'));
  const pnlTotal = currentSymbolPositions.reduce((acc, pos) => {
    const entryPrice = pos.avg_price || pos.entry_price;
    const pnl = pos.side === 'BUY'
      ? (currentPrice - entryPrice) * pos.qty_open
      : (entryPrice - currentPrice) * pos.qty_open;
    return acc + pnl;
  }, 0);

  // Calculated Required Margin for current order block state
  const orderQty = useLots ? qtyValue * lotSize : qtyValue;
  const executionPrice = orderType === 'limit' ? (parseFloat(limitPrice) || currentPrice) : currentPrice;
  const reqMargin = Math.ceil(executionPrice * orderQty * 0.12);

  // Render collapsible panel tabs content
  const renderPanelContent = () => {
    if (activeSegment === 'chain') {
      const isIndex = symbol.includes('NIFTY') || symbol.includes('BANKNIFTY');
      if (!isIndex) {
        return <div className="empty-state">Option Chain not available for this segment.</div>;
      }
      const s = currentPrice || 71.00;
      return (
        <>
          <div className="chain-row"><span>{symbol} 46,600 CE</span><span style={{color:'#888'}}>IV 22.1%</span><span>₹{(s+0.8).toFixed(1)}</span></div>
          <div className="chain-row"><span>{symbol} 46,500 CE</span><span style={{color:'#888'}}>IV 21.6%</span><span>₹{(s+3.8).toFixed(1)}</span></div>
          <div className="chain-row"><span>{symbol} 46,700 CE</span><span style={{color:'#888'}}>IV 23.3%</span><span>₹{Math.max(1.2, s-2.6).toFixed(1)}</span></div>
          <div className="chain-row"><span>{symbol} 46,600 PE</span><span style={{color:'#888'}}>IV 24.7%</span><span>₹{Math.max(1.2, 7.5 - (s-70)*0.5).toFixed(1)}</span></div>
        </>
      );
    }
    
    if (activeSegment === 'orders') {
      const symbolOrders = orders.filter(o => o.symbol.toUpperCase() === symbol.toUpperCase());
      if (symbolOrders.length === 0) {
        return <div className="empty-state">No orders yet for {symbol}.</div>;
      }
      return symbolOrders.map(o => (
        <div key={o.id} className="order-row">
          <span style={{ color: o.side === 'BUY' ? '#1db954' : '#e53935', fontWeight: 800, fontSize: '10px' }}>{o.side}</span>
          <span>{o.qty} Qty</span>
          <span style={{ fontWeight: 600 }}>₹{(o.client_price ?? 0).toFixed(2)}</span>
          <span style={{ fontSize: '10px', background: '#f3f3f3', padding: '2px 7px', borderRadius: '20px', color: '#888' }}>{o.status}</span>
          {o.status === 'PENDING' && (
            <button className="cancel-order-btn" onClick={() => handleCancelOrder(o.id)}>Cancel</button>
          )}
        </div>
      ));
    }
    
    // Positions
    if (currentSymbolPositions.length === 0) {
      return <div className="empty-state">No active positions for {symbol}.</div>;
    }
    return currentSymbolPositions.map((pos) => {
      const entryPrice = pos.avg_price || pos.entry_price;
      const pnl = pos.side === 'BUY'
        ? (currentPrice - entryPrice) * pos.qty_open
        : (entryPrice - currentPrice) * pos.qty_open;
      const c = pnl >= 0 ? '#1db954' : '#e53935';
      return (
        <div key={pos.id} className="position-row">
          <div className="position-info-row">
            <div>
              <span style={{ fontWeight: 800, color: pos.side === 'BUY' ? '#1db954' : '#e53935', fontSize: '10px' }}>{pos.side}</span>
              <span style={{ color: '#555' }}> {pos.qty_open} Qty</span>
            </div>
            <div style={{ color: '#888', fontSize: '11px' }}>Entry ₹{entryPrice.toFixed(2)}</div>
            <div style={{ color: c, fontWeight: 700 }}>{pnl >= 0 ? '+' : '-'}₹{Math.abs(pnl).toFixed(0)}</div>
          </div>
          <div className="position-actions">
            <button className="position-action-btn add-position-btn" onClick={() => handleAddMorePosition(pos)}>+ Add</button>
            <button className="position-action-btn exit-position-btn" onClick={() => handleExitPosition(pos.id)}>Exit</button>
          </div>
        </div>
      );
    });
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
      </div>
      
      {/* Main Area */}
      <div className="tc-main-area">
        {/* Left Toolbar */}
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
                  ₹{currentPrice.toFixed(2)}
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

      {/* P&L Card — hide when order block or panel is expanded */}
      {!isOrderBlockVisible && !isPanelExpanded && (
        <div className="pnl-card" id="pnlCard">
          <div>
            <span className="pnl-text">P/L: </span>
            <span className={`pnl-amount ${pnlTotal >= 0 ? 'positive' : 'negative'}`}>
              {pnlTotal >= 0 ? '+' : ''}₹{pnlTotal.toFixed(2)}
            </span>
          </div>
          <div className="pnl-toggle-btn" onClick={() => setIsPanelExpanded(true)}>
            <i className="ti ti-chevron-up"></i>
          </div>
        </div>
      )}

      {/* Bottom Section */}
      <div className="bottom-section" id="bottomSection">
        {/* Buy/Sell Buttons — always visible, act as quick order when panel is expanded */}
        {!isOrderBlockVisible && (
          <div className="trade-buttons" id="tradeButtons">
            <button className="trade-btn buy" onClick={() => { setIsPanelExpanded(false); setIsOrderBlockVisible(true); setOrderSide('BUY'); }}>
              <span className="btn-label">BUY</span>
            </button>
            <button className="trade-btn sell" onClick={() => { setIsPanelExpanded(false); setIsOrderBlockVisible(true); setOrderSide('SELL'); }}>
              <span className="btn-label">SELL</span>
            </button>
          </div>
        )}

        {/* Order Block */}
        {isOrderBlockVisible && (
          <div className="order-block visible" id="orderBlock">
            <div className="order-block-header">
              <span className="order-block-title">{symbol}</span>
              <div className="close-order-block" onClick={() => setIsOrderBlockVisible(false)}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <div className="order-block-content">
              <div className="top-row">
                <div className="quantity-box">
                  <div className="qty-controls">
                    <button className="qty-btn" onClick={() => handleQtyStep(-1)}>−</button>
                    <input
                      type="number"
                      className="qty-value"
                      value={qtyValue}
                      onChange={(e) => setQtyValue(Math.max(1, parseInt(e.target.value) || 1))}
                    />
                    <button className="qty-btn" onClick={() => handleQtyStep(1)}>+</button>
                  </div>
                  <div className="unit-toggle" id="unitSwitch">
                    <div className={`unit-btn ${!useLots ? 'active' : ''}`} onClick={() => handleUnitChange(false)}>Qty</div>
                    <div className={`unit-btn ${useLots ? 'active' : ''}`} onClick={() => handleUnitChange(true)}>Lot</div>
                  </div>
                </div>
                <div className="carry-box" id="carryGroup">
                  <div className={`carry-option ${orderCarry === 'normal' ? 'active' : ''}`} onClick={() => setOrderCarry('normal')}>Normal</div>
                  <div className={`carry-option ${orderCarry === 'carry' ? 'active' : ''}`} onClick={() => setOrderCarry('carry')}>Carry</div>
                </div>
              </div>
              
              <div className="bottom-row">
                <div className="market-limit-box" id="orderTypeGroup">
                  <div className={`market-option ${orderType === 'market' ? 'active' : ''}`} onClick={() => setOrderType('market')}>Mkt</div>
                  <div className={`market-option ${orderType === 'limit' ? 'active' : ''}`} onClick={() => setOrderType('limit')}>Lmt</div>
                </div>
                {orderType === 'limit' && (
                  <div className="limit-price-box visible" id="limitPriceBox">
                    <span className="price-symbol">₹</span>
                    <input
                      type="number"
                      step="0.05"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      placeholder="price"
                    />
                  </div>
                )}
              </div>

              <div className="order-margin-simple">
                <div className="margin-line">
                  <span className="margin-line-label">Free Margin:</span>
                  <span className="margin-line-value">₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="margin-line">
                  <span className="margin-line-label">Required Margin:</span>
                  <span className={`margin-line-value ${reqMargin > balance ? 'negative' : ''}`}>
                    ₹{reqMargin.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <button
                className={`submit-btn ${orderSide === 'BUY' ? 'submit-buy' : 'submit-sell'}`}
                onClick={handleSubmitOrder}
              >
                {orderSide} {useLots ? `${qtyValue} Lot` : `${qtyValue} Qty`}
              </button>
            </div>
          </div>
        )}

        {/* Segment Row */}
        <div className="segment-row">
          <div className="segment-pills">
            <button className={`segment-pill ${activeSegment === 'chain' ? 'active' : ''}`} onClick={() => {
              if (activeSegment === 'chain' && isPanelExpanded) { setIsPanelExpanded(false); }
              else { setActiveSegment('chain'); setIsPanelExpanded(true); setIsOrderBlockVisible(false); }
            }}>
              <i className="ti ti-stack-2"></i>Chain
            </button>
            <button className={`segment-pill ${activeSegment === 'orders' ? 'active' : ''}`} onClick={() => {
              if (activeSegment === 'orders' && isPanelExpanded) { setIsPanelExpanded(false); }
              else { setActiveSegment('orders'); setIsPanelExpanded(true); setIsOrderBlockVisible(false); }
            }}>
              <i className="ti ti-list-check"></i>Orders
            </button>
            <button className={`segment-pill ${activeSegment === 'positions' ? 'active' : ''}`} onClick={() => {
              if (activeSegment === 'positions' && isPanelExpanded) { setIsPanelExpanded(false); }
              else { setActiveSegment('positions'); setIsPanelExpanded(true); setIsOrderBlockVisible(false); }
            }}>
              <i className="ti ti-briefcase"></i>Positions
            </button>
          </div>
          <div className="toggle-panel-btn" onClick={() => {
            setIsPanelExpanded(!isPanelExpanded);
            if (!isPanelExpanded) setIsOrderBlockVisible(false);
          }}>
            <i className={`ti ${isPanelExpanded ? 'ti-chevron-down' : 'ti-chevron-up'}`}></i>
          </div>
        </div>

        {/* Info Panel */}
        <div className={`info-panel ${!isPanelExpanded ? 'collapsed' : ''}`} id="infoPanel">
          <div className="panel-header">
            {activeSegment === 'chain' ? 'Option Chain' : activeSegment === 'orders' ? 'Orders' : 'Positions'}
            <i className={`ti ${activeSegment === 'chain' ? 'ti-chart-candle' : activeSegment === 'orders' ? 'ti-list-check' : 'ti-briefcase'}`} style={{ color: '#aaa', fontSize: '13px' }}></i>
          </div>
          <div className="panel-content">
            {renderPanelContent()}
          </div>
        </div>
      </div>
      {toast.visible && (
        <div className={`toast-message toast-show ${toast.isError ? 'neg' : ''}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

