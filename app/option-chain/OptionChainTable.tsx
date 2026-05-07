'use client';

import React from 'react';
import { QuoteData } from '@/hooks/useKiteQuotes';
import { calculateGreeks, calculateIV } from '@/lib/greeks';

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
  expiryDate: string | null;
  onTrade: (symbol: string, side: 'BUY' | 'SELL') => void;
}

export default function OptionChainTable({ strikes, quotes, spotPrice, expiryDate, onTrade }: OptionChainTableProps) {
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
      setTimeout(() => {
        if (atmRef.current) {
          atmRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
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

  const T = React.useMemo(() => {
    if (!expiryDate) return 0;
    const exp = new Date(expiryDate);
    exp.setHours(15, 30, 0, 0);
    const now = new Date();
    const diff = exp.getTime() - now.getTime();
    return Math.max(0, diff / (1000 * 60 * 60 * 24 * 365));
  }, [expiryDate]);

  return (
    <div className="oc-container">
      {/* Table Headers */}
      <div className="oc-header-titles desktop-only">
        <div className="oc-h-cell">DELTA</div>
        <div className="oc-h-cell">IV</div>
        <div className="oc-h-cell">VOLUME</div>
        <div className="oc-h-cell">CALLS (CE)</div>
        <div className="oc-h-cell strike-label">STRIKE</div>
        <div className="oc-h-cell">PUTS (PE)</div>
        <div className="oc-h-cell">VOLUME</div>
        <div className="oc-h-cell">IV</div>
        <div className="oc-h-cell">DELTA</div>
      </div>

      <div className="oc-header-titles mobile-only">
        <div className="oc-col-title">CALLS (CE)</div>
        <div className="oc-col-title center">STRIKE</div>
        <div className="oc-col-title right">PUTS (PE)</div>
      </div>
      
      <div className="oc-rows-container">
        {strikes.map((s) => {
          const ceQuote = getQuote(s.ce?.id);
          const peQuote = getQuote(s.pe?.id);
          const isCeITM = isITM(s.strike, 'CE');
          const isPeITM = isITM(s.strike, 'PE');
          const isAtm = s.strike === atmStrike?.strike;

          // Greeks Calculation
          let ceIV = 0, ceDelta = 0;
          let peIV = 0, peDelta = 0;

          if (spotPrice > 0 && T > 0) {
            if (ceQuote && ceQuote.lastPrice > 0) {
              ceIV = calculateIV(ceQuote.lastPrice, spotPrice, s.strike, T, 0.1, 'CE');
              ceDelta = calculateGreeks(spotPrice, s.strike, T, 0.1, ceIV, 'CE').delta;
            }
            if (peQuote && peQuote.lastPrice > 0) {
              peIV = calculateIV(peQuote.lastPrice, spotPrice, s.strike, T, 0.1, 'PE');
              peDelta = calculateGreeks(spotPrice, s.strike, T, 0.1, peIV, 'PE').delta;
            }
          }

          return (
            <div 
              key={s.strike} 
              ref={isAtm ? atmRef : null}
              className={`oc-data-row ${isAtm ? 'atm-row' : ''}`}
            >
              {/* Desktop Greeks (CE) */}
              <div className={`oc-cell greek-cell desktop-only ${isCeITM ? 'itm' : ''}`}>
                <span>{ceDelta !== 0 ? ceDelta.toFixed(2) : '---'}</span>
              </div>
              <div className={`oc-cell greek-cell desktop-only ${isCeITM ? 'itm' : ''}`}>
                <span>{ceIV !== 0 ? (ceIV * 100).toFixed(1) : '---'}</span>
              </div>
              <div className={`oc-cell vol-cell desktop-only ${isCeITM ? 'itm' : ''}`}>
                <span>{ceQuote ? formatVolume(ceQuote.volume) : '---'}</span>
              </div>

              {/* Calls Side */}
              <div 
                className={`oc-side call-side ${isCeITM ? 'itm' : ''}`}
                onClick={() => s.ce && onTrade(s.ce.symbol, 'BUY')}
              >
                <div className="oc-price">
                  {ceQuote ? ceQuote.lastPrice.toFixed(2) : '---'}
                </div>
                <div className={`oc-change ${ceQuote && ceQuote.changePercent < 0 ? 'neg' : 'pos'}`}>
                  {ceQuote ? `${ceQuote.changePercent > 0 ? '+' : ''}${ceQuote.changePercent.toFixed(2)}%` : ''}
                </div>
              </div>

              {/* Strike Price */}
              <div className="oc-center-strike">
                <div className="strike-pill">{s.strike.toLocaleString('en-IN')}</div>
              </div>

              {/* Puts Side */}
              <div 
                className={`oc-side put-side ${isPeITM ? 'itm' : ''}`}
                onClick={() => s.pe && onTrade(s.pe.symbol, 'BUY')}
              >
                <div className="oc-price">
                  {peQuote ? peQuote.lastPrice.toFixed(2) : '---'}
                </div>
                <div className={`oc-change ${peQuote && peQuote.changePercent < 0 ? 'neg' : 'pos'}`}>
                  {peQuote ? `${peQuote.changePercent > 0 ? '+' : ''}${peQuote.changePercent.toFixed(2)}%` : ''}
                </div>
              </div>

              {/* Desktop Greeks (PE) */}
              <div className={`oc-cell vol-cell desktop-only ${isPeITM ? 'itm' : ''}`}>
                <span>{peQuote ? formatVolume(peQuote.volume) : '---'}</span>
              </div>
              <div className={`oc-cell greek-cell desktop-only ${isPeITM ? 'itm' : ''}`}>
                <span>{peIV !== 0 ? (peIV * 100).toFixed(1) : '---'}</span>
              </div>
              <div className={`oc-cell greek-cell desktop-only ${isPeITM ? 'itm' : ''}`}>
                <span>{peDelta !== 0 ? Math.abs(peDelta).toFixed(2) : '---'}</span>
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
          padding-bottom: 40px;
        }

        .oc-header-titles {
          display: flex;
          justify-content: space-between;
          padding: 8px 16px 16px 16px;
          position: sticky;
          top: 0;
          background: var(--bg-body);
          z-index: 10;
        }

        .oc-h-cell, .oc-col-title {
          font-size: 0.65rem;
          font-weight: 800;
          color: var(--text-muted);
          letter-spacing: 1px;
          flex: 1;
          text-align: center;
        }

        .oc-h-cell.strike-label {
          color: var(--text-primary);
          font-weight: 900;
        }

        .oc-rows-container {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .oc-data-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--card-bg);
          border-radius: 40px;
          padding: 8px 12px;
          transition: all 0.2s;
          border: 1px solid var(--border-light);
        }

        .atm-row {
          border: 1px solid var(--accent-color);
          background: rgba(var(--accent-rgb), 0.05);
        }

        .oc-cell, .oc-side {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4px;
        }

        .greek-cell, .vol-cell {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .itm {
          background: rgba(var(--accent-rgb), 0.05);
        }

        .oc-side {
          cursor: pointer;
          border-radius: 20px;
        }

        .oc-side:hover {
          background: rgba(var(--text-primary-rgb), 0.05);
        }

        .call-side { align-items: flex-end; padding-right: 12px; }
        .put-side { align-items: flex-start; padding-left: 12px; }

        .oc-price {
          font-weight: 800;
          font-size: 1rem;
          color: var(--text-primary);
          font-family: 'JetBrains Mono', monospace;
        }

        .oc-change {
          font-size: 0.7rem;
          font-weight: 700;
        }

        .pos { color: #22c55e; }
        .neg { color: #ef4444; }

        .oc-center-strike {
          flex: 0 0 100px;
          display: flex;
          justify-content: center;
          z-index: 5;
        }

        .strike-pill {
          background: var(--card-alt-bg);
          color: var(--text-primary);
          padding: 6px 0;
          width: 80px;
          text-align: center;
          border-radius: 20px;
          font-weight: 900;
          font-size: 0.9rem;
          border: 1px solid var(--border-light);
          box-shadow: var(--shadow-sm);
        }

        /* Responsive Visibility */
        .desktop-only { display: none; }
        .mobile-only { display: flex; }

        @media (min-width: 1024px) {
          .desktop-only { display: flex; }
          .mobile-only { display: none; }
          
          .oc-data-row {
            grid-template-columns: 70px 70px 80px 1fr 100px 1fr 80px 70px 70px;
            border-radius: 4px;
            padding: 4px 0;
          }

          .oc-side {
            flex: 2;
          }

          .strike-pill {
            width: 90px;
            background: var(--bg-body);
          }
        }

        :global(body.dark) .oc-data-row {
          background: #1c1c1c;
          border-color: #2a2a2a;
        }
        :global(body.dark) .itm {
          background: rgba(255, 255, 255, 0.03);
        }
      `}</style>
    </div>
  );
}
