'use client';

import React from 'react';
import { QuoteData } from '@/hooks/useKiteQuotes';

interface StrikeData {
  strike: number;
  ce?: {
    token: number;
    symbol: string;
    id: string;
  };
  pe?: {
    token: number;
    symbol: string;
    id: string;
  };
}

interface OptionChainTableProps {
  strikes: StrikeData[];
  quotes: Record<string, QuoteData>;
  spotPrice: number;
  onTrade: (symbol: string, side: 'BUY' | 'SELL') => void;
}

export default function OptionChainTable({ strikes, quotes, spotPrice, onTrade }: OptionChainTableProps) {
  const atmRef = React.useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = React.useState(false);

  // Find the strike closest to spot price
  const atmStrike = React.useMemo(() => {
    if (spotPrice <= 0 || strikes.length === 0) return null;
    return strikes.reduce((prev, curr) => {
      return (Math.abs(curr.strike - spotPrice) < Math.abs(prev.strike - spotPrice) ? curr : prev);
    });
  }, [strikes, spotPrice]);

  // Scroll to ATM only once per expiry change
  React.useEffect(() => {
    if (atmRef.current && !hasScrolled) {
      atmRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHasScrolled(true);
    }
  }, [atmStrike?.strike, hasScrolled]);

  // Reset scroll flag when strikes (expiry) change
  React.useEffect(() => {
    setHasScrolled(false);
  }, [strikes]);

  const getQuote = (id?: string) => {
    if (!id) return null;
    return quotes[id] || null;
  };

  const isITM = (strike: number, type: 'CE' | 'PE') => {
    if (spotPrice <= 0) return false;
    if (type === 'CE') return strike < spotPrice;
    return strike > spotPrice;
  };

  const formatVolume = (v: number) => {
    if (!v || v <= 0) return '0';
    if (v >= 10000000) return (v / 10000000).toFixed(2) + ' Cr';
    if (v >= 100000) return (v / 100000).toFixed(2) + ' L';
    if (v >= 1000) return (v / 1000).toFixed(1) + ' K';
    return v.toString();
  };

  return (
    <div className="oc-container">
      <div className="oc-header">
        <div className="oc-h-cell desktop-only">VOL</div>
        <div className="oc-h-cell">CALLS</div>
        <div className="oc-h-cell strike-label">STRIKE</div>
        <div className="oc-h-cell">PUTS</div>
        <div className="oc-h-cell desktop-only">VOL</div>
      </div>
      
      <div className="oc-rows">
        {strikes.map((s) => {
          const ceQuote = getQuote(s.ce?.id);
          const peQuote = getQuote(s.pe?.id);
          
          const isCeITM = isITM(s.strike, 'CE');
          const isPeITM = isITM(s.strike, 'PE');

          return (
            <div 
              key={s.strike} 
              ref={s.strike === atmStrike?.strike ? atmRef : null}
              className="oc-row"
            >
              {/* Call Volume (Desktop Only) */}
              <div className={`oc-cell vol-cell desktop-only ${isCeITM ? 'itm' : ''}`}>
                <span className="vol-val">{ceQuote ? formatVolume(ceQuote.volume) : '---'}</span>
              </div>

              {/* Call Data */}
              <div 
                className={`oc-cell call-side ${isCeITM ? 'itm' : ''}`}
                onClick={() => s.ce && onTrade(s.ce.symbol, 'BUY')}
              >
                <div className="oc-val-grp">
                  <span className={`oc-price ${ceQuote && ceQuote.changePercent < 0 ? 'neg' : 'pos'}`}>
                    {ceQuote ? ceQuote.lastPrice.toFixed(2) : '---'}
                  </span>
                  <span className="oc-pct">
                    {ceQuote ? `${ceQuote.changePercent > 0 ? '+' : ''}${ceQuote.changePercent}%` : ''}
                  </span>
                </div>
              </div>

              {/* Strike Price */}
              <div className="oc-cell strike-side">
                <span className="strike-val">{s.strike}</span>
              </div>

              {/* Put Data */}
              <div 
                className={`oc-cell put-side ${isPeITM ? 'itm' : ''}`}
                onClick={() => s.pe && onTrade(s.pe.symbol, 'BUY')}
              >
                <div className="oc-val-grp">
                  <span className={`oc-price ${peQuote && peQuote.changePercent < 0 ? 'neg' : 'pos'}`}>
                    {peQuote ? peQuote.lastPrice.toFixed(2) : '---'}
                  </span>
                  <span className="oc-pct">
                    {peQuote ? `${peQuote.changePercent > 0 ? '+' : ''}${peQuote.changePercent}%` : ''}
                  </span>
                </div>
              </div>

              {/* Put Volume (Desktop Only) */}
              <div className={`oc-cell vol-cell desktop-only ${isPeITM ? 'itm' : ''}`}>
                <span className="vol-val">{peQuote ? formatVolume(peQuote.volume) : '---'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <style jsx>{`
        .oc-container {
          display: flex;
          flex-direction: column;
          width: 100%;
          background: var(--card-bg);
          border-radius: 20px;
          overflow: hidden;
          box-shadow: var(--shadow-sm);
          border: 1px solid var(--border-light);
        }

        .oc-header {
          display: grid;
          grid-template-columns: 1fr 90px 1fr;
          background: var(--card-alt-bg);
          border-bottom: 1px solid var(--border-light);
          padding: 14px 0;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .oc-h-cell {
          font-size: 0.65rem;
          font-weight: 800;
          color: var(--text-muted);
          text-align: center;
          letter-spacing: 1.5px;
        }

        .strike-label {
          color: #C62E2E;
        }

        .oc-rows {
          display: flex;
          flex-direction: column;
        }

        .oc-row {
          display: grid;
          grid-template-columns: 1fr 90px 1fr;
          border-bottom: 1px solid var(--border-light);
          min-height: 58px;
          transition: background 0.15s ease;
        }

        .oc-cell {
          display: flex;
          align-items: center;
          padding: 8px 16px;
          cursor: pointer;
        }

        .desktop-only { display: none; }

        @media (min-width: 1024px) {
          .oc-header, .oc-row {
            grid-template-columns: 80px 1fr 100px 1fr 80px;
          }
          .desktop-only { display: flex; }
          .vol-cell {
            justify-content: center;
            font-size: 0.75rem;
            color: var(--text-secondary);
            font-weight: 500;
          }
          .vol-val {
              font-family: 'JetBrains Mono', monospace;
              opacity: 0.8;
          }
        }

        .call-side { justify-content: flex-end; text-align: right; }
        .put-side { justify-content: flex-start; text-align: left; }

        .strike-side {
          justify-content: center;
          background: var(--card-alt-bg);
          border-left: 1px solid var(--border-light);
          border-right: 1px solid var(--border-light);
        }

        .strike-val {
          font-weight: 800;
          font-size: 0.9rem;
          color: var(--text-primary);
        }

        .itm { background: rgba(44, 142, 90, 0.04); }
        :global(body.dark) .itm { background: rgba(74, 222, 128, 0.06); }

        .oc-val-grp { display: flex; flex-direction: column; gap: 2px; }
        .oc-price { font-weight: 700; font-size: 0.95rem; font-family: 'JetBrains Mono', monospace; }
        .oc-pct { font-size: 0.65rem; font-weight: 700; color: var(--text-muted); }

        .pos { color: var(--positive-text); }
        .neg { color: var(--negative-text); }

        .oc-row:hover { background: var(--card-alt-bg); }
      `}</style>
    </div>
  );
}
