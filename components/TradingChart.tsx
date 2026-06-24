'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import ChartContainer from '@/components/chart/ChartContainer';
import { Candle } from '@/components/chart/types';
import { useMyOrders } from '@/hooks/useMyOrders';
import type { MyOrder } from '@/lib/types/order';
import { useMyPositions, EnrichedPosition } from '@/hooks/useMyPositions';
import { useOrderEntry } from '@/hooks/useOrderEntry';
import { supabase } from '@/lib/supabaseClient';
import OptionChainTable from '@/app/option-chain/OptionChainTable';
import { useMarketQuotes } from '@/hooks/useMarketQuotes';
import useSWR from 'swr';
import { parseOptionSymbol } from '@/lib/parseOptionSymbol';
import './trading-chart.css';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const getUnderlyingSymbol = (sym: string) => {
  if (sym.includes('NIFTY 50')) return 'NIFTY';
  if (sym.includes('NIFTY BANK')) return 'BANKNIFTY';
  if (sym.includes('NIFTY FIN SERVICE')) return 'FINNIFTY';
  if (sym.includes('NIFTY MID SELECT')) return 'MIDCPNIFTY';
  if (sym.includes('SENSEX')) return 'SENSEX';
  if (sym.includes('BANKEX')) return 'BANKEX';
  
  const parsed = parseOptionSymbol(sym);
  if (parsed) {
    return parsed.underlying;
  }
  
  if (sym.includes(':')) return sym.split(':')[1];
  return sym;
};

interface TradingChartProps {
  symbol: string;         // e.g., "BTCUSDT" or "NSE:INFY"
  segment: string;        // e.g., "CRYPTO" or "EQ"
  liveQuote?: any;        // Live quote object to update the last candle
}

type Timeframe = '1m' | '5m' | '15m' | '60m' | 'day';

function getLotSize(name: string, scriptSettings?: { symbol: string; lot_size: number }[]): number {
  const n = name.toUpperCase();
  if (scriptSettings && scriptSettings.length > 0) {
    const sortedSettings = [...scriptSettings].sort((a, b) => b.symbol.length - a.symbol.length);
    const match = sortedSettings.find(s => n.includes(s.symbol.toUpperCase()));
    if (match) return Number(match.lot_size);
  }
  if (n.includes('BANKNIFTY') || n.includes('BANKEX')) return 30;
  if (n.includes('FINNIFTY')) return 60;
  if (n.includes('MIDCP') || n.includes('MIDCAP')) return 120;
  if (n.includes('SENSEX')) return 20;
  if (n.includes('NIFTY')) return 65;
  if (n.includes('GOLDM')) return 10;
  if (n.includes('GOLD')) return 100;
  if (n.includes('SILVERM')) return 5;
  if (n.includes('SILVER')) return 30;
  if (n.includes('CRUDEOIL')) return 100;
  if (n.includes('NATURALGAS')) return 1250;
  return 1;
}

function mapSegmentToDbSegment(s: string): string {
  if (!s) return 'NSE-EQ';
  const u = s.toUpperCase();
  if (u.includes('NFO') || u.includes('OPTIDX')) return 'INDEX-OPT';
  if (u.includes('OPTSTK')) return 'STOCK-OPT';
  if (u.includes('FUTIDX')) return 'INDEX-FUT';
  if (u.includes('FUTSTK')) return 'STOCK-FUT';
  if (u.includes('MCX') && u.includes('OPT')) return 'MCX-OPT';
  if (u.includes('MCX')) return 'MCX-FUT';
  if (u.includes('COMEX')) return 'COMEX';
  if (u.includes('CRYPTO')) return 'CRYPTO';
  if (u.includes('NSE') || u.includes('EQ')) return 'NSE-EQ';
  return 'NSE-EQ';
}

