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
  const [chartType, setChartType] = useState<'candle' | 'area' | 'bar' | 'baseline'>('candle');
  const [openTopFlyout, setOpenTopFlyout] = useState<string | null>(null);
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
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'slm' | 'gtt' | 'sl'>('market');
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [triggerPrice, setTriggerPrice] = useState<string>('');
  const [gttSlPrice, setGttSlPrice] = useState<string>('');
  const [gttTargetPrice, setGttTargetPrice] = useState<string>('');
  const [chainContract, setChainContract] = useState<{ name: string; expiry: string; ltp: number; iv: number; bid: number; ask: number } | null>(null);
  const [activeSegment, setActiveSegment] = useState<'chain' | 'orders' | 'positions'>('orders');
  const [isPanelExpanded, setIsPanelExpanded] = useState<boolean>(false);
  const [isBottomSectionVisible, setIsBottomSectionVisible] = useState<boolean>(true);
  const [balance, setBalance] = useState<number>(50000);
  const [toast, setToast] = useState<{ visible: boolean; msg: string; isError?: boolean }>({ visible: false, msg: '' });

  // ── Strike data generator ──
  const getChainStrikes = () => {
    const s = currentPrice || 71.00;
    const atm = Math.round(s / 100) * 100; // nearest 100
    const strikes = [];
    for (let i = -4; i <= 4; i++) strikes.push(atm + i * 100);
    return strikes.map(strike => {
      const dist = s - strike;
      const ceIntrinsic = Math.max(0, dist);
      const ceTime = Math.max(0.5, 8 - Math.abs(dist) * 0.05);
      const ceLtp = parseFloat((ceIntrinsic + ceTime + Math.random() * 0.5).toFixed(1));
      const ceIV  = parseFloat((22 + Math.abs(dist) * 0.02 + Math.random()).toFixed(1));
      const ceOI  = Math.round((500 + Math.random() * 200) * (1 - Math.abs(dist)/500));
      
      const peIntrinsic = Math.max(0, -dist);
      const peTime = Math.max(0.5, 8 - Math.abs(dist) * 0.05);
      const peLtp = parseFloat((peIntrinsic + peTime + Math.random() * 0.5).toFixed(1));
      const peIV  = parseFloat((24 + Math.abs(dist) * 0.02 + Math.random()).toFixed(1));
      const peOI  = Math.round((450 + Math.random() * 200) * (1 - Math.abs(dist)/500));
      
      const isITM_CE = dist > 0;
      const isITM_PE = dist < 0;
      return { strike, ceLtp, ceIV, ceOI, peLtp, peIV, peOI, isITM_CE, isITM_PE };
    });
  };

  const openChainOrder = (defaultAction: 'BUY' | 'SELL', contractName: string, expiry: string, ltp: number, iv: number) => {
    setIsPanelExpanded(false);
    const bid = ltp;
    const ask = parseFloat((ltp + Math.max(0.05, ltp * 0.005)).toFixed(2));
    const contract = { name: contractName, expiry, ltp, iv, bid, ask };
    setChainContract(contract);
    setOrderSide(defaultAction);
    const displayPrice = defaultAction === 'BUY' ? ask : bid;
    setLimitPrice(displayPrice.toFixed(2));
    setTriggerPrice(displayPrice.toFixed(2));
    setGttSlPrice((displayPrice * 0.99).toFixed(2));
    setGttTargetPrice((displayPrice * 1.01).toFixed(2));
    setOrderType('market');
    setOrderCarry('normal');
    setUseLots(false);
    setQtyValue(100);
    setIsOrderBlockVisible(true);
  };

  // ── Advanced Drawing States & Toggles ──
  const [overlayIds, setOverlayIds] = useState<string[]>([]);
  const [isMagnetMode, setIsMagnetMode] = useState<boolean>(false);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [keepDrawingMode, setKeepDrawingMode] = useState<boolean>(false);
  const [hideDrawings, setHideDrawings] = useState<boolean>(false);
  const [openFlyout, setOpenFlyout] = useState<string | null>(null);
  // Maps each flyout group to its currently selected (last-used) tool
  const [groupSelected, setGroupSelected] = useState<Record<string, string>>({
    lines: 'segment',
    fibonacci: 'fibonacciRetracement',
    channels: 'parallelStraightLine',
    shapes: 'circle',
    annotation: 'simpleAnnotation',
    measure: 'priceRange',
  });

  const toggleLockDrawings = () => {
    const next = !isLocked;
    setIsLocked(next);
    overlayIds.forEach(id => {
      chartRef.current?.overrideOverlay({ id, lock: next });
    });
    showToast(next ? "Drawings locked" : "Drawings unlocked");
  };

  const toggleHideDrawings = () => {
    const next = !hideDrawings;
    setHideDrawings(next);
    overlayIds.forEach(id => {
      chartRef.current?.overrideOverlay({ id, visible: !next });
    });
    showToast(next ? "Drawings hidden" : "Drawings visible");
  };

  const clearAllDrawings = () => {
    chartRef.current?.removeOverlay();
    setOverlayIds([]);
    setActiveDrawingTool(null);
    showToast("All drawings cleared");
  };

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
      
      const newId = `overlay_${Date.now()}`;
      setOverlayIds(prev => [...prev, newId]);

      const onDrawEnd = (event: any) => {
        // 1. Magnet mode snapping to nearest candle OHL/C price
        if (isMagnetMode && event.overlay && event.overlay.points && chartRef.current) {
          const dataList = chartRef.current.getDataList();
          const snappedPoints = event.overlay.points.map((p: any) => {
            if (p.timestamp && dataList.length > 0) {
              let nearestCandle = dataList[0];
              let minDiff = Math.abs(dataList[0].timestamp - p.timestamp);
              for (let k = 1; k < dataList.length; k++) {
                const diff = Math.abs(dataList[k].timestamp - p.timestamp);
                if (diff < minDiff) {
                  minDiff = diff;
                  nearestCandle = dataList[k];
                }
              }
              const prices = [nearestCandle.open, nearestCandle.high, nearestCandle.low, nearestCandle.close];
              let snappedPrice = prices[0];
              let minPriceDiff = Math.abs(prices[0] - p.value);
              for (let j = 1; j < prices.length; j++) {
                const pDiff = Math.abs(prices[j] - p.value);
                if (pDiff < minPriceDiff) {
                  minPriceDiff = pDiff;
                  snappedPrice = prices[j];
                }
              }
              return { ...p, timestamp: nearestCandle.timestamp, value: snappedPrice };
            }
            return p;
          });
          chartRef.current.overrideOverlay({ id: event.overlay.id, name: toolName, points: snappedPoints });
        }

        // 2. Simple Annotation text prompt
        if (toolName === 'simpleAnnotation') {
          const text = window.prompt('Enter your text annotation:');
          if (text) {
            chartRef.current?.overrideOverlay({ id: event.overlay.id, name: toolName, extendData: text });
          } else {
            chartRef.current?.removeOverlay({ id: event.overlay.id });
          }
        }

        // 3. Keep drawing mode loop trigger
        if (keepDrawingMode) {
          setTimeout(() => {
            const nextId = `overlay_${Date.now()}`;
            setOverlayIds(prev => [...prev, nextId]);
            chartRef.current?.createOverlay({
              name: toolName,
              id: nextId,
              lock: isLocked,
              visible: !hideDrawings,
              onDrawEnd
            });
          }, 100);
        } else {
          setActiveDrawingTool(null);
        }
        return true;
      };

      chartRef.current.createOverlay({
        name: toolName === 'fibonacciLine' ? 'fibonacciRetracement' : toolName,
        id: newId,
        lock: isLocked,
        visible: !hideDrawings,
        onDrawEnd
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
    
    // Determine the base execution price
    let finalPrice = currentPrice;
    if (orderType === 'limit' || orderType === 'gtt') {
      finalPrice = parseFloat(limitPrice);
      if (isNaN(finalPrice) || finalPrice <= 0) {
        showToast('Please enter a valid price', true);
        return;
      }
    } else if (orderType === 'sl' || orderType === 'slm') {
      finalPrice = parseFloat(triggerPrice);
      if (isNaN(finalPrice) || finalPrice <= 0) {
        showToast('Please enter a valid trigger price', true);
        return;
      }
    }

    const reqMargin = Math.ceil(finalPrice * finalQty * 0.12);
    if (reqMargin > balance) {
      showToast('Insufficient margin', true);
      return;
    }

    // Determine target symbol and segment if trading option contracts
    let orderSymbol = symbol;
    let orderKiteInstrument = symbol;
    let orderSegment = segment;

    if (chainContract) {
      const underlying = symbol.toUpperCase().replace('_INDEX', '').replace('NSE:', '').replace('INDEX', '').trim();
      const expiry = chainContract.expiry.replace(' ', '').toUpperCase();
      const parts = chainContract.name.split(' ');
      const strike = parts[0];
      const optionType = parts[1]; // CE or PE
      
      orderSymbol = `${underlying}${expiry}${strike}${optionType}`;
      orderKiteInstrument = `NFO:${orderSymbol}`;
      orderSegment = 'INDEX-OPT';
    }

    showToast('Placing order...');
    const res = await placeOrder({
      symbol: orderSymbol,
      kite_instrument: orderKiteInstrument,
      segment: orderSegment,
      side: orderSide,
      qty: finalQty,
      lots: useLots ? qtyValue : 0,
      order_type: orderType.toUpperCase() as any,
      product_type: orderCarry === 'carry' ? 'CARRY' : 'INTRADAY',
      client_price: finalPrice,
      trigger_price: (orderType === 'sl' || orderType === 'slm') ? parseFloat(triggerPrice) : undefined,
      stop_loss: orderType === 'gtt' ? parseFloat(gttSlPrice) : undefined,
      target: orderType === 'gtt' ? parseFloat(gttTargetPrice) : undefined,
      is_exit: false
    });

    if (res.success) {
      showToast(`${orderSide} Order Placed Successfully!`);
      setIsOrderBlockVisible(false);
      setChainContract(null); // Clear option contract context after trade
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

  const handleQuickMarketOrder = async (side: 'BUY' | 'SELL') => {
    const qty = 100;
    const required = Math.ceil(currentPrice * qty * 0.12);
    if (required > balance) {
      showToast(`Insufficient margin! Need ₹${required.toLocaleString('en-IN')}`, true);
      return;
    }
    
    showToast(`Placing quick ${side} order...`);
    const res = await placeOrder({
      symbol: symbol,
      kite_instrument: symbol,
      segment: segment,
      side: side,
      qty: qty,
      lots: 0,
      order_type: 'MARKET',
      product_type: 'INTRADAY',
      client_price: currentPrice,
      is_exit: false
    });

    if (res.success) {
      showToast(`Quick ${side} Order Placed Successfully!`);
      // Flash the button
      const btn = document.getElementById(side === 'BUY' ? 'buyButton' : 'sellButton');
      if (btn) {
        btn.classList.remove('quick-flash');
        void btn.offsetWidth; // force reflow
        btn.classList.add('quick-flash');
      }
      refreshOrders();
      refreshPositions();
    } else {
      showToast(res.error || 'Failed to place quick order', true);
    }
  };

  const handleQuickAddPosition = async (pos: EnrichedPosition) => {
    const addQty = pos.qty_open;
    const required = Math.ceil(currentPrice * addQty * 0.12);
    if (required > balance) {
      showToast(`Insufficient margin! Need ₹${required.toLocaleString('en-IN')}`, true);
      return;
    }

    showToast(`Adding ${addQty} to ${pos.side} position...`);
    const res = await placeOrder({
      symbol: symbol,
      kite_instrument: symbol,
      segment: segment,
      side: pos.side,
      qty: addQty,
      lots: 0,
      order_type: 'MARKET',
      product_type: pos.product_type === 'CARRY' ? 'CARRY' : 'INTRADAY',
      client_price: currentPrice,
      is_exit: false
    });

    if (res.success) {
      showToast(`Successfully added ${addQty} to position!`);
      refreshOrders();
      refreshPositions();
    } else {
      showToast(res.error || 'Failed to add to position', true);
    }
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
      const strikes = getChainStrikes();
      const expiry = '23 JAN';
      const atm = Math.round((currentPrice || 71.00) / 100) * 100;
      return (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          <div className="chain-table-header">
            <span className="ch-ce">CALL</span>
            <span className="ch-strike">Strike</span>
            <span className="ch-pe">PUT</span>
          </div>
          {strikes.map(r => {
            const isAtm = r.strike === atm;
            return (
              <div key={r.strike} className={`chain-row${isAtm ? ' chain-atm' : ''}`}>
                <div
                  className={`chain-cell-ce ${r.isITM_CE ? 'chain-itm-ce' : ''} ${chainContract?.name === `${r.strike} CE` ? 'selected' : ''}`}
                  onClick={() => openChainOrder('BUY', `${r.strike} CE`, expiry, r.ceLtp, r.ceIV)}
                >
                  <div className="chain-top-row">
                    <span className="chain-ltp chain-ce-ltp">₹{r.ceLtp}</span>
                    <span className="chain-iv">{r.ceIV}%</span>
                  </div>
                  <span className="chain-oi">{r.ceOI}K OI</span>
                </div>
                <div className="chain-cell-strike">
                  <span>{r.strike}</span>
                  {isAtm && <span style={{ fontSize: '7px', color: '#1db954', fontWeight: 700, letterSpacing: '.3px' }}>ATM</span>}
                </div>
                <div
                  className={`chain-cell-pe ${r.isITM_PE ? 'chain-itm-pe' : ''} ${chainContract?.name === `${r.strike} PE` ? 'selected' : ''}`}
                  onClick={() => openChainOrder('BUY', `${r.strike} PE`, expiry, r.peLtp, r.peIV)}
                >
                  <div className="chain-top-row" style={{ justifyContent: 'flex-end' }}>
                    <span className="chain-iv">{r.peIV}%</span>
                    <span className="chain-ltp chain-pe-ltp">₹{r.peLtp}</span>
                  </div>
                  <span className="chain-oi">{r.peOI}K OI</span>
                </div>
              </div>
            );
          })}
        </div>
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
            <button className="position-action-btn add-position-btn" onClick={() => handleQuickAddPosition(pos)}>+ Add {pos.qty_open}</button>
            <button className="position-action-btn exit-position-btn" onClick={() => handleExitPosition(pos.id)}>Exit</button>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="tc-wrapper">
      {/* Top Toolbar */}
      <div className="tc-top-toolbar" onMouseLeave={() => setOpenTopFlyout(null)}>

        {/* ── Back button ── */}
        <button className="tc-icon-btn" style={{ marginRight: '-6px' }} onClick={() => {
          const sheet = document.getElementById('chartSheet');
          const overlay = document.getElementById('chartSheetOverlay');
          if (sheet) sheet.classList.remove('open');
          if (overlay) overlay.classList.remove('active');
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M10 3L5 8l5 5"/>
          </svg>
        </button>

        {/* ── Symbol ── */}
        <div className="tc-symbol-btn">
          <span className="tc-symbol-exchange">{displayExchange}</span>
          <span className="tc-symbol-name">{symbol.replace('NSE:', '').replace('BSE:', '')}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ opacity: 0.5 }}><path d="M2 3l3 4 3-4z"/></svg>
        </div>

        <div className="tc-divider"></div>

        {/* ── Interval flyout ── */}
        {(() => {
          const intervals: { label: string; tf: Timeframe }[] = [
            { label: '1m',  tf: '1m'  },
            { label: '5m',  tf: '5m'  },
            { label: '15m', tf: '15m' },
            { label: '1H',  tf: '60m' },
            { label: 'D',   tf: 'day' },
          ];
          const current = intervals.find(i => i.tf === timeframe) || intervals[1];
          return (
            <div style={{ position: 'relative' }}>
              <div
                className={`tc-tb-btn ${openTopFlyout === 'interval' ? 'tc-tb-btn-open' : ''}`}
                onMouseEnter={() => setOpenTopFlyout('interval')}
                onClick={() => setOpenTopFlyout(openTopFlyout === 'interval' ? null : 'interval')}
                title="Interval"
              >
                <span style={{ fontWeight: 700, fontSize: '13px' }}>{current.label}</span>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1 2l3 4 3-4z"/></svg>
              </div>
              {openTopFlyout === 'interval' && (
                <div className="tc-top-flyout" style={{ minWidth: '110px' }}>
                  <div className="tc-flyout-title">Interval</div>
                  {intervals.map(i => (
                    <div
                      key={i.tf}
                      className={`tc-flyout-item ${timeframe === i.tf ? 'active' : ''}`}
                      onClick={() => { setTimeframe(i.tf); setOpenTopFlyout(null); }}
                    >
                      <span>{i.label}</span>
                      {timeframe === i.tf && <span className="tc-flyout-check">✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Chart Type flyout ── */}
        {(() => {
          const types: { key: 'candle' | 'area' | 'bar' | 'baseline'; label: string; icon: React.ReactNode }[] = [
            { key: 'candle',   label: 'Candles',   icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="4" width="3" height="6" fill="currentColor"/><line x1="4.5" y1="1" x2="4.5" y2="4"/><line x1="4.5" y1="10" x2="4.5" y2="13"/><rect x="8" y="3" width="3" height="5" fill="none"/><line x1="9.5" y1="1" x2="9.5" y2="3"/><line x1="9.5" y1="8" x2="9.5" y2="13"/></svg> },
            { key: 'bar',      label: 'Bars',      icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="4" y1="2" x2="4" y2="12"/><line x1="1" y1="5" x2="4" y2="5"/><line x1="4" y1="9" x2="7" y2="9"/><line x1="10" y1="3" x2="10" y2="11"/><line x1="7" y1="6" x2="10" y2="6"/><line x1="10" y1="8" x2="13" y2="8"/></svg> },
            { key: 'area',     label: 'Area',      icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M1 11 Q4 4 7 6 Q10 8 13 3" /><path d="M1 11 Q4 4 7 6 Q10 8 13 3 V11 Z" fill="currentColor" opacity="0.2" stroke="none"/></svg> },
            { key: 'baseline', label: 'Baseline',  icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="1" y1="7" x2="13" y2="7" strokeDasharray="2 1"/><path d="M1 7 Q4 3 7 5 Q10 7 13 4" /><path d="M1 7 Q4 11 7 9 Q10 7 13 10" /></svg> },
          ];
          const cur = types.find(t => t.key === chartType) || types[0];
          return (
            <div style={{ position: 'relative' }}>
              <div
                className={`tc-tb-btn ${openTopFlyout === 'charttype' ? 'tc-tb-btn-open' : ''}`}
                onMouseEnter={() => setOpenTopFlyout('charttype')}
                onClick={() => setOpenTopFlyout(openTopFlyout === 'charttype' ? null : 'charttype')}
                title="Chart Type"
              >
                {cur.icon}
                <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor"><path d="M1 2l3 4 3-4z"/></svg>
              </div>
              {openTopFlyout === 'charttype' && (
                <div className="tc-top-flyout" style={{ minWidth: '140px' }}>
                  <div className="tc-flyout-title">Chart Type</div>
                  {types.map(t => (
                    <div
                      key={t.key}
                      className={`tc-flyout-item ${chartType === t.key ? 'active' : ''}`}
                      onClick={() => {
                        setChartType(t.key);
                        setOpenTopFlyout(null);
                        if (chartRef.current) {
                          chartRef.current.setStyles({
                            candle: { type: t.key === 'candle' ? 'candle_solid' : t.key === 'bar' ? 'ohlc' : t.key === 'area' ? 'area' : 'normal' } as any
                          });
                        }
                      }}
                    >
                      <span className="tc-flyout-icon">{t.icon}</span>
                      <span>{t.label}</span>
                      {chartType === t.key && <span className="tc-flyout-check">✓</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        <div className="tc-divider"></div>

        {/* ── Indicators ── */}
        <div
          className="tc-tb-btn tc-tb-indicators"
          title="Indicators"
          onClick={() => showToast('Indicators panel coming soon')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M1 10 L4 6 L7 8 L10 3 L13 5"/>
            <line x1="1" y1="12" x2="13" y2="12" strokeDasharray="2 1" opacity="0.5"/>
          </svg>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>Indicators</span>
        </div>

        {/* ── Compare ── */}
        <div
          className="tc-tb-btn"
          title="Compare Symbol"
          onClick={() => showToast('Compare mode coming soon')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M1 9 L5 5 L8 7 L13 2" />
            <path d="M1 12 L5 9 L8 11 L13 6" opacity="0.5"/>
          </svg>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>Compare</span>
        </div>

        {/* ── Right side ── */}
        <div className="tc-top-right">

          {/* Snapshot */}
          <div className="tc-tb-icon" title="Take Snapshot" onClick={() => showToast('Snapshot copied!')}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="1" y="3" width="13" height="10" rx="1.5"/>
              <circle cx="7.5" cy="8" r="2.5"/>
              <path d="M5 3l1-2h3l1 2" strokeLinejoin="round"/>
            </svg>
          </div>

          {/* Settings */}
          <div className="tc-tb-icon" title="Chart Settings" onClick={() => showToast('Settings coming soon')}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="7.5" cy="7.5" r="2"/>
              <path d="M7.5 1v2M7.5 12v2M1 7.5h2M12 7.5h2M3 3l1.4 1.4M10.6 10.6L12 12M12 3l-1.4 1.4M4.4 10.6L3 12"/>
            </svg>
          </div>

          {/* Fullscreen */}
          <div className="tc-tb-icon" title="Fullscreen" onClick={() => {
            const el = document.getElementById('chartSheet');
            if (el) el.requestFullscreen?.();
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9"/>
            </svg>
          </div>
        </div>
      </div>
      
      {/* Main Area */}
      <div className="tc-main-area">
        {/* Left Drawing Toolbar — TradingView Style */}
        <div
          className="tc-left-toolbar"
          style={{ width: '44px', borderRight: '1px solid #E8ECF0', padding: '6px 0', gap: '2px' }}
          onMouseLeave={() => setOpenFlyout(null)}
        >

          {/* ── Cursor / Pointer ── */}
          <div
            className={`tc-tool-icon ${!activeDrawingTool ? 'active' : ''}`}
            onClick={() => { setActiveDrawingTool(null); setOpenFlyout(null); }}
            title="Cursor"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M2 1l12 6-5.5 1.5L7 14z"/></svg>
          </div>

          <div className="tc-toolbar-sep" />

          {/* ── Lines Group ── */}
          {(() => {
            const lineTools = [
              { name: 'segment',               label: 'Trend Line',          icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="1" y1="14" x2="14" y2="1"/></svg> },
              { name: 'rayLine',               label: 'Ray',                 icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="1" y1="14" x2="14" y2="1"/><circle cx="14" cy="1" r="1.5" fill="currentColor"/></svg> },
              { name: 'straightLine',          label: 'Extended Line',       icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="0" y1="14" x2="15" y2="1"/></svg> },
              { name: 'horizontalStraightLine',label: 'Horizontal Line',     icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="0" y1="7" x2="15" y2="7"/></svg> },
              { name: 'horizontalRayLine',     label: 'Horizontal Ray',      icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="0" y1="7" x2="15" y2="7"/><circle cx="0" cy="7" r="1.5" fill="currentColor"/></svg> },
              { name: 'horizontalSegment',     label: 'Horizontal Segment',  icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="1" y1="7" x2="14" y2="7"/><circle cx="1" cy="7" r="1.5" fill="currentColor"/><circle cx="14" cy="7" r="1.5" fill="currentColor"/></svg> },
              { name: 'verticalStraightLine',  label: 'Vertical Line',       icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="7" y1="0" x2="7" y2="15"/></svg> },
              { name: 'priceLine',             label: 'Price Line',          icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="0" y1="7" x2="12" y2="7"/><rect x="12" y="4" width="3" height="6" rx="1" fill="currentColor" stroke="none"/></svg> },
            ];
            const sel = groupSelected.lines;
            const selTool = lineTools.find(t => t.name === sel) || lineTools[0];
            const isGroupActive = lineTools.some(t => activeDrawingTool === t.name);
            return (
              <div className="tc-flyout-group" style={{ position: 'relative' }}>
                <div
                  className={`tc-tool-icon tc-group-btn ${isGroupActive ? 'active' : ''}`}
                  title={selTool.label}
                  onClick={() => { handleDrawingTool(sel); setOpenFlyout(null); }}
                  onMouseEnter={() => setOpenFlyout('lines')}
                >
                  {selTool.icon}
                  <span className="tc-group-arrow">▸</span>
                </div>
                {openFlyout === 'lines' && (
                  <div className="tc-flyout">
                    <div className="tc-flyout-title">Lines</div>
                    {lineTools.map(t => (
                      <div
                        key={t.name}
                        className={`tc-flyout-item ${activeDrawingTool === t.name ? 'active' : ''}`}
                        onClick={() => { handleDrawingTool(t.name); setGroupSelected(g => ({ ...g, lines: t.name })); setOpenFlyout(null); }}
                      >
                        <span className="tc-flyout-icon">{t.icon}</span>
                        <span>{t.label}</span>
                        {activeDrawingTool === t.name && <span className="tc-flyout-check">✓</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Fibonacci Group ── */}
          {(() => {
            const fibTools = [
              { name: 'fibonacciRetracement', label: 'Fib Retracement',  icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="0" y1="2" x2="15" y2="2"/><line x1="0" y1="6" x2="15" y2="6"/><line x1="0" y1="9" x2="15" y2="9"/><line x1="0" y1="13" x2="15" y2="13"/><line x1="1" y1="2" x2="14" y2="13" strokeDasharray="2 1"/></svg> },
              { name: 'fibonacciExtension',  label: 'Fib Extension',    icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="0" y1="3" x2="15" y2="3"/><line x1="0" y1="7" x2="15" y2="7"/><line x1="0" y1="11" x2="15" y2="11"/><line x1="1" y1="14" x2="14" y2="1" strokeDasharray="2 1"/></svg> },
              { name: 'fibonacciSpeedResistanceFan', label: 'Fib Speed Resistance Fan', icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="1" y1="14" x2="14" y2="1"/><line x1="1" y1="14" x2="14" y2="5"/><line x1="1" y1="14" x2="14" y2="9"/></svg> },
              { name: 'fibonacciCircle',      label: 'Fib Arc',          icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M2 13 Q7 2 13 13"/><line x1="2" y1="13" x2="13" y2="13"/></svg> },
              { name: 'fibonacciSegment',     label: 'Fib Wedge',        icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.4"><line x1="1" y1="14" x2="14" y2="2"/><line x1="1" y1="14" x2="14" y2="7"/><line x1="1" y1="14" x2="14" y2="12"/></svg> },
            ];
            const sel = groupSelected.fibonacci;
            const selTool = fibTools.find(t => t.name === sel) || fibTools[0];
            const isGroupActive = fibTools.some(t => activeDrawingTool === t.name);
            return (
              <div className="tc-flyout-group" style={{ position: 'relative' }}>
                <div
                  className={`tc-tool-icon tc-group-btn ${isGroupActive ? 'active' : ''}`}
                  title={selTool.label}
                  onClick={() => { handleDrawingTool(sel); setOpenFlyout(null); }}
                  onMouseEnter={() => setOpenFlyout('fibonacci')}
                >
                  {selTool.icon}
                  <span className="tc-group-arrow">▸</span>
                </div>
                {openFlyout === 'fibonacci' && (
                  <div className="tc-flyout">
                    <div className="tc-flyout-title">Fibonacci</div>
                    {fibTools.map(t => (
                      <div
                        key={t.name}
                        className={`tc-flyout-item ${activeDrawingTool === t.name ? 'active' : ''}`}
                        onClick={() => { handleDrawingTool(t.name); setGroupSelected(g => ({ ...g, fibonacci: t.name })); setOpenFlyout(null); }}
                      >
                        <span className="tc-flyout-icon">{t.icon}</span>
                        <span>{t.label}</span>
                        {activeDrawingTool === t.name && <span className="tc-flyout-check">✓</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Channels Group ── */}
          {(() => {
            const channelTools = [
              { name: 'parallelStraightLine', label: 'Parallel Channel', icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6"><line x1="1" y1="12" x2="14" y2="4"/><line x1="1" y1="6" x2="14" y2="11" strokeDasharray="2 1"/></svg> },
              { name: 'priceChannelLine',     label: 'Price Channel',    icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6"><line x1="1" y1="3" x2="14" y2="3"/><line x1="1" y1="12" x2="14" y2="12"/><line x1="1" y1="7" x2="14" y2="7" strokeDasharray="2 1"/></svg> },
            ];
            const sel = groupSelected.channels;
            const selTool = channelTools.find(t => t.name === sel) || channelTools[0];
            const isGroupActive = channelTools.some(t => activeDrawingTool === t.name);
            return (
              <div className="tc-flyout-group" style={{ position: 'relative' }}>
                <div
                  className={`tc-tool-icon tc-group-btn ${isGroupActive ? 'active' : ''}`}
                  title={selTool.label}
                  onClick={() => { handleDrawingTool(sel); setOpenFlyout(null); }}
                  onMouseEnter={() => setOpenFlyout('channels')}
                >
                  {selTool.icon}
                  <span className="tc-group-arrow">▸</span>
                </div>
                {openFlyout === 'channels' && (
                  <div className="tc-flyout">
                    <div className="tc-flyout-title">Channels</div>
                    {channelTools.map(t => (
                      <div
                        key={t.name}
                        className={`tc-flyout-item ${activeDrawingTool === t.name ? 'active' : ''}`}
                        onClick={() => { handleDrawingTool(t.name); setGroupSelected(g => ({ ...g, channels: t.name })); setOpenFlyout(null); }}
                      >
                        <span className="tc-flyout-icon">{t.icon}</span>
                        <span>{t.label}</span>
                        {activeDrawingTool === t.name && <span className="tc-flyout-check">✓</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <div className="tc-toolbar-sep" />

          {/* ── Annotation Group ── */}
          {(() => {
            const annoTools = [
              { name: 'simpleAnnotation', label: 'Text Note',   icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor"><text x="1" y="13" fontSize="13" fontFamily="Georgia,serif" fontWeight="bold">T</text></svg> },
              { name: 'simpleTag',        label: 'Price Tag',   icon: <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="4" width="9" height="7" rx="1.5"/><line x1="10" y1="7" x2="14" y2="7"/></svg> },
            ];
            const sel = groupSelected.annotation;
            const selTool = annoTools.find(t => t.name === sel) || annoTools[0];
            const isGroupActive = annoTools.some(t => activeDrawingTool === t.name);
            return (
              <div className="tc-flyout-group" style={{ position: 'relative' }}>
                <div
                  className={`tc-tool-icon tc-group-btn ${isGroupActive ? 'active' : ''}`}
                  title={selTool.label}
                  onClick={() => { handleDrawingTool(sel); setOpenFlyout(null); }}
                  onMouseEnter={() => setOpenFlyout('annotation')}
                >
                  {selTool.icon}
                  <span className="tc-group-arrow">▸</span>
                </div>
                {openFlyout === 'annotation' && (
                  <div className="tc-flyout">
                    <div className="tc-flyout-title">Annotations</div>
                    {annoTools.map(t => (
                      <div
                        key={t.name}
                        className={`tc-flyout-item ${activeDrawingTool === t.name ? 'active' : ''}`}
                        onClick={() => { handleDrawingTool(t.name); setGroupSelected(g => ({ ...g, annotation: t.name })); setOpenFlyout(null); }}
                      >
                        <span className="tc-flyout-icon">{t.icon}</span>
                        <span>{t.label}</span>
                        {activeDrawingTool === t.name && <span className="tc-flyout-check">✓</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Measure Tool ── */}
          <div
            className={`tc-tool-icon ${activeDrawingTool === 'priceRange' ? 'active' : ''}`}
            onClick={() => handleDrawingTool('priceRange')}
            title="Measure (Price & Bars)"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.6">
              <line x1="1" y1="3" x2="1" y2="12"/>
              <line x1="14" y1="3" x2="14" y2="12"/>
              <line x1="1" y1="7.5" x2="14" y2="7.5"/>
            </svg>
          </div>

          {/* ── Brush / Freehand ── */}
          <div
            className={`tc-tool-icon ${activeDrawingTool === 'brush' ? 'active' : ''}`}
            onClick={() => handleDrawingTool('brush')}
            title="Brush (Freehand)"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor"><path d="M10.5 1.5a2.1 2.1 0 0 1 3 3L5 13l-4 1 1-4z"/></svg>
          </div>

          <div className="tc-toolbar-sep" />

          {/* ── Magnet ── */}
          <div
            className={`tc-tool-icon ${isMagnetMode ? 'active-magnet' : ''}`}
            onClick={() => { setIsMagnetMode(!isMagnetMode); showToast(!isMagnetMode ? 'Magnet snap on' : 'Magnet snap off'); }}
            title="Magnet Snap"
            style={isMagnetMode ? { color: '#089981', backgroundColor: 'rgba(8,153,129,0.12)' } : {}}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor"><path d="M7.5 1a6.5 6.5 0 1 0 0 13A6.5 6.5 0 0 0 7.5 1zm0 2a4.5 4.5 0 0 1 4.5 4.5H10a2.5 2.5 0 0 0-5 0H3A4.5 4.5 0 0 1 7.5 3z"/></svg>
          </div>

          {/* ── Lock ── */}
          <div
            className={`tc-tool-icon ${isLocked ? 'active-locked' : ''}`}
            onClick={toggleLockDrawings}
            title="Lock Drawings"
            style={isLocked ? { color: '#e53935', backgroundColor: 'rgba(229,57,53,0.1)' } : {}}
          >
            {isLocked
              ? <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="6" width="10" height="7" rx="1.5"/><path d="M4 6V4a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
              : <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><rect x="2" y="6" width="10" height="7" rx="1.5"/><path d="M4 6V4a3 3 0 0 1 6 0" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>
            }
          </div>

          {/* ── Stay in drawing mode ── */}
          <div
            className={`tc-tool-icon ${keepDrawingMode ? 'active-keep' : ''}`}
            onClick={() => { setKeepDrawingMode(!keepDrawingMode); showToast(!keepDrawingMode ? 'Keep drawing on' : 'Keep drawing off'); }}
            title="Stay in Drawing Mode"
            style={keepDrawingMode ? { color: '#2962FF', backgroundColor: 'rgba(41,98,255,0.1)' } : {}}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M11 1a1 1 0 0 1 1.4 1.4L4.8 10H3v-1.8z"/><line x1="1" y1="13" x2="13" y2="13" stroke="currentColor" strokeWidth="1.5"/></svg>
          </div>

          {/* ── Hide/Show ── */}
          <div
            className={`tc-tool-icon ${hideDrawings ? 'active-hide' : ''}`}
            onClick={toggleHideDrawings}
            title="Hide Drawings"
            style={hideDrawings ? { color: '#e53935', backgroundColor: 'rgba(229,57,53,0.1)' } : {}}
          >
            {hideDrawings
              ? <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="2" x2="13" y2="13"/><path d="M5.5 5.5A3 3 0 0 0 9.5 9.5M3 4C1.7 5.3 1 6.5 1 7.5c0 2 3 5 6.5 5M12 11C13.3 9.7 14 8.5 14 7.5c0-2-3-5-6.5-5"/></svg>
              : <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M1 7.5c0-2 3-5 6.5-5s6.5 3 6.5 5-3 5-6.5 5S1 9.5 1 7.5z"/><circle cx="7.5" cy="7.5" r="2"/></svg>
            }
          </div>

          {/* ── Delete All ── */}
          <div
            className="tc-tool-icon"
            onClick={clearAllDrawings}
            title="Remove All Drawings"
            style={{ color: '#e53935' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><path d="M5 1h4l1 1h3v1.5H1V2h3zM2.5 4h9l-.8 8H3.3z"/></svg>
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
          <div className="pnl-toggle-btn" onClick={() => setIsBottomSectionVisible(!isBottomSectionVisible)}>
            <i className={`ti ${isBottomSectionVisible ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
          </div>
        </div>
      )}

      {/* Bottom Section */}
      <div className={`bottom-section ${!isBottomSectionVisible ? 'collapsed' : ''}`} id="bottomSection">
        {/* Buy/Sell Buttons — always visible, act as quick order when panel is expanded */}
        {!isOrderBlockVisible && (!isPanelExpanded || activeSegment === 'chain') && (
          <div className="trade-buttons" id="tradeButtons">
            <button id="buyButton" className="trade-btn buy" onClick={() => {
              if (isPanelExpanded && activeSegment === 'chain') {
                handleQuickMarketOrder('BUY');
              } else {
                setIsPanelExpanded(false);
                setIsOrderBlockVisible(true);
                setOrderSide('BUY');
              }
            }}>
              <span className="btn-label">BUY</span>
            </button>
            <button id="sellButton" className="trade-btn sell" onClick={() => {
              if (isPanelExpanded && activeSegment === 'chain') {
                handleQuickMarketOrder('SELL');
              } else {
                setIsPanelExpanded(false);
                setIsOrderBlockVisible(true);
                setOrderSide('SELL');
              }
            }}>
              <span className="btn-label">SELL</span>
            </button>
          </div>
        )}

        {/* Order Block */}
        {isOrderBlockVisible && (
          <div className="order-block visible" id="orderBlock">
            <div className="order-block-header">
              <span className="order-block-title">
                {chainContract ? `${symbol} ${chainContract.name}` : symbol}
              </span>
              <div className="close-order-block" onClick={() => { setIsOrderBlockVisible(false); setChainContract(null); }}>
                <i className="ti ti-x"></i>
              </div>
            </div>
            <div className="order-block-content">
              {chainContract && (
                <div id="chainBSToggle" style={{ display: 'flex', gap: '6px', padding: '0 0 8px' }}>
                  <button
                    onClick={() => {
                      setOrderSide('BUY');
                      const ask = chainContract.ask;
                      setLimitPrice(ask.toFixed(2));
                      setTriggerPrice(ask.toFixed(2));
                    }}
                    style={{
                      flex: 1, padding: '8px', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', transition: 'all .2s', fontFamily: 'Inter,sans-serif', letterSpacing: '0.4px',
                      background: orderSide === 'BUY' ? '#1db954' : '#F0F2F5', color: orderSide === 'BUY' ? '#fff' : '#8B92A8'
                    }}
                  >
                    BUY
                  </button>
                  <button
                    onClick={() => {
                      setOrderSide('SELL');
                      const bid = chainContract.bid;
                      setLimitPrice(bid.toFixed(2));
                      setTriggerPrice(bid.toFixed(2));
                    }}
                    style={{
                      flex: 1, padding: '8px', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', transition: 'all .2s', fontFamily: 'Inter,sans-serif', letterSpacing: '0.4px',
                      background: orderSide === 'SELL' ? '#e53935' : '#F0F2F5', color: orderSide === 'SELL' ? '#fff' : '#8B92A8'
                    }}
                  >
                    SELL
                  </button>
                </div>
              )}

              {chainContract && (
                <div id="chainContractDetail" style={{ fontSize: '10px', color: '#8B92A8', fontWeight: '600', padding: '0 0 6px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <span style={{ background: orderSide === 'BUY' ? '#e8faf0' : '#fde8e8', color: orderSide === 'BUY' ? '#1db954' : '#e53935', padding: '2px 8px', borderRadius: '6px', fontWeight: '700', fontSize: '10px' }}>
                    {orderSide === 'BUY' ? 'Ask' : 'Bid'} ₹{orderSide === 'BUY' ? chainContract.ask : chainContract.bid}
                  </span>
                  <span style={{ background: '#F0F2F5', color: '#8B92A8', padding: '2px 8px', borderRadius: '6px', fontSize: '10px' }}>
                    {chainContract.expiry}
                  </span>
                </div>
              )}

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
                <div className="market-limit-box" id="orderTypeGroup" style={{ width: 'auto', flexGrow: 1 }}>
                  <div className={`market-option ${orderType === 'market' ? 'active' : ''}`} onClick={() => setOrderType('market')}>Mkt</div>
                  <div className={`market-option ${orderType === 'limit' ? 'active' : ''}`} onClick={() => setOrderType('limit')}>Lmt</div>
                  <div className={`market-option ${orderType === 'slm' ? 'active' : ''}`} onClick={() => setOrderType('slm')}>SLM</div>
                  <div className={`market-option ${orderType === 'gtt' ? 'active' : ''}`} onClick={() => setOrderType('gtt')}>GTT</div>
                  <div className={`market-option ${orderType === 'sl' ? 'active' : ''}`} onClick={() => setOrderType('sl')}>SL</div>
                </div>
                {(orderType === 'limit' || orderType === 'gtt') && (
                  <div className="limit-price-box visible" id="limitPriceBox" style={{ width: '120px' }}>
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
                {(orderType === 'sl' || orderType === 'slm') && (
                  <div className="limit-price-box visible" id="triggerPriceBox" style={{ width: '120px' }}>
                    <span className="price-symbol" style={{ fontSize: '8px', color: '#8B92A8', fontWeight: 'bold' }}>TRIG ₹</span>
                    <input
                      type="number"
                      step="0.05"
                      value={triggerPrice}
                      onChange={(e) => setTriggerPrice(e.target.value)}
                      placeholder="trigger"
                    />
                  </div>
                )}
              </div>

              {orderType === 'gtt' && (
                <div className="gtt-row">
                  <div className="gtt-field sl-field">
                    <span className="gtt-tag">SL ₹</span>
                    <input
                      type="number"
                      step="0.05"
                      value={gttSlPrice}
                      onChange={(e) => setGttSlPrice(e.target.value)}
                      placeholder="stop loss"
                    />
                  </div>
                  <div className="gtt-field tgt-field">
                    <span className="gtt-tag">Target ₹</span>
                    <input
                      type="number"
                      step="0.05"
                      value={gttTargetPrice}
                      onChange={(e) => setGttTargetPrice(e.target.value)}
                      placeholder="target"
                    />
                  </div>
                </div>
              )}

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

