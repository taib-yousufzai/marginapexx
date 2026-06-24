import React, { useEffect, useRef, useState } from 'react';
import { ChartController } from './core/ChartController';
import { Candle, Timeframe } from './types';
import { SMAIndicator } from './indicators/SMAIndicator';
import { EMAIndicator } from './indicators/EMAIndicator';
import { RSIIndicator } from './indicators/RSIIndicator';
import { MACDIndicator } from './indicators/MACDIndicator';

interface ChartContainerProps {
  symbol: string;
  segment: string;
  timeframe: Timeframe;
  chartType: 'candle' | 'area' | 'bar' | 'baseline';
  candles: Candle[];
  liveQuote?: any;
  loading: boolean;
  error: string | null;
  activeIndicators: {
    sma: boolean;
    ema: boolean;
    rsi: boolean;
    macd: boolean;
  };
  setActiveIndicators: React.Dispatch<React.SetStateAction<{
    sma: boolean;
    ema: boolean;
    rsi: boolean;
    macd: boolean;
  }>>;
  settings: {
    smaPeriod: number;
    emaPeriod: number;
    rsiPeriod: number;
    macdFast: number;
    macdSlow: number;
    macdSignal: number;
  };
  setSettings: React.Dispatch<React.SetStateAction<{
    smaPeriod: number;
    emaPeriod: number;
    rsiPeriod: number;
    macdFast: number;
    macdSlow: number;
    macdSignal: number;
  }>>;
  showSettingsModal: boolean;
  setShowSettingsModal: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function ChartContainer({
  symbol,
  segment,
  timeframe,
  chartType,
  candles,
  liveQuote,
  loading,
  error,
  activeIndicators,
  setActiveIndicators,
  settings,
  setSettings,
  showSettingsModal,
  setShowSettingsModal
}: ChartContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ChartController | null>(null);

  const [activeTab, setActiveTab] = useState<'indicators' | 'settings'>('indicators');

  // Detect theme class on body
  const getIsDark = () => {
    if (typeof document === 'undefined') return true;
    return document.body.classList.contains('dark') || document.body.classList.contains('black');
  };
  const [isDark, setIsDark] = useState(getIsDark());

  // Watch for theme class additions on body
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = getIsDark();
      setIsDark(dark);
      if (controllerRef.current) {
        controllerRef.current.setTheme(dark);
      }
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Initialize/recreate ChartController when symbol/segment changes
  useEffect(() => {
    if (!containerRef.current) return;

    // Clean up previous controller
    if (controllerRef.current) {
      controllerRef.current.destroy();
      controllerRef.current = null;
    }

    try {
      const controller = new ChartController({
        container: containerRef.current,
        symbol,
        segment,
        isDarkMode: isDark
      });
      controllerRef.current = controller;
    } catch (e) {
      console.error('Failed to initialize ChartController:', e);
      return;
    }

    // Apply indicators according to active state
    if (controllerRef.current) {
      applyActiveIndicators(controllerRef.current);
    }

    // Set up ResizeObserver to handle container resizing
    const resizeObserver = new ResizeObserver(entries => {
      if (!entries.length || !containerRef.current) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        controllerRef.current?.resizeToContainer(width, height);
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      if (controllerRef.current) {
        controllerRef.current.destroy();
        controllerRef.current = null;
      }
    };
  }, [symbol, segment]);

  // Load historical candles when they are loaded/updated
  useEffect(() => {
    if (controllerRef.current && candles.length > 0 && !loading) {
      controllerRef.current.loadHistoricalData(candles);
      // Re-apply indicators to refresh historical calculations
      applyActiveIndicators(controllerRef.current);
    }
  }, [candles, loading]);

  // Update chart type
  useEffect(() => {
    if (controllerRef.current) {
      controllerRef.current.setChartType(chartType);
    }
  }, [chartType]);

  // Monitor settings or indicator toggle modifications
  useEffect(() => {
    if (controllerRef.current) {
      applyActiveIndicators(controllerRef.current);
    }
  }, [activeIndicators, settings]);

  // Handle incoming real-time quote feeds
  useEffect(() => {
    if (!liveQuote || !controllerRef.current || loading || candles.length === 0) return;

    const lastPrice = liveQuote.lastPrice || liveQuote.last_price;
    if (!lastPrice) return;

    controllerRef.current.updateLiveTick(lastPrice, Date.now(), timeframe);
  }, [liveQuote, timeframe, loading]);

  const applyActiveIndicators = (ctrl: ChartController) => {
    const manager = ctrl.getIndicatorManager();
    
    // SMA
    if (activeIndicators.sma) {
      manager.addIndicator('sma', new SMAIndicator('sma', { period: settings.smaPeriod, source: 'close' }, 0), ['#2962FF']);
    } else {
      manager.removeIndicator('sma');
    }

    // EMA
    if (activeIndicators.ema) {
      manager.addIndicator('ema', new EMAIndicator('ema', { period: settings.emaPeriod, source: 'close' }, 0), ['#FF6D00']);
    } else {
      manager.removeIndicator('ema');
    }

    // RSI
    if (activeIndicators.rsi) {
      manager.addIndicator('rsi', new RSIIndicator('rsi', { period: settings.rsiPeriod }, 1), ['#9c27b0']);
    } else {
      manager.removeIndicator('rsi');
    }

    // MACD
    if (activeIndicators.macd) {
      manager.addIndicator('macd', new MACDIndicator('macd', {
        fastPeriod: settings.macdFast,
        slowPeriod: settings.macdSlow,
        signalPeriod: settings.macdSignal
      }, 2), ['#2962FF', '#FF6D00', '#26a69a']);
    } else {
      manager.removeIndicator('macd');
    }

    // Re-initialize indicator values over the loaded candle range
    if (candles.length > 0) {
      manager.initialize(candles);
    }
  };

  const handleIndicatorToggle = (key: 'sma' | 'ema' | 'rsi' | 'macd') => {
    setActiveIndicators(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSettingChange = (key: string, value: number) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <div style={{ flex: 1, width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      
      {/* Indicator overlay buttons inside top toolbar area */}
      <div style={{
        position: 'absolute',
        top: '12px',
        right: '12px',
        zIndex: 50,
        display: 'none',
        gap: '6px'
      }}>
        <button
          onClick={() => { setShowSettingsModal(true); setActiveTab('indicators'); }}
          style={{
            background: isDark ? 'rgba(30, 34, 45, 0.8)' : 'rgba(255, 255, 255, 0.8)',
            border: `1px solid ${isDark ? '#2A2E39' : '#E0E3EB'}`,
            borderRadius: '20px',
            padding: '6px 12px',
            fontSize: '11px',
            fontWeight: 700,
            color: isDark ? '#D1D4DC' : '#131722',
            cursor: 'pointer',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 9 L5 5 L8 7 L15 1"/>
          </svg>
          Indicators Settings
        </button>
      </div>

      {loading && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDark ? 'rgba(7, 24, 36, 0.5)' : 'rgba(255, 255, 255, 0.5)' }}>
          <div style={{ color: isDark ? '#D1D4DC' : '#131722', fontSize: '13px', fontWeight: 600 }}>Loading chart data...</div>
        </div>
      )}

      {error && !loading && candles.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ color: '#F23645', fontSize: '13px', fontWeight: 600, maxWidth: '80%', textAlign: 'center' }}>{error}</div>
        </div>
      )}

      {/* Main Chart container target */}
      <div ref={containerRef} style={{ flex: 1, width: '100%' }} />

      {/* Modern Settings Modal */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{
            background: isDark ? '#1e222d' : '#ffffff',
            border: `1px solid ${isDark ? '#2A2E39' : '#E0E3EB'}`,
            borderRadius: '16px',
            width: '90%',
            maxWidth: '380px',
            boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            fontFamily: 'Inter, sans-serif'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              borderBottom: `1px solid ${isDark ? '#2A2E39' : '#E0E3EB'}`,
              padding: '4px 8px',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex' }}>
                <button
                  onClick={() => setActiveTab('indicators')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '12px 16px',
                    color: activeTab === 'indicators' ? '#2962FF' : (isDark ? '#8B92A8' : '#6B7280'),
                    borderBottom: activeTab === 'indicators' ? '2px solid #2962FF' : 'none',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Toggle Indicators
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '12px 16px',
                    color: activeTab === 'settings' ? '#2962FF' : (isDark ? '#8B92A8' : '#6B7280'),
                    borderBottom: activeTab === 'settings' ? '2px solid #2962FF' : 'none',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Configure Periods
                </button>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isDark ? '#D1D4DC' : '#131722',
                  fontSize: '18px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '8px 12px'
                }}
              >
                ×
              </button>
            </div>

            {/* Content body */}
            <div style={{ padding: '16px', maxHeight: '300px', overflowY: 'auto' }}>
              {activeTab === 'indicators' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Object.entries(activeIndicators).map(([key, isActive]) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '10px 14px',
                        background: isDark ? '#151924' : '#F5F7FB',
                        borderRadius: '10px',
                        border: `1px solid ${isDark ? '#2A2E39' : '#E8ECF0'}`
                      }}
                    >
                      <span style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: isDark ? '#D1D4DC' : '#0A2540'
                      }}>
                        {key === 'sma' ? 'Simple Moving Average (SMA)' :
                         key === 'ema' ? 'Exponential Moving Average (EMA)' :
                         key === 'rsi' ? 'Relative Strength Index (RSI)' :
                         'MACD Lines & Histogram'}
                      </span>
                      <button
                        onClick={() => handleIndicatorToggle(key as any)}
                        style={{
                          background: isActive ? '#1db954' : (isDark ? '#2A2E39' : '#E8ECF0'),
                          border: 'none',
                          borderRadius: '12px',
                          color: '#fff',
                          padding: '6px 12px',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          letterSpacing: '0.4px'
                        }}
                      >
                        {isActive ? 'ENABLED' : 'DISABLED'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  
                  {/* SMA settings */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: isDark ? '#8B92A8' : '#555', textTransform: 'uppercase' }}>SMA Period</label>
                    <input
                      type="number"
                      value={settings.smaPeriod}
                      onChange={(e) => handleSettingChange('smaPeriod', Math.max(1, parseInt(e.target.value) || 1))}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${isDark ? '#2A2E39' : '#CBD5E1'}`,
                        background: isDark ? '#151924' : '#ffffff',
                        color: isDark ? '#ffffff' : '#000000',
                        outline: 'none',
                        fontSize: '13px',
                        fontWeight: 700
                      }}
                    />
                  </div>

                  {/* EMA settings */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: isDark ? '#8B92A8' : '#555', textTransform: 'uppercase' }}>EMA Period</label>
                    <input
                      type="number"
                      value={settings.emaPeriod}
                      onChange={(e) => handleSettingChange('emaPeriod', Math.max(1, parseInt(e.target.value) || 1))}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${isDark ? '#2A2E39' : '#CBD5E1'}`,
                        background: isDark ? '#151924' : '#ffffff',
                        color: isDark ? '#ffffff' : '#000000',
                        outline: 'none',
                        fontSize: '13px',
                        fontWeight: 700
                      }}
                    />
                  </div>

                  {/* RSI settings */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: isDark ? '#8B92A8' : '#555', textTransform: 'uppercase' }}>RSI Period</label>
                    <input
                      type="number"
                      value={settings.rsiPeriod}
                      onChange={(e) => handleSettingChange('rsiPeriod', Math.max(1, parseInt(e.target.value) || 1))}
                      style={{
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${isDark ? '#2A2E39' : '#CBD5E1'}`,
                        background: isDark ? '#151924' : '#ffffff',
                        color: isDark ? '#ffffff' : '#000000',
                        outline: 'none',
                        fontSize: '13px',
                        fontWeight: 700
                      }}
                    />
                  </div>

                  {/* MACD settings */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: isDark ? '#8B92A8' : '#555', textTransform: 'uppercase' }}>MACD Parameters (Fast, Slow, Signal)</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="number"
                        placeholder="Fast"
                        value={settings.macdFast}
                        onChange={(e) => handleSettingChange('macdFast', Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          flex: 1,
                          padding: '8px 6px',
                          borderRadius: '8px',
                          border: `1px solid ${isDark ? '#2A2E39' : '#CBD5E1'}`,
                          background: isDark ? '#151924' : '#ffffff',
                          color: isDark ? '#ffffff' : '#000000',
                          outline: 'none',
                          fontSize: '13px',
                          fontWeight: 700,
                          textAlign: 'center'
                        }}
                      />
                      <input
                        type="number"
                        placeholder="Slow"
                        value={settings.macdSlow}
                        onChange={(e) => handleSettingChange('macdSlow', Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          flex: 1,
                          padding: '8px 6px',
                          borderRadius: '8px',
                          border: `1px solid ${isDark ? '#2A2E39' : '#CBD5E1'}`,
                          background: isDark ? '#151924' : '#ffffff',
                          color: isDark ? '#ffffff' : '#000000',
                          outline: 'none',
                          fontSize: '13px',
                          fontWeight: 700,
                          textAlign: 'center'
                        }}
                      />
                      <input
                        type="number"
                        placeholder="Signal"
                        value={settings.macdSignal}
                        onChange={(e) => handleSettingChange('macdSignal', Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          flex: 1,
                          padding: '8px 6px',
                          borderRadius: '8px',
                          border: `1px solid ${isDark ? '#2A2E39' : '#CBD5E1'}`,
                          background: isDark ? '#151924' : '#ffffff',
                          color: isDark ? '#ffffff' : '#000000',
                          outline: 'none',
                          fontSize: '13px',
                          fontWeight: 700,
                          textAlign: 'center'
                        }}
                      />
                    </div>
                  </div>

                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              borderTop: `1px solid ${isDark ? '#2A2E39' : '#E0E3EB'}`,
              padding: '12px 16px',
              textAlign: 'right'
            }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  background: '#2962FF',
                  border: 'none',
                  borderRadius: '30px',
                  color: '#fff',
                  padding: '8px 20px',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Apply & Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