export default function TradingChart({ symbol, segment, liveQuote }: TradingChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [chartType, setChartType] = useState<'candle' | 'area' | 'bar' | 'baseline'>('candle');
  const [openTopFlyout, setOpenTopFlyout] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [historicalCandles, setHistoricalCandles] = useState<Candle[]>([]);

  // Indicators toggle state
  const [activeIndicators, setActiveIndicators] = useState({
    sma: false,
    ema: false,
    rsi: false,
    macd: false
  });

  // Indicators values settings state
  const [settings, setSettings] = useState({
    smaPeriod: 20,
    emaPeriod: 20,
    rsiPeriod: 14,
    macdFast: 12,
    macdSlow: 26,
    macdSignal: 9
  });

  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // For the legend overlay
  const [currentPrice, setCurrentPrice] = useState<number>(0);
  const [priceChange, setPriceChange] = useState<number>(0);
  const [priceChangePct, setPriceChangePct] = useState<number>(0);

  // Active Drawing Tool state
  const [activeDrawingTool, setActiveDrawingTool] = useState<string | null>(null);

  const isCrypto = segment.toUpperCase() === 'CRYPTO' || symbol.endsWith('USDT');

  const isUnderlyingIndex = useMemo(() => {
    const s = symbol.toUpperCase();
    const spotIndices = [
      'NIFTY 50', 'NIFTY BANK', 'SENSEX', 'NIFTY FIN SERVICE', 'NIFTY MID SELECT', 'BANKEX',
      'NSE:NIFTY 50', 'NSE:NIFTY BANK', 'BSE:SENSEX', 'NSE:NIFTY FIN SERVICE', 'NSE:NIFTY MID SELECT', 'BSE:BANKEX'
    ];
    return spotIndices.includes(s);
  }, [symbol]);

  // --- Real Data Hooks ---
  const { orders, cancelOrder, refresh: refreshOrders } = useMyOrders();
  const { positions, refresh: refreshPositions } = useMyPositions();
  const { placeOrder, closePosition } = useOrderEntry();

  // --- Dashboard States ---
  const [isOrderBlockVisible, setIsOrderBlockVisible] = useState<boolean>(false);
  const [orderSide, setOrderSide] = useState<'BUY' | 'SELL'>('BUY');
  const [qtyValue, setQtyValue] = useState<number | string>(() => getLotSize(symbol));
  const [useLots, setUseLots] = useState<boolean>(false);
  const [orderCarry, setOrderCarry] = useState<'normal' | 'carry'>('normal');
  const [orderType, setOrderType] = useState<'market' | 'limit' | 'slm' | 'gtt' | 'sl'>('market');
  const [limitPrice, setLimitPrice] = useState<string>('');
  const [triggerPrice, setTriggerPrice] = useState<string>('');
  const [gttSlPrice, setGttSlPrice] = useState<string>('');
  const [gttTargetPrice, setGttTargetPrice] = useState<string>('');
  const [chainContract, setChainContract] = useState<{ name: string; expiry: string; ltp: number; iv: number; bid: number; ask: number; kiteId?: string } | null>(null);
  const [activeSegment, setActiveSegment] = useState<'chain' | 'orders' | 'positions'>('orders');
  const [isPanelExpanded, setIsPanelExpanded] = useState<boolean>(false);
  const [isBottomSectionVisible, setIsBottomSectionVisible] = useState<boolean>(true);
  const [balance, setBalance] = useState<number>(50000);
  const [toast, setToast] = useState<{ visible: boolean; msg: string; isError?: boolean }>({ visible: false, msg: '' });
  const [segmentSettings, setSegmentSettings] = useState<any[]>([]);
  const [scriptSettings, setScriptSettings] = useState<{ symbol: string; lot_size: number }[]>([]);

  // ── CHARTINH Integration States ──
  const [activeOrderTab, setActiveOrderTab] = useState<'open' | 'executed'>('open');
  const [isExitFlow, setIsExitFlow] = useState<boolean>(false);
  const [isAddMoreFlow, setIsAddMoreFlow] = useState<boolean>(false);
  const [exitPositionId, setExitPositionId] = useState<string | null>(null);
  const [addMoreSymbol, setAddMoreSymbol] = useState<string | null>(null);
  const [addMoreSegment, setAddMoreSegment] = useState<string | null>(null);
  const [addMoreLtp, setAddMoreLtp] = useState<number | null>(null);
  const [postOrderSegment, setPostOrderSegment] = useState<'chain' | 'orders' | 'positions' | 'main' | null>(null);
  const [orderBlockTitle, setOrderBlockTitle] = useState<string>(symbol);
  const [modifyOrderId, setModifyOrderId] = useState<string | null>(null);
  const [showCharges, setShowCharges] = useState(false);

  const underlyingSym = getUnderlyingSymbol(symbol);
  const isIndex = symbol.includes('NIFTY') || symbol.includes('BANKNIFTY') || symbol.includes('SENSEX') || symbol.includes('BANKEX');

  const { data: chainData, isLoading: chainLoading } = useSWR(
    activeSegment === 'chain' && !isCrypto && !segment.toUpperCase().includes('FOREX')
      ? `/api/market/option-chain?symbol=${underlyingSym}`
      : null,
    fetcher
  );

  const chainStrikes = useMemo(() => chainData?.strikes || [], [chainData]);
  const chainExpiry = chainData?.selectedExpiry || '';

  const symbolsToFetch = useMemo(() => {
    if (activeSegment !== 'chain' || !chainStrikes.length) return [];
    const syms: string[] = [];
    chainStrikes.forEach((s: any) => {
      if (s.ce?.id) syms.push(s.ce.id);
      if (s.pe?.id) syms.push(s.pe.id);
    });
    return syms;
  }, [activeSegment, chainStrikes]);

  const { quotes: marketQuotes } = useMarketQuotes(symbolsToFetch);

  const openChainOrder = (defaultAction: 'BUY' | 'SELL', contractName: string, expiry: string, ltp: number, iv: number, kiteId?: string) => {
    setIsPanelExpanded(false);
    const bid = ltp;
    const ask = parseFloat((ltp + Math.max(0.05, ltp * 0.005)).toFixed(2));
    const contract = { name: contractName, expiry, ltp, iv, bid, ask, kiteId };
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
    setQtyValue(lotSize);
    setIsExitFlow(false);
    setIsAddMoreFlow(false);
    setExitPositionId(null);
    setPostOrderSegment('chain');
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
    setIsLocked(!isLocked);
    showToast("Drawing tools are coming soon in the modernized engine");
  };

  const toggleHideDrawings = () => {
    setHideDrawings(!hideDrawings);
    showToast("Drawing tools are coming soon in the modernized engine");
  };

  const clearAllDrawings = () => {
    setOverlayIds([]);
    setActiveDrawingTool(null);
    showToast("Drawing tools are coming soon in the modernized engine");
  };

  // Get lot size of instrument
  const lotSize = useMemo(() => getLotSize(symbol, scriptSettings), [symbol, scriptSettings]);

  // Update qtyValue when lotSize changes (if user hasn't typed a custom qty yet)
  useEffect(() => {
    if (!useLots && qtyValue === getLotSize(symbol, [])) {
      setQtyValue(lotSize);
    }
  }, [lotSize]);

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

  const fetchBalance = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return;

      const res = await fetch('/api/pay/balance', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (typeof data.balance === 'number') {
        setBalance(data.balance);
      }

      // Fetch segment settings and script settings
      const profileRes = await supabase.from('profiles').select('trading_mode').single();
      const mode = profileRes.data?.trading_mode || 'normal';
      const [settingsRes, scriptRes] = await Promise.all([
        fetch(`/api/user/segments?mode=${mode}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/user/script-settings', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setSegmentSettings(settingsData || []);
      }
      if (scriptRes.ok) {
        const ssData = await scriptRes.json();
        setScriptSettings(ssData || []);
      }
    } catch (err) {
      console.error('Failed to fetch balance or segment settings:', err);
    }
  };

  // Get user's actual funds balance
  useEffect(() => {
    fetchBalance();
  }, []);

  // Ensure default quantity is always the lowest allowed number when symbol or unit changes
  useEffect(() => {
    setQtyValue(useLots ? 1 : lotSize);
  }, [symbol, lotSize, useLots]);


  // Fetch Historical Data
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        let data: Candle[] = [];

        if (isCrypto) {
          const interval = getIntervalString();
          let binanceSymbol = symbol.replace('/', '');
          if (!binanceSymbol.endsWith('USDT')) {
            binanceSymbol += 'USDT';
          }
          const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=${interval}&limit=500`);
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

        if (isMounted) {
          const uniqueData = Array.from(new Map(data.map(item => [item.timestamp, item])).values());
          uniqueData.sort((a, b) => a.timestamp - b.timestamp);
          
          setHistoricalCandles(uniqueData);
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
    if (!liveQuote || loading) return;
    
    const lastPrice = liveQuote.lastPrice || liveQuote.last_price;
    if (!lastPrice) return;

    setCurrentPrice(lastPrice);
    if (limitPrice === '') setLimitPrice(lastPrice.toFixed(2));
    
    const lastCandle = historicalCandles.length > 0 ? historicalCandles[historicalCandles.length - 1] : null;
    setPriceChange(liveQuote.change || (lastPrice - (lastCandle?.open || lastPrice)));
    setPriceChangePct(liveQuote.changePercent || 0);
  }, [liveQuote, loading, historicalCandles]);

  const displayExchange = isCrypto ? 'BINANCE' : (symbol.includes('SENSEX') || symbol.includes('BANKEX')) ? 'BSE' : 'NSE';
  const isUp = priceChange >= 0;

  // Drawing Tools Click handler
  const handleDrawingTool = (toolName: string) => {
    setActiveDrawingTool(activeDrawingTool === toolName ? null : toolName);
    showToast("Drawing tools are coming soon in the modernized engine");
  };

  // Stepper for quantity
  // In Lot mode: step by 0.5. In Qty mode: step by lotSize (whole units)
  const handleQtyStep = (delta: number) => {
    if (useLots) {
      setQtyValue(prev => Math.max(0.5, parseFloat((Number(prev) + delta * 0.5).toFixed(1))));
    } else {
      const step = isCrypto ? 0.01 : lotSize;
      const minQty = isCrypto ? 0.01 : lotSize;
      setQtyValue(prev => Math.max(minQty, parseFloat((Number(prev) + delta * step).toFixed(isCrypto ? 2 : 0))));
    }
  };

  // Toggle Lots vs Qty
  const handleUnitChange = (lotsActive: boolean) => {
    setUseLots(lotsActive);
    setQtyValue(prev => {
      const p = Number(prev);
      if (lotsActive) {
        // Convert qty -> lots, allow decimal (e.g. 12.5 qty / 25 lotSize = 0.5 lots)
        return Math.max(0.5, parseFloat((p / lotSize).toFixed(1)));
      } else {
        // Convert lots -> qty (always whole number except for crypto)
        return isCrypto ? parseFloat((p * lotSize).toFixed(2)) : Math.round(p * lotSize);
      }
    });
  };

  // Place actual order
  const handleSubmitOrder = async () => {
    const qVal = Number(qtyValue) || 0;
    if (qVal <= 0) {
      showToast("Invalid quantity", true);
      return;
    }
    const finalQty = useLots ? (isCrypto ? qVal * lotSize : Math.round(qVal * lotSize)) : (isCrypto ? qVal : Math.round(qVal));
    
    // Determine the base execution price
    // For add-more flow on a different instrument, use that position's LTP not the chart price
    const basePrice = (isAddMoreFlow && addMoreLtp) ? addMoreLtp : currentPrice;
    let finalPrice = basePrice;
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

    const dbSeg = mapSegmentToDbSegment(segment);
    const buySetting = segmentSettings.find(s => s.segment === dbSeg && s.side === 'BUY');
    const sellSetting = segmentSettings.find(s => s.segment === dbSeg && s.side === 'SELL');
    const segSetting = orderSide === 'SELL' ? sellSetting : buySetting;

    const intradayLeverage = segSetting?.intraday_leverage ?? 1;
    const holdingLeverage  = segSetting?.holding_leverage ?? 1;
    const leverage = orderCarry === 'carry' ? holdingLeverage : intradayLeverage;

    const reqMargin = Math.ceil((finalPrice * finalQty) / leverage);
    if (reqMargin > balance) {
      showToast('Insufficient margin', true);
      return;
    }

    // Determine target symbol and segment — use position's symbol when in add-more flow
    let orderSymbol = (isAddMoreFlow && addMoreSymbol) ? addMoreSymbol : symbol;
    let orderKiteInstrument = orderSymbol;
    let orderSegment = (isAddMoreFlow && addMoreSegment) ? addMoreSegment : segment;

    if (chainContract) {
      orderSymbol = chainContract.name;
      
      const underlying = symbol.toUpperCase().replace('_INDEX', '').replace('NSE:', '').replace('INDEX', '').trim();
      let prefix = 'NFO';
      if (underlying.includes('SENSEX') || underlying.includes('BANKEX')) prefix = 'BFO';
      else if (['GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS'].includes(underlying)) prefix = 'MCX';
      
      orderKiteInstrument = chainContract.kiteId || `${prefix}:${orderSymbol}`;
      orderSegment = 'INDEX-OPT';
    }

    if (modifyOrderId) {
      showToast('Modifying order...');
      const cancelRes = await cancelOrder(modifyOrderId);
      if (!cancelRes.success) {
        showToast(cancelRes.error || 'Failed to modify order (cancel failed)', true);
        return;
      }
    } else {
      showToast('Placing order...');
    }

    const res = await placeOrder({
      symbol: orderSymbol,
      kite_instrument: orderKiteInstrument,
      segment: orderSegment,
      side: orderSide,
      qty: finalQty,
      lots: useLots ? Number(qtyValue) : 0,
      order_type: orderType.toUpperCase() as any,
      product_type: orderCarry === 'carry' ? 'CARRY' : 'INTRADAY',
      client_price: orderType === 'market' ? 0 : finalPrice,
      trigger_price: (orderType === 'sl' || orderType === 'slm') ? parseFloat(triggerPrice) : undefined,
      stop_loss: gttSlPrice ? parseFloat(gttSlPrice) : undefined,
      target: gttTargetPrice ? parseFloat(gttTargetPrice) : undefined,
      is_exit: isExitFlow
    });

    if (res.success) {
      if (modifyOrderId) {
        showToast('Order Modified Successfully!');
        setModifyOrderId(null);
      } else {
        showToast(`${orderSide} Order Placed Successfully!`);
      }
      setIsOrderBlockVisible(false);
      setChainContract(null);
      setIsExitFlow(false);
      setIsAddMoreFlow(false);
      setAddMoreSymbol(null);
      setAddMoreSegment(null);
      setAddMoreLtp(null);
      setExitPositionId(null);
      setOrderBlockTitle(symbol);
      refreshOrders();
      refreshPositions();
      fetchBalance();

      // Post-order navigation: return to originating segment
      const returnTo = postOrderSegment;
      setPostOrderSegment(null);
      if (returnTo && returnTo !== 'main') {
        setActiveSegment(returnTo as 'chain' | 'orders' | 'positions');
        setIsPanelExpanded(true);
      }
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
      fetchBalance();
      if (modifyOrderId === id) {
        setModifyOrderId(null);
        setIsOrderBlockVisible(false);
        setOrderBlockTitle(symbol);
      }
    } else {
      showToast(res.error || 'Cancel failed', true);
    }
  };

  const handleModifyOrder = (o: MyOrder) => {
    setIsPanelExpanded(false);
    setModifyOrderId(o.id);
    setOrderSide(o.side);
    setQtyValue(o.qty);
    setUseLots(false);
    setOrderCarry(o.product_type === 'CARRY' ? 'carry' : 'normal');
    setOrderType(o.order_type.toLowerCase() as any);
    setLimitPrice(o.client_price ? o.client_price.toString() : '');
    setTriggerPrice(o.trigger_price ? o.trigger_price.toString() : '');
    setGttSlPrice(o.stop_loss ? o.stop_loss.toString() : '');
    setGttTargetPrice(o.target ? o.target.toString() : '');
    setIsExitFlow(false);
    setIsAddMoreFlow(false);
    setOrderBlockTitle(`Modify · ${o.symbol}`);
    setPostOrderSegment('orders');
    setIsOrderBlockVisible(true);
  };

  // Exit position via order panel (allows choosing Market/SL)
  const handleExitPosition = (pos: EnrichedPosition) => {
    setIsPanelExpanded(false);
    setIsExitFlow(true);
    setIsAddMoreFlow(false);
    setExitPositionId(pos.id);
    setOrderSide(pos.side === 'BUY' ? 'SELL' : 'BUY');
    setQtyValue(pos.qty_open);
    setUseLots(false);
    setOrderCarry(pos.product_type === 'CARRY' ? 'carry' : 'normal');
    setOrderType('market');
    setLimitPrice(currentPrice.toFixed(2));
    setTriggerPrice(currentPrice.toFixed(2));
    setOrderBlockTitle(`Exit · ${symbol}`);
    setPostOrderSegment('positions');
    setIsOrderBlockVisible(true);
  };

  // Direct quick-exit (instant market close)
  const handleQuickExit = async (id: string) => {
    showToast('Exiting position...');
    const res = await closePosition(id);
    if (res.success) {
      showToast('Position closed');
      refreshPositions();
      fetchBalance();
    } else {
      showToast(res.error || 'Exit failed', true);
    }
  };

  // Add more to a position (may be a different symbol from the current chart)
  const handleAddMorePosition = (pos: EnrichedPosition) => {
    setIsPanelExpanded(false);
    setIsExitFlow(false);
    setIsAddMoreFlow(true);
    setExitPositionId(null);
    setAddMoreSymbol(pos.symbol);
    setAddMoreSegment(pos.settlement || segment);
    setAddMoreLtp(pos.current_ltp || pos.avg_price || pos.entry_price);
    setOrderSide(pos.side);
    setQtyValue(pos.qty_open);
    setUseLots(false);
    setOrderCarry(pos.product_type === 'CARRY' ? 'carry' : 'normal');
    setOrderType('market');
    setOrderBlockTitle(`Add More · ${pos.symbol}`);
    setPostOrderSegment('positions');
    setIsOrderBlockVisible(true);
  };

  const handleQuickMarketOrder = async (side: 'BUY' | 'SELL') => {
    const qVal = Number(qtyValue) || 0;
    if (qVal <= 0) {
      showToast("Invalid quantity", true);
      return;
    }
    const finalQty = useLots ? (isCrypto ? qVal * lotSize : Math.round(qVal * lotSize)) : (isCrypto ? qVal : Math.round(qVal));

    const dbSeg = mapSegmentToDbSegment(segment);
    const segSetting = segmentSettings.find(s => s.segment === dbSeg && s.side === side);
    const intradayLeverage = segSetting?.intraday_leverage ?? 1;
    const required = Math.ceil((currentPrice * finalQty) / intradayLeverage);

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
      qty: finalQty,
      lots: useLots ? qVal : 0,
      order_type: 'MARKET',
      product_type: 'INTRADAY',
      client_price: 0,
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
      fetchBalance();
    } else {
      showToast(res.error || 'Failed to place quick order', true);
    }
  };

  const handleQuickAddPosition = async (pos: EnrichedPosition) => {
    const addQty = pos.qty_open;
    const dbSeg = mapSegmentToDbSegment(segment);
    const segSetting = segmentSettings.find(s => s.segment === dbSeg && s.side === pos.side);
    const leverage = pos.product_type === 'CARRY' ? (segSetting?.holding_leverage ?? 1) : (segSetting?.intraday_leverage ?? 1);
    const required = Math.ceil((currentPrice * addQty) / leverage);

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
      client_price: 0,
      is_exit: false
    });

    if (res.success) {
      showToast(`Successfully added ${addQty} to position!`);
      refreshOrders();
      refreshPositions();
      fetchBalance();
    } else {
      showToast(res.error || 'Failed to add to position', true);
    }
  };

  // All open/active positions (not filtered by symbol)
  const currentSymbolPositions = positions.filter(p => (p.status === 'open' || p.status === 'active'));
  // Sum pre-computed unrealised P&L (uses correct per-symbol LTP from useMyPositions)
  const pnlTotal = currentSymbolPositions.reduce((acc, pos) => acc + (pos.unrealised_pnl ?? 0), 0);

  // Calculated Required Margin for current order block state
  const rawBid = liveQuote ? (liveQuote.bid || liveQuote.lastPrice || liveQuote.last_price || currentPrice) : currentPrice;
  const rawAsk = liveQuote ? (liveQuote.ask || liveQuote.lastPrice || liveQuote.last_price || currentPrice) : currentPrice;
  const priceOfScript = orderSide === 'SELL' ? rawBid : rawAsk;

  const orderQty = useLots ? Number(qtyValue) * lotSize : Number(qtyValue);
  const executionPrice = orderType === 'limit' ? (parseFloat(limitPrice) || priceOfScript) : priceOfScript;
  
  const dbSeg = mapSegmentToDbSegment(segment);
  const buySetting = segmentSettings.find(s => s.segment === dbSeg && s.side === 'BUY');
  const sellSetting = segmentSettings.find(s => s.segment === dbSeg && s.side === 'SELL');
  const segSetting = orderSide === 'SELL' ? sellSetting : buySetting;

  const intradayLeverage = segSetting?.intraday_leverage ?? 1;
  const holdingLeverage  = segSetting?.holding_leverage ?? 1;
  const leverage = orderCarry === 'carry' ? holdingLeverage : intradayLeverage;

  const chargePrice = orderType === 'limit' && limitPrice && !isNaN(parseFloat(limitPrice))
    ? parseFloat(limitPrice) : (priceOfScript > 0 ? priceOfScript : 0);
  const chargeQty = orderQty;
  const chargeExposure = chargeQty * chargePrice;

  const computeCharge = (commType: string, commVal: number) => {
    if (commType === 'Per Crore') return (chargeExposure * commVal) / 10000000;
    if (commType === 'Per Lot') return (chargeQty / lotSize) * commVal;
    if (commType === 'Per Trade' || commType === 'Flat') return commVal;
    return chargeExposure * 0.001;
  };

  const intradayCharge = segSetting ? computeCharge(
    segSetting.commission_type || 'Per Crore',
    segSetting.commission_value ?? 0
  ) : 0;

  const carryCharge = segSetting ? computeCharge(
    segSetting.carry_commission_type || segSetting.commission_type || 'Per Crore',
    segSetting.carry_commission_value ?? segSetting.commission_value ?? 0
  ) : 0;

  const gttCharge = segSetting ? computeCharge(
    segSetting.gtt_commission_type || 'Per Trade',
    segSetting.gtt_commission_value ?? 10
  ) : 0;

  const totalBrokerage = intradayCharge + (orderCarry === 'carry' ? carryCharge : 0) + (orderType === 'gtt' ? gttCharge : 0);
  const reqMargin = Math.ceil((executionPrice * orderQty) / leverage) + totalBrokerage;

  // Render collapsible panel tabs content
  const renderPanelContent = () => {
    if (activeSegment === 'chain') {
      if (isCrypto || segment.toUpperCase().includes('FOREX')) {
        return <div className="empty-state">Option Chain not available for this segment.</div>;
      }
      if (chainLoading) {
        return <div className="empty-state">Loading chain...</div>;
      }
      
      const handleTableTrade = (tradeSymbol: string, defaultAction: 'BUY' | 'SELL') => {
        // tradeSymbol = "NIFTY26JUN24000CE|221.45|0|NFO:NIFTY26JUN24000CE"
        const parts = tradeSymbol.split('|');
        if (parts.length < 2) return;
        const contractName = parts[0];
        const ltp = parseFloat(parts[1]) || 0;
        const kiteId = parts[3] || '';
        openChainOrder(defaultAction, contractName, chainExpiry, ltp, 0, kiteId);
      };

      // Transform real strikes for TradingChart format (needs tradeSymbol with | format for handleTableTrade)
      const mappedStrikes = chainStrikes.map((r: any) => {
        const ceQuote = r.ce?.id ? marketQuotes[r.ce.id] : null;
        const peQuote = r.pe?.id ? marketQuotes[r.pe.id] : null;
        const ceLtp = ceQuote ? ceQuote.lastPrice : (r.ce?.price || 0);
        const peLtp = peQuote ? peQuote.lastPrice : (r.pe?.price || 0);
        
        return {
          strike: r.strike,
          ce: { ...r.ce, symbol: r.ce ? `${r.ce.symbol}|${ceLtp}|0|${r.ce.id}` : '' },
          pe: { ...r.pe, symbol: r.pe ? `${r.pe.symbol}|${peLtp}|0|${r.pe.id}` : '' }
        };
      });

      return (
        <div className="tc-chain-container" style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          <OptionChainTable 
            strikes={mappedStrikes} 
            quotes={marketQuotes} 
            spotPrice={currentPrice || 71.00} 
            onTrade={handleTableTrade} 
            priceMode="LTP" 
            stickyTop={0}
          />
        </div>
      );
    }
    
    if (activeSegment === 'orders') {
      const openOrders = orders.filter(o => o.status === 'PENDING');

      return (
        <>
          {openOrders.length === 0 ? (
            <div className="empty-state">No open orders.</div>
          ) : (
            openOrders.map(o => {
              const isBuy = o.side === 'BUY';
              const label = o.side;
              const labelBg = isBuy ? 'var(--green-bg)' : 'var(--red-bg)';
              const labelClr = isBuy ? 'var(--green-text)' : 'var(--red-text)';
              const timeStr = o.created_at ? new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
              return (
                <div key={o.id} className="order-row">
                  <div className="order-info-row" style={{ alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: '1 1 0%', minWidth: 0 }}>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{o.symbol}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span style={{ fontWeight: 700, color: labelClr, fontSize: '10px', background: labelBg, padding: '1px 6px', borderRadius: '4px' }}>{label}</span>
                        <span style={{ color: 'var(--pill-text)', fontSize: '11px' }}>{o.qty} qty</span>
                        {o.order_type && (
                          <span style={{ fontSize: '9px', background: 'var(--blue-bg)', color: 'var(--blue-text)', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                            {o.order_type.toUpperCase()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px', flexShrink: 0 }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '12px' }}>
                        ₹{(() => {
                          const type = (o.order_type || '').toUpperCase();
                          if (type === 'GTT') {
                            if (o.stop_loss && o.target) return `SL ${o.stop_loss.toFixed(2)} / TP ${o.target.toFixed(2)}`;
                            if (o.stop_loss) return `SL ₹${o.stop_loss.toFixed(2)}`;
                            if (o.target) return `TP ₹${o.target.toFixed(2)}`;
                          }
                          if (type === 'SL' || type === 'SLM') return (o.trigger_price ?? o.client_price ?? 0).toFixed(2);
                          return (o.client_price ?? o.fill_price ?? o.ltp_at_entry ?? 0).toFixed(2);
                        })()}
                      </span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{timeStr}</span>
                    </div>
                  </div>
                  {o.status === 'PENDING' && (
                    <div className="order-actions">
                      <button className="order-action-btn modify-order-btn" onClick={() => handleModifyOrder(o)}>Modify</button>
                      <button className="order-action-btn delete-order-btn" onClick={() => handleCancelOrder(o.id)}>Delete</button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </>
      );
    }
    
    // Positions — Rich Layout matching CHARTINH.html exactly
    if (currentSymbolPositions.length === 0) {
      return <div className="empty-state">No active positions.</div>;
    }
    return currentSymbolPositions.map((pos) => {
      const entryPrice = pos.avg_price || pos.entry_price;
      const pnl = pos.unrealised_pnl ?? 0;
      const pnlColor = pnl >= 0 ? 'var(--green)' : 'var(--red)';
      const sideBg = pos.side === 'BUY' ? 'var(--green-bg)' : 'var(--red-bg)';
      const sideClr = pos.side === 'BUY' ? 'var(--green-text)' : 'var(--red-text)';
      return (
        <div key={pos.id} className="position-row">
          <div className="position-info-row">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>{pos.symbol}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span style={{ fontWeight: 700, color: sideClr, fontSize: '10px', background: sideBg, padding: '1px 6px', borderRadius: '4px' }}>
                  {pos.side}
                </span>
                <span style={{ color: 'var(--pill-text)', fontSize: '11px' }}>{pos.qty_open} qty</span>
              </div>
            </div>
            <div style={{ color: 'var(--pill-text)', fontSize: '11px' }}>Entry ₹{entryPrice.toFixed(2)}</div>
            <div style={{ color: pnlColor, fontWeight: 700 }}>
              {pnl >= 0 ? '+' : '-'}₹{Math.abs(pnl).toFixed(0)}
            </div>
          </div>
          <div className="position-actions">
            <button className="position-action-btn add-position-btn" onClick={() => handleAddMorePosition(pos)}>+ Add More</button>
            <button className="position-action-btn exit-position-btn" onClick={() => handleExitPosition(pos)}>Exit</button>
          </div>
        </div>
      );
    });
  };

  return (
    <div className={`tc-wrapper ${isPanelExpanded ? 'panel-expanded' : ''}`}>
      {/* Top Toolbar */}
      <div className="tc-top-toolbar" onMouseLeave={() => setOpenTopFlyout(null)}>
        {/* ── Back button ── */}
        <button
          className="tc-icon-btn"
          style={{ marginRight: '-6px' }}
          onClick={() => {
            const sheet = document.getElementById('chartSheet');
            const overlay = document.getElementById('chartSheetOverlay');
            if (sheet) sheet.classList.remove('open');
            if (overlay) overlay.classList.remove('active');
          }}
        >
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
          onClick={() => setShowSettingsModal(true)}
          style={{ display: 'none' }}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4">
            <path d="M1 10 L4 6 L7 8 L10 3 L13 5"/>
            <line x1="1" y1="12" x2="13" y2="12" strokeDasharray="2 1" opacity="0.5"/>
          </svg>
          <span style={{ fontSize: '12px', fontWeight: 600 }}>Indicators</span>
        </div>

        {/* ── Compare ── HIDDEN */}
        {/* ── Snapshot ── HIDDEN */}

        {/* ── Right side ── */}
        <div className="tc-top-right">

          {/* Settings */}
          <div className="tc-tb-icon" title="Chart Settings" onClick={() => showToast('Settings coming soon')} style={{ display: 'none' }}>
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

          {/* BUY/price/SELL widget — HIDDEN */}

          <ChartContainer
            symbol={symbol}
            segment={segment}
            timeframe={timeframe}
            chartType={chartType}
            candles={historicalCandles}
            liveQuote={liveQuote}
            loading={loading}
            error={error}
            activeIndicators={activeIndicators}
            setActiveIndicators={setActiveIndicators}
            settings={settings}
            setSettings={setSettings}
            showSettingsModal={showSettingsModal}
            setShowSettingsModal={setShowSettingsModal}
          />
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
        {!isUnderlyingIndex && !isOrderBlockVisible && (
          <div className="trade-buttons" id="tradeButtons">
            <button id="buyButton" className="trade-btn buy" onClick={() => {
              if (isPanelExpanded && activeSegment === 'chain') {
                handleQuickMarketOrder('BUY');
              } else {
                setIsPanelExpanded(false);
                setIsExitFlow(false);
                setIsAddMoreFlow(false);
                setExitPositionId(null);
                setOrderBlockTitle(symbol);
                setPostOrderSegment('main');
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
                setIsExitFlow(false);
                setIsAddMoreFlow(false);
                setExitPositionId(null);
                setOrderBlockTitle(symbol);
                setPostOrderSegment('main');
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                <span className="order-block-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {(chainContract ? chainContract.name : orderBlockTitle).replace(/NFO[:\s]?/gi, '').trim()}
                </span>
                {chainContract && (
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0, marginLeft: 'auto', marginRight: '8px' }}>
                    <span style={{ background: orderSide === 'BUY' ? '#e8faf0' : '#fde8e8', color: orderSide === 'BUY' ? '#1db954' : '#e53935', padding: '2px 6px', borderRadius: '4px', fontWeight: '700', fontSize: '10px', whiteSpace: 'nowrap' }}>
                      {orderSide === 'BUY' ? 'Ask' : 'Bid'} ₹{orderSide === 'BUY' ? chainContract.ask : chainContract.bid}
                    </span>
                    <span style={{ background: '#F0F2F5', color: '#8B92A8', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', whiteSpace: 'nowrap' }}>
                      {chainContract.expiry}
                    </span>
                  </div>
                )}
              </div>
              <div className="close-order-block" onClick={() => { 
                setIsOrderBlockVisible(false); 
                setChainContract(null); 
                if (isExitFlow || isAddMoreFlow) setIsPanelExpanded(true);
                setIsExitFlow(false); 
                setIsAddMoreFlow(false); 
                setExitPositionId(null); 
                setOrderBlockTitle(symbol); 
              }}>
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

              {/* chainContractDetail moved to header */}

              <div className="top-row">
                <div className="quantity-box">
                  <div className="qty-controls">
                    <button className="qty-btn" onClick={() => handleQtyStep(-1)}>−</button>
                    <input
                      type="number"
                      className="qty-value"
                      value={qtyValue}
                      step={useLots ? 0.5 : lotSize}
                      min={useLots ? 0.5 : lotSize}
                      onChange={(e) => {
                        setQtyValue(e.target.value);
                      }}
                      onBlur={() => {
                        const val = parseFloat(String(qtyValue));
                        if (useLots) {
                          setQtyValue(isNaN(val) || val <= 0 ? 0.5 : val);
                        } else {
                          const minVal = isCrypto ? 0.01 : lotSize;
                          setQtyValue(isNaN(val) || val <= 0 ? minVal : val);
                        }
                      }}
                    />
                    <button className="qty-btn" onClick={() => handleQtyStep(1)}>+</button>
                  </div>
                  <div className="unit-toggle" id="unitSwitch">
                    <div className={`unit-btn ${!useLots ? 'active' : ''}`} onClick={() => handleUnitChange(false)}>Qty</div>
                    <div className={`unit-btn ${useLots ? 'active' : ''}`} onClick={() => handleUnitChange(true)}>Lot</div>
                  </div>
                </div>
                <div className="carry-box" id="carryGroup">
                  <div className={`carry-option ${orderCarry === 'normal' ? 'active' : ''}`} onClick={() => setOrderCarry('normal')}>Intraday</div>
                  <div className={`carry-option ${orderCarry === 'carry' ? 'active' : ''}`} onClick={() => setOrderCarry('carry')}>Carry</div>
                </div>
              </div>
              
              <div className="bottom-row">
                <div className="market-limit-box" id="orderTypeGroup" style={{ flex: 6 }}>
                  <div className={`market-option ${orderType === 'market' ? 'active' : ''}`} onClick={() => setOrderType('market')}>Mkt</div>
                  <div className={`market-option ${orderType === 'limit' ? 'active' : ''}`} onClick={() => setOrderType('limit')}>{isExitFlow ? 'Tgt' : 'Lmt'}</div>
                  {!isExitFlow && <div className={`market-option ${orderType === 'slm' ? 'active' : ''}`} onClick={() => setOrderType('slm')}>SLM</div>}
                  {isExitFlow && <div className={`market-option ${orderType === 'sl' ? 'active' : ''}`} onClick={() => setOrderType('sl')}>SL</div>}
                  <div className={`market-option ${orderType === 'gtt' ? 'active' : ''}`} onClick={() => setOrderType('gtt')}>GTT</div>
                </div>
                {(orderType === 'limit' || (orderType === 'gtt' && !isExitFlow)) && (
                  <div className="limit-price-box visible" id="limitPriceBox" style={{ flex: 4 }}>
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
                  <div className="limit-price-box visible" id="triggerPriceBox" style={{ flex: 4 }}>
                    <span className="price-symbol" style={{ fontSize: '9px', color: '#8B92A8', fontWeight: 'bold', letterSpacing: '.3px', whiteSpace: 'nowrap' }}>Trigger ₹</span>
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
                <div className="gtt-row visible">
                  <div className="gtt-field sl-field">
                    <span className="gtt-tag">SL ₹</span>
                    <input
                      type="number"
                      step="0.05"
                      value={gttSlPrice}
                      onChange={(e) => setGttSlPrice(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="gtt-field tgt-field">
                    <span className="gtt-tag">Target ₹</span>
                    <input
                      type="number"
                      step="0.05"
                      value={gttTargetPrice}
                      onChange={(e) => setGttTargetPrice(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              )}

              <div className="order-margin-simple" style={{ flexDirection: 'column', gap: '4px', alignItems: 'stretch' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <div className="margin-line">
                    <span className="margin-line-label">Free Margin:</span>
                    <span className="margin-line-value">₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="margin-line">
                    <span className="margin-line-label">Required Margin:</span>
                    <span className={`margin-line-value ${reqMargin > balance ? 'negative' : ''}`}>
                      ₹{reqMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div style={{ height: '4px' }} />

                <div 
                  style={{ 
                    background: 'var(--bg)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px', 
                    padding: '8px 10px', 
                    display: 'flex', 
                    flexDirection: 'column',
                    gap: '6px',
                    width: '100%',
                    boxSizing: 'border-box'
                  }}
                >
                  <div 
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setShowCharges(!showCharges)}
                  >
                    <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Charges Breakdown {showCharges ? '▲' : '▼'}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--green)' }}>
                      ₹{(orderType === 'gtt' ? gttCharge : orderCarry === 'carry' ? carryCharge : intradayCharge).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {showCharges && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Intraday Brokerage</span>
                        <span style={orderCarry === 'normal' && orderType !== 'gtt' ? { color: 'var(--green)', fontWeight: 700 } : { opacity: 0.5 }}>
                          ₹{intradayCharge.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Carry Charges</span>
                        <span style={orderCarry === 'carry' && orderType !== 'gtt' ? { color: 'var(--green)', fontWeight: 700 } : { opacity: 0.5 }}>
                          ₹{carryCharge.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>GTT Charges</span>
                        <span style={orderType === 'gtt' ? { color: 'var(--green)', fontWeight: 700 } : { opacity: 0.5 }}>
                          ₹{gttCharge.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <button
                className={`submit-btn ${orderSide === 'BUY' ? 'submit-buy' : 'submit-sell'}`}
                onClick={handleSubmitOrder}
              >
                {modifyOrderId ? 'Update Order' : `${orderSide} ${useLots ? `${qtyValue} Lot` : `${qtyValue} Qty`}`}
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
            <i className={`ti ${isPanelExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
          </div>
        </div>

        {/* Info Panel */}
        <div className={`info-panel ${!isPanelExpanded ? 'collapsed' : ''}`} id="infoPanel">

          <div className={`panel-content ${activeSegment === 'chain' ? 'chain-mode' : ''}`}>
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

