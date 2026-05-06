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
      // Small delay to ensure rendering completes
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

  return (
    <div className="oc-container">
      <div className="oc-header-titles">
        <div className="oc-col-title">CALLS (CE)</div>
        <div className="oc-col-title center">STRIKE</div>
        <div className="oc-col-title right">PUTS (PE)</div>
      </div>
      
      <div className="oc-rows-container">
        {strikes.map((s) => {
          const ceQuote = getQuote(s.ce?.id);
          const peQuote = getQuote(s.pe?.id);
          
          const isAtm = s.strike === atmStrike?.strike;
          
          return (
            <React.Fragment key={s.strike}>
              
              <div 
                ref={isAtm ? atmRef : null}
                className="oc-data-row"
              >
                {/* Calls side */}
                <div 
                  className="oc-side call-side"
                  onClick={() => s.ce && onTrade(s.ce.symbol, 'BUY')}
                >
                  <div className="oc-price">
                    {ceQuote ? ceQuote.lastPrice.toFixed(2) : '---'}
                  </div>
                  <div className={`oc-change ${ceQuote && ceQuote.changePercent < 0 ? 'neg' : 'pos'}`}>
                    {ceQuote ? `${ceQuote.changePercent > 0 ? '+' : ''}${ceQuote.changePercent.toFixed(2)}` : ''}
                  </div>
                </div>

                {/* Strike Price */}
                <div className="oc-center-strike">
                  <div className="strike-pill">{s.strike.toLocaleString('en-IN')}</div>
                </div>

                {/* Puts side */}
                <div 
                  className="oc-side put-side"
                  onClick={() => s.pe && onTrade(s.pe.symbol, 'BUY')}
                >
                  <div className="oc-price">
                    {peQuote ? peQuote.lastPrice.toFixed(2) : '---'}
                  </div>
                  <div className={`oc-change ${peQuote && peQuote.changePercent < 0 ? 'neg' : 'pos'}`}>
                    {peQuote ? `${peQuote.changePercent > 0 ? '+' : ''}${peQuote.changePercent.toFixed(2)}` : ''}
                  </div>
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <style jsx>{`
        .oc-container {
          display: flex;
          flex-direction: column;
          width: 100%;
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

        .oc-col-title {
          font-size: 0.65rem;
          font-weight: 800;
          color: var(--text-muted);
          letter-spacing: 1px;
          flex: 1;
        }

        .oc-col-title.center { text-align: center; }
        .oc-col-title.right { text-align: right; }

        .oc-rows-container {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .oc-data-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--card-alt-bg);
          border-radius: 40px;
          padding: 12px 24px;
          transition: transform 0.1s;
          border: 1px solid var(--border-light);
        }

        .oc-data-row:active {
          transform: scale(0.98);
        }

        .oc-side {
          display: flex;
          flex-direction: column;
          gap: 4px;
          flex: 1;
          cursor: pointer;
        }

        .call-side { align-items: flex-start; }
        .put-side { align-items: flex-end; text-align: right; }

        .oc-price {
          font-weight: 800;
          font-size: 1.1rem;
          color: var(--text-primary);
          font-family: 'JetBrains Mono', monospace;
        }

        .oc-change {
          font-size: 0.75rem;
          font-weight: 600;
        }

        .pos { color: #22c55e; }
        .neg { color: #ef4444; }

        .oc-center-strike {
          flex: 0 0 auto;
          display: flex;
          justify-content: center;
        }

        .strike-pill {
          background: var(--bg-body);
          color: var(--text-primary);
          padding: 6px 16px;
          border-radius: 20px;
          font-weight: 800;
          font-size: 0.95rem;
          border: 1px solid var(--border-card);
        }

        .oc-price {
          font-weight: 800;
          font-size: 1.1rem;
          color: var(--text-primary);
        }
        :global(body.dark) .strike-pill {
          background: #121212;
          border-color: #252525;
        }
        :global(body.dark) .oc-data-row {
          background: #1c1c1c;
          border-color: #2a2a2a;
        }
      `}</style>
    </div>
  );
}
