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
  priceMode?: 'BA' | 'LTP';
}

export default function OptionChainTable({ strikes, quotes, spotPrice, onTrade, priceMode = 'LTP' }: OptionChainTableProps) {
  const atmRef = React.useRef<HTMLDivElement>(null);
  const tableHeaderRef = React.useRef<HTMLDivElement>(null);
  const [hasScrolled, setHasScrolled] = React.useState(false);
  const [subheadFloating, setSubheadFloating] = React.useState(false);

  const atmStrike = React.useMemo(() => {
    if (spotPrice <= 0 || strikes.length === 0) return null;
    return strikes.reduce((prev, curr) =>
      Math.abs(curr.strike - spotPrice) < Math.abs(prev.strike - spotPrice) ? curr : prev
    );
  }, [strikes, spotPrice]);

  React.useEffect(() => {
    if (atmRef.current && !hasScrolled) {
      setTimeout(() => {
        atmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      setHasScrolled(true);
    }
  }, [atmStrike?.strike, hasScrolled]);

  React.useEffect(() => {
    setHasScrolled(false);
  }, [strikes]);

  // Detect when CALLS/STRIKE/PUTS header scrolls out of view
  React.useEffect(() => {
    const scrollEl = tableHeaderRef.current?.closest('.main-content') as HTMLElement | null;
    if (!scrollEl) return;
    const onScroll = () => {
      if (!tableHeaderRef.current) return;
      const rect = tableHeaderRef.current.getBoundingClientRect();
      setSubheadFloating(rect.bottom <= 58);
    };
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollEl.removeEventListener('scroll', onScroll);
  }, []);

  const getQuote = (id?: string, token?: number) => {
    if (!id && !token) return null;
    if (id && quotes[id]) return quotes[id];
    if (token && quotes[String(token)]) return quotes[String(token)];
    
    if (id) {
      const parts = id.split(':');
      const symbolOnly = parts.length > 1 ? parts[1] : id;
      if (quotes[symbolOnly]) return quotes[symbolOnly];
    }
    
    return null;
  };

  return (
    <div className="oct-wrap">
      {/* Single outer container */}
      <div className="oct-table">

        {/* ── Header row (scrolls away) ── */}
        <div className="oct-head" ref={tableHeaderRef}>
          <div className="oct-head-calls">{priceMode === 'LTP' ? 'CALL LTP' : 'CALLS'}</div>
          <div className="oct-head-strike">STRIKE</div>
          <div className="oct-head-puts">{priceMode === 'LTP' ? 'PUT LTP' : 'PUTS'}</div>
        </div>

        {/* ── Sub-header: sticky ── */}
        <div className={`oct-subhead${subheadFloating ? ' floating' : ''}`}>
          <div className="oct-sub-calls">
            {priceMode === 'BA' ? <><span>BID</span><span>ASK</span></> : <span>LTP</span>}
          </div>
          <div className="oct-sub-strike">₹</div>
          <div className="oct-sub-puts">
            {priceMode === 'BA' ? <><span>BID</span><span>ASK</span></> : <span>LTP</span>}
          </div>
        </div>

        {/* ── Data rows ── */}
        <div className="oct-body">
          {strikes.map((s) => {
            const ceQuote = getQuote(s.ce?.id, s.ce?.token);
            const peQuote = getQuote(s.pe?.id, s.pe?.token);
            const isAtm = s.strike === atmStrike?.strike;

            const ceBid = ceQuote ? (ceQuote.lastPrice - 0.05).toFixed(1) : '---';
            const ceAsk = ceQuote ? (ceQuote.lastPrice + 0.05).toFixed(1) : '---';
            const peBid = peQuote ? (peQuote.lastPrice - 0.05).toFixed(1) : '---';
            const peAsk = peQuote ? (peQuote.lastPrice + 0.05).toFixed(1) : '---';

            const ceLtp = ceQuote ? `₹${ceQuote.lastPrice.toFixed(1)}` : '---';
            const peLtp = peQuote ? `₹${peQuote.lastPrice.toFixed(1)}` : '---';

            return (
              <div
                key={s.strike}
                ref={isAtm ? atmRef : null}
                className={`oct-row${isAtm ? ' atm' : ''}`}
              >
                {/* Calls */}
                <div
                  className="oct-cell-calls"
                  onClick={() => s.ce && onTrade(s.ce.symbol, 'BUY')}
                >
                  {priceMode === 'BA' ? (
                    <>
                      <span className="oct-val call">{ceBid}</span>
                      <span className="oct-val call">{ceAsk}</span>
                    </>
                  ) : (
                    <span className="oct-val call ltp-single">{ceLtp}</span>
                  )}
                </div>

                {/* Strike */}
                <div className={`oct-cell-strike${isAtm ? ' atm' : ''}`}>
                  <span className={`oct-strike-val${isAtm ? ' atm' : ''}`}>
                    {s.strike.toLocaleString('en-IN')}
                  </span>
                </div>

                {/* Puts */}
                <div
                  className="oct-cell-puts"
                  onClick={() => s.pe && onTrade(s.pe.symbol, 'BUY')}
                >
                  {priceMode === 'BA' ? (
                    <>
                      <span className="oct-val put">{peBid}</span>
                      <span className="oct-val put">{peAsk}</span>
                    </>
                  ) : (
                    <span className="oct-val put ltp-single">{peLtp}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>{/* oct-table */}

      <style jsx>{`
        .oct-wrap {
          width: 100%;
          padding: 0 0 80px 0;
        }

        /* ── Single outer container ── */
        .oct-table {
          width: 100%;
          background: #fff;
          border-radius: 20px;
          overflow: clip;
          border: 1px solid #e8eaf0;
          box-shadow: 0 2px 12px rgba(0,0,0,0.05);
          font-family: 'Inter', sans-serif;
        }

        :global(body.dark) .oct-table {
          background: #141414;
          border-color: #2a2a2a;
          box-shadow: 0 2px 16px rgba(0,0,0,0.4);
        }

        /* ── Header ── */
        .oct-head {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          font-size: 0.8rem;
          font-weight: 800;
          letter-spacing: 0.5px;
          font-family: 'Inter', sans-serif;
        }

        .oct-head-calls {
          background: #edf7f0;
          color: #000000;
          text-align: center;
          padding: 14px 0 18px 0;
        }
        .oct-head-strike {
          background: #fefbe8;
          color: #000000;
          text-align: center;
          padding: 14px 0 18px 0;
        }
        .oct-head-puts {
          background: #fff0eb;
          color: #000000;
          text-align: center;
          padding: 14px 0 18px 0;
        }

        :global(body.dark) .oct-head-calls {
          background: #1a2e1c;
          color: #ffffff;
        }
        :global(body.dark) .oct-head-puts {
          background: #2e1a1a;
          color: #ffffff;
        }
        :global(body.dark) .oct-head-strike {
          background: #252010;
          color: #ffffff;
        }

        /* ── Sticky sub-header ── */
        .oct-subhead {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          font-size: 0.72rem;
          font-weight: 700;
          font-family: 'Inter', sans-serif;
          position: sticky;
          top: 58px;
          z-index: 20;
          border-bottom: 1px solid #e8eaf0;
          transition: border-radius 0.15s ease, box-shadow 0.15s ease;
        }

        /* When header scrolled away — round top corners */
        .oct-subhead.floating {
          border-radius: 20px 20px 0 0;
          box-shadow: 0 4px 16px rgba(0,0,0,0.1);
          overflow: hidden;
        }

        .oct-subhead.floating .oct-sub-calls {
          border-radius: 20px 0 0 0;
        }

        .oct-subhead.floating .oct-sub-puts {
          border-radius: 0 20px 0 0;
        }

        :global(body.dark) .oct-subhead {
          border-bottom-color: #252525;
        }

        :global(body.dark) .oct-subhead.floating {
          box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        }

        .oct-sub-calls {
          background: #ffffff;
          color: #000000;
          display: flex;
          justify-content: space-around;
          align-items: center;
          padding: 10px 8px;
        }
        .oct-sub-strike {
          background: #ffffff;
          color: #000000;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 10px 0;
          font-size: 0.85rem;
        }
        .oct-sub-puts {
          background: #ffffff;
          color: #000000;
          display: flex;
          justify-content: space-around;
          align-items: center;
          padding: 10px 8px;
        }

        :global(body.dark) .oct-sub-calls {
          background: #141414;
          color: #a3a3a3;
        }
        :global(body.dark) .oct-sub-puts {
          background: #141414;
          color: #a3a3a3;
        }
        :global(body.dark) .oct-sub-strike {
          background: #141414;
          color: #a3a3a3;
        }

        /* ── Body ── */
        .oct-body {
          display: flex;
          flex-direction: column;
        }

        /* ── Row ── */
        .oct-row {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          border-bottom: 1px solid #f0f2f5;
          transition: opacity 0.1s;
        }
        .oct-row:last-child { border-bottom: none; }
        .oct-row:active { opacity: 0.7; }

        .oct-row.atm {
          border-top: 2px solid rgba(198,46,46,0.25);
          border-bottom: 2px solid rgba(198,46,46,0.25);
        }

        :global(body.dark) .oct-row {
          border-bottom-color: #1f1f1f;
        }

        /* ── Cells ── */
        .oct-cell-calls {
          background: #f4fbf4;
          display: flex;
          justify-content: space-around;
          align-items: center;
          padding: 11px 8px;
          cursor: pointer;
          gap: 4px;
        }
        .oct-cell-strike {
          background: #fefef8;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 11px 4px;
        }
        .oct-cell-puts {
          background: #fff7f3;
          display: flex;
          justify-content: space-around;
          align-items: center;
          padding: 11px 8px;
          cursor: pointer;
          gap: 4px;
        }

        .oct-cell-calls:active,
        .oct-cell-puts:active { opacity: 0.7; }

        .oct-cell-strike.atm {
          background: #fff8f0;
        }

        :global(body.dark) .oct-cell-calls {
          background: #161c17;
        }
        :global(body.dark) .oct-cell-puts {
          background: #1c1616;
        }
        :global(body.dark) .oct-cell-strike {
          background: #141414;
        }
        :global(body.dark) .oct-cell-strike.atm {
          background: #1e1414;
        }

        /* ── Values ── */
        .oct-val {
          font-size: 0.82rem;
          font-weight: 600;
          font-family: 'Inter', sans-serif;
        }

        .oct-val.call { color: #2e7d32; }
        .oct-val.put  { color: #c0392b; }

        .oct-val.ltp-single {
          font-size: 0.9rem;
          font-weight: 700;
        }

        :global(body.dark) .oct-val.call {
          color: #4ade80;
        }
        :global(body.dark) .oct-val.put {
          color: #f87171;
        }

        /* ── Strike value ── */
        .oct-strike-val {
          font-size: 0.85rem;
          font-weight: 700;
          color: #C62E2E;
          font-family: 'Inter', sans-serif;
        }

        .oct-strike-val.atm {
          color: #C62E2E;
          font-weight: 800;
          font-size: 0.9rem;
        }

        :global(body.dark) .oct-strike-val {
          color: #f87171;
        }
        :global(body.dark) .oct-strike-val.atm {
          color: #ff6b6b;
          font-weight: 800;
        }
      `}</style>
    </div>
  );
}
