import React, { useEffect, useRef, useState } from 'react';
// import type { IChartingLibraryWidget } from '@/public/charting_library/charting_library';
import { Datafeed } from '@/lib/datafeed/Datafeed';
import { toUdfResolution, CHART_TYPE_MAP } from '@/lib/datafeed/resolutionUtils';
import { Candle, Timeframe } from '@/components/chart/types';

// ─── Supporting types ────────────────────────────────────────────────────────

interface PendingChanges {
  symbol?: string;
  timeframe?: Timeframe;
  chartType?: 'candle' | 'area' | 'bar' | 'baseline';
  theme?: 'dark' | 'light';
  indicators?: boolean;
}

type IndicatorKey = 'sma' | 'ema' | 'rsi' | 'macd';
type IndicatorEntityIds = Record<IndicatorKey, string | null>;

// ─── Props interface (must match TradingChart.tsx exactly) ───────────────────

interface ChartContainerProps {
  symbol: string;
  segment: string;
  timeframe: Timeframe;
  chartType: 'candle' | 'area' | 'bar' | 'baseline';
  candles: Candle[];
  liveQuote?: any;
  loading: boolean;
  error: string | null;
  activeIndicators: { sma: boolean; ema: boolean; rsi: boolean; macd: boolean };
  setActiveIndicators: React.Dispatch<React.SetStateAction<{ sma: boolean; ema: boolean; rsi: boolean; macd: boolean }>>;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getIsDark(): boolean {
  if (typeof document === 'undefined') return true;
  return (
    document.body.classList.contains('dark') ||
    document.body.classList.contains('black')
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  setShowSettingsModal,
}: ChartContainerProps) {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const containerRef  = useRef<HTMLDivElement>(null);
  const tvWidgetRef   = useRef<any | null>(null);
  const datafeedRef   = useRef<Datafeed | null>(null);
  const isReadyRef    = useRef(false);
  const pendingRef    = useRef<PendingChanges>({});
  const entityIdsRef  = useRef<IndicatorEntityIds>({ sma: null, ema: null, rsi: null, macd: null });
  const initTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── State (drives overlay rendering only) ─────────────────────────────────
  const [chartStatus, setChartStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [chartError,  setChartError]  = useState<string | null>(null);
  const [isDark,      setIsDark]      = useState(getIsDark);
  const [activeTab,   setActiveTab]   = useState<'indicators' | 'settings'>('indicators');

  // ── Study name / input config ─────────────────────────────────────────────
  const studyConfig: Record<IndicatorKey, { name: string; inputs: Record<string, number> }> = {
    sma:  { name: 'Moving Average',              inputs: { length: settings.smaPeriod } },
    ema:  { name: 'Moving Average Exponential',  inputs: { length: settings.emaPeriod } },
    rsi:  { name: 'Relative Strength Index',     inputs: { length: settings.rsiPeriod } },
    macd: { name: 'MACD',                        inputs: { fast_length: settings.macdFast, slow_length: settings.macdSlow, signal_smoothing: settings.macdSignal } },
  };

  // ── syncIndicators ────────────────────────────────────────────────────────
  /**
   * Reconciles the active indicators state with the live TradingView chart.
   * Must only be called when isReadyRef.current === true.
   */
  const syncIndicators = () => {
    const chart = tvWidgetRef.current?.chart();
    if (!chart) return;

    (Object.keys(studyConfig) as IndicatorKey[]).forEach((key) => {
      const isActive  = activeIndicators[key];
      const entityId  = entityIdsRef.current[key];
      const { name, inputs } = studyConfig[key];

      if (isActive && entityId === null) {
        // Add study
        chart.createStudy(name, false, false, inputs).then((id) => {
          entityIdsRef.current[key] = id ?? null;
        });
      } else if (!isActive && entityId !== null) {
        // Remove study
        chart.removeEntity(entityId as any);
        entityIdsRef.current[key] = null;
      } else if (isActive && entityId !== null) {
        // Settings changed: remove then re-add
        chart.removeEntity(entityId as any);
        entityIdsRef.current[key] = null;
        chart.createStudy(name, false, false, inputs).then((id) => {
          entityIdsRef.current[key] = id ?? null;
        });
      }
    });
  };

  // ── Task 8.2: Widget initialization — runs ONCE on mount ─────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const initWidget = () => {
      if (!containerRef.current || tvWidgetRef.current) return;

      datafeedRef.current = new Datafeed(segment);

      let savedData;
      try {
        const stored = localStorage.getItem('marginapexx_tv_layout');
        if (stored) {
          savedData = JSON.parse(stored);
        }
      } catch (e) {
        console.error('Failed to parse saved chart layout:', e);
      }

      tvWidgetRef.current = new window.TradingView.widget({
        container:    containerRef.current,
        symbol,
        interval:     toUdfResolution(timeframe) as any,
        datafeed:     datafeedRef.current,
        library_path: '/charting_library/',
        locale:       'en',
        timezone:     'Asia/Kolkata',
        theme:        isDark ? 'dark' : 'light',
        autosize:     true,
        saved_data:   savedData,
        client_id:    'marginapexx',
        user_id:      'public_user',
        disabled_features: ['header_widget'],
      });

      tvWidgetRef.current.onChartReady(onChartReady);
    };

    const onChartReady = () => {
      if (initTimerRef.current) {
        clearTimeout(initTimerRef.current);
        initTimerRef.current = null;
      }
      isReadyRef.current = true;
      setChartStatus('ready');

      // Drain the pending queue
      const pending = pendingRef.current;
      if (pending.symbol) {
        tvWidgetRef.current?.chart().setSymbol(pending.symbol);
      }
      if (pending.timeframe) {
        tvWidgetRef.current?.chart().setResolution(toUdfResolution(pending.timeframe) as any);
      }
      if (pending.chartType) {
        tvWidgetRef.current?.chart().setChartType(CHART_TYPE_MAP[pending.chartType] as any);
      }
      if (pending.theme) {
        tvWidgetRef.current?.changeTheme(pending.theme);
      }
      if (pending.indicators) {
        syncIndicators();
      }
      pendingRef.current = {};

      // Subscribe to auto save needed event
      tvWidgetRef.current?.subscribe('onAutoSaveNeeded', () => {
        tvWidgetRef.current?.save((state: any) => {
          try {
            localStorage.setItem('marginapexx_tv_layout', JSON.stringify(state));
          } catch (e) {
            console.error('Failed to save chart layout:', e);
          }
        });
      });
    };

    // Arm 30-second timeout
    initTimerRef.current = setTimeout(() => {
      setChartStatus('error');
      setChartError('Chart failed to initialize. Please refresh the page.');
    }, 30_000);

    if (window.TradingView) {
      initWidget();
    } else {
      const script = document.createElement('script');
      script.src = '/charting_library/charting_library.standalone.js';
      script.onload = initWidget;
      document.head.appendChild(script);
    }

    return () => {
      if (initTimerRef.current) {
        clearTimeout(initTimerRef.current);
        initTimerRef.current = null;
      }
      tvWidgetRef.current?.remove();
      tvWidgetRef.current = null;
      datafeedRef.current = null;
      isReadyRef.current  = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Task 8.3: symbol, timeframe, chartType effects ───────────────────────

  useEffect(() => {
    if (!isReadyRef.current) { pendingRef.current.symbol = symbol; return; }
    tvWidgetRef.current?.chart().setSymbol(symbol);
  }, [symbol]);

  useEffect(() => {
    if (!isReadyRef.current) { pendingRef.current.timeframe = timeframe; return; }
    tvWidgetRef.current?.chart().setResolution(toUdfResolution(timeframe) as any);
  }, [timeframe]);

  useEffect(() => {
    if (!isReadyRef.current) { pendingRef.current.chartType = chartType; return; }
    tvWidgetRef.current?.chart().setChartType(CHART_TYPE_MAP[chartType] as any);
  }, [chartType]);

  // ── Task 8.4: syncIndicators effect ──────────────────────────────────────

  useEffect(() => {
    if (!isReadyRef.current) { pendingRef.current.indicators = true; return; }
    syncIndicators();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndicators, settings]);

  // ── Task 8.5: Live quote forwarding ──────────────────────────────────────

  useEffect(() => {
    const lastPrice = liveQuote?.lastPrice ?? liveQuote?.last_price;
    if (loading || candles.length === 0) return;
    if (!lastPrice || !isFinite(lastPrice) || lastPrice <= 0) return;
    datafeedRef.current?.updateLive(lastPrice, Date.now());
  }, [liveQuote]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Task 8.5: Theme sync via MutationObserver ─────────────────────────────

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const dark = getIsDark();
      setIsDark(dark);
      const theme = dark ? 'dark' : 'light';
      if (!isReadyRef.current) { pendingRef.current.theme = theme; return; }
      tvWidgetRef.current?.changeTheme(theme);
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // ── Indicator / settings helper fns (for modal UI) ───────────────────────

  const handleIndicatorToggle = (key: IndicatorKey) => {
    setActiveIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSettingChange = (key: string, value: number) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  // ── Task 8.6: Render ──────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative', flex: 1, width: '100%', height: '100%' }}>

      {/* Widget mount target */}
      <div ref={containerRef} style={{ flex: 1, width: '100%', height: '100%' }} />

      {/* Loading overlay */}
      {chartStatus === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isDark ? 'rgba(7, 24, 36, 0.85)' : 'rgba(255, 255, 255, 0.85)',
        }}>
          <div style={{ color: isDark ? '#D1D4DC' : '#131722', fontSize: '13px', fontWeight: 600 }}>
            Loading chart data...
          </div>
        </div>
      )}

      {/* Error overlay (widget-level error or timeout) */}
      {chartStatus === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ color: '#F23645', fontSize: '13px', fontWeight: 600, maxWidth: '80%', textAlign: 'center' }}>
            {chartError}
          </div>
        </div>
      )}

      {/* Error prop text (data fetch error — no candles yet) */}
      {error !== null && !loading && candles.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ color: '#F23645', fontSize: '13px', fontWeight: 600, maxWidth: '80%', textAlign: 'center' }}>
            {error}
          </div>
        </div>
      )}

      {/* Settings modal */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)', zIndex: 99999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(2px)',
        }}>
          <div style={{
            background: isDark ? '#1e222d' : '#ffffff',
            border: `1px solid ${isDark ? '#2A2E39' : '#E0E3EB'}`,
            borderRadius: '16px',
            width: '90%', maxWidth: '380px',
            boxShadow: '0 12px 36px rgba(0,0,0,0.3)',
            overflow: 'hidden',
            fontFamily: 'Inter, sans-serif',
          }}>
            {/* Modal header / tabs */}
            <div style={{
              display: 'flex',
              borderBottom: `1px solid ${isDark ? '#2A2E39' : '#E0E3EB'}`,
              padding: '4px 8px',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex' }}>
                <button
                  onClick={() => setActiveTab('indicators')}
                  style={{
                    background: 'none', border: 'none',
                    padding: '12px 16px',
                    color: activeTab === 'indicators' ? '#2962FF' : (isDark ? '#8B92A8' : '#6B7280'),
                    borderBottom: activeTab === 'indicators' ? '2px solid #2962FF' : 'none',
                    fontWeight: 700, cursor: 'pointer', fontSize: '13px',
                  }}
                >
                  Toggle Indicators
                </button>
                <button
                  onClick={() => setActiveTab('settings')}
                  style={{
                    background: 'none', border: 'none',
                    padding: '12px 16px',
                    color: activeTab === 'settings' ? '#2962FF' : (isDark ? '#8B92A8' : '#6B7280'),
                    borderBottom: activeTab === 'settings' ? '2px solid #2962FF' : 'none',
                    fontWeight: 700, cursor: 'pointer', fontSize: '13px',
                  }}
                >
                  Configure Periods
                </button>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  background: 'none', border: 'none',
                  color: isDark ? '#D1D4DC' : '#131722',
                  fontSize: '18px', fontWeight: 600, cursor: 'pointer',
                  padding: '8px 12px',
                }}
              >
                ×
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '16px', maxHeight: '300px', overflowY: 'auto' }}>
              {activeTab === 'indicators' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {(Object.entries(activeIndicators) as [IndicatorKey, boolean][]).map(([key, isActive]) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '10px 14px',
                        background: isDark ? '#151924' : '#F5F7FB',
                        borderRadius: '10px',
                        border: `1px solid ${isDark ? '#2A2E39' : '#E8ECF0'}`,
                      }}
                    >
                      <span style={{
                        fontSize: '13px', fontWeight: 700,
                        textTransform: 'uppercase',
                        color: isDark ? '#D1D4DC' : '#0A2540',
                      }}>
                        {key === 'sma'  ? 'Simple Moving Average (SMA)'     :
                         key === 'ema'  ? 'Exponential Moving Average (EMA)' :
                         key === 'rsi'  ? 'Relative Strength Index (RSI)'    :
                                          'MACD Lines & Histogram'}
                      </span>
                      <button
                        onClick={() => handleIndicatorToggle(key)}
                        style={{
                          background: isActive ? '#1db954' : (isDark ? '#2A2E39' : '#E8ECF0'),
                          border: 'none', borderRadius: '12px',
                          color: '#fff', padding: '6px 12px',
                          fontSize: '10px', fontWeight: 700,
                          cursor: 'pointer', letterSpacing: '0.4px',
                        }}
                      >
                        {isActive ? 'ENABLED' : 'DISABLED'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {/* SMA */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: isDark ? '#8B92A8' : '#555', textTransform: 'uppercase' }}>
                      SMA Period
                    </label>
                    <input
                      type="number"
                      value={settings.smaPeriod}
                      onChange={(e) => handleSettingChange('smaPeriod', Math.max(1, parseInt(e.target.value) || 1))}
                      style={{
                        padding: '8px 12px', borderRadius: '8px',
                        border: `1px solid ${isDark ? '#2A2E39' : '#CBD5E1'}`,
                        background: isDark ? '#151924' : '#ffffff',
                        color: isDark ? '#ffffff' : '#000000',
                        outline: 'none', fontSize: '13px', fontWeight: 700,
                      }}
                    />
                  </div>
                  {/* EMA */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: isDark ? '#8B92A8' : '#555', textTransform: 'uppercase' }}>
                      EMA Period
                    </label>
                    <input
                      type="number"
                      value={settings.emaPeriod}
                      onChange={(e) => handleSettingChange('emaPeriod', Math.max(1, parseInt(e.target.value) || 1))}
                      style={{
                        padding: '8px 12px', borderRadius: '8px',
                        border: `1px solid ${isDark ? '#2A2E39' : '#CBD5E1'}`,
                        background: isDark ? '#151924' : '#ffffff',
                        color: isDark ? '#ffffff' : '#000000',
                        outline: 'none', fontSize: '13px', fontWeight: 700,
                      }}
                    />
                  </div>
                  {/* RSI */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: isDark ? '#8B92A8' : '#555', textTransform: 'uppercase' }}>
                      RSI Period
                    </label>
                    <input
                      type="number"
                      value={settings.rsiPeriod}
                      onChange={(e) => handleSettingChange('rsiPeriod', Math.max(1, parseInt(e.target.value) || 1))}
                      style={{
                        padding: '8px 12px', borderRadius: '8px',
                        border: `1px solid ${isDark ? '#2A2E39' : '#CBD5E1'}`,
                        background: isDark ? '#151924' : '#ffffff',
                        color: isDark ? '#ffffff' : '#000000',
                        outline: 'none', fontSize: '13px', fontWeight: 700,
                      }}
                    />
                  </div>
                  {/* MACD */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11px', fontWeight: 700, color: isDark ? '#8B92A8' : '#555', textTransform: 'uppercase' }}>
                      MACD Parameters (Fast, Slow, Signal)
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="number" placeholder="Fast"
                        value={settings.macdFast}
                        onChange={(e) => handleSettingChange('macdFast', Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          flex: 1, padding: '8px 6px', borderRadius: '8px',
                          border: `1px solid ${isDark ? '#2A2E39' : '#CBD5E1'}`,
                          background: isDark ? '#151924' : '#ffffff',
                          color: isDark ? '#ffffff' : '#000000',
                          outline: 'none', fontSize: '13px', fontWeight: 700, textAlign: 'center',
                        }}
                      />
                      <input
                        type="number" placeholder="Slow"
                        value={settings.macdSlow}
                        onChange={(e) => handleSettingChange('macdSlow', Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          flex: 1, padding: '8px 6px', borderRadius: '8px',
                          border: `1px solid ${isDark ? '#2A2E39' : '#CBD5E1'}`,
                          background: isDark ? '#151924' : '#ffffff',
                          color: isDark ? '#ffffff' : '#000000',
                          outline: 'none', fontSize: '13px', fontWeight: 700, textAlign: 'center',
                        }}
                      />
                      <input
                        type="number" placeholder="Signal"
                        value={settings.macdSignal}
                        onChange={(e) => handleSettingChange('macdSignal', Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          flex: 1, padding: '8px 6px', borderRadius: '8px',
                          border: `1px solid ${isDark ? '#2A2E39' : '#CBD5E1'}`,
                          background: isDark ? '#151924' : '#ffffff',
                          color: isDark ? '#ffffff' : '#000000',
                          outline: 'none', fontSize: '13px', fontWeight: 700, textAlign: 'center',
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{
              borderTop: `1px solid ${isDark ? '#2A2E39' : '#E0E3EB'}`,
              padding: '12px 16px', textAlign: 'right',
            }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  background: '#2962FF', border: 'none', borderRadius: '30px',
                  color: '#fff', padding: '8px 20px',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Apply &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
