'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSession } from '@/lib/auth';
import './option-chain.css';

interface OptionRow {
    strike: number;
    callPrice: number;
    callChange: number;
    callOI: number;
    putPrice: number;
    putChange: number;
    putOI: number;
    isAtm: boolean;
}

// ── Generate realistic option chain ──
function generateChain(spot: number, step: number, count: number): OptionRow[] {
    const atm = Math.round(spot / step) * step;
    const half = Math.floor(count / 2);
    const rows: OptionRow[] = [];

    for (let i = -half; i <= half; i++) {
        const strike = atm + i * step;
        const diff = spot - strike;
        const timeVal = Math.max(5, 80 - Math.abs(i) * 10);
        const noise = () => (Math.random() - 0.5) * 3;

        const callPrice = Math.max(0.5, Math.max(0, diff) + timeVal + noise());
        const putPrice  = Math.max(0.5, Math.max(0, -diff) + timeVal + noise());

        rows.push({
            strike,
            callPrice: +callPrice.toFixed(2),
            callChange: +((Math.random() - 0.45) * 18).toFixed(2),
            callOI: Math.floor(Math.random() * 60000 + 5000),
            putPrice: +putPrice.toFixed(2),
            putChange: +((Math.random() - 0.55) * 18).toFixed(2),
            putOI: Math.floor(Math.random() * 60000 + 5000),
            isAtm: i === 0,
        });
    }
    return rows;
}

// ── Upcoming expiry Thursdays ──
function getExpiries(n = 3): string[] {
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const d = new Date();
    while (d.getDay() !== 4) d.setDate(d.getDate() + 1);
    return Array.from({ length: n }, (_, i) => {
        const label = `${d.getDate()} ${months[d.getMonth()]}${i === 0 ? ' (Weekly)' : ''}`;
        d.setDate(d.getDate() + 7);
        return label;
    });
}

const SYMBOL_CONFIG: Record<string, { step: number; instrument: string; lotSize: number }> = {
    'NIFTY 50':  { step: 50,  instrument: 'NSE:NIFTY 50',         lotSize: 50 },
    'NIFTY':     { step: 50,  instrument: 'NSE:NIFTY 50',         lotSize: 50 },
    'BANKNIFTY': { step: 100, instrument: 'NSE:NIFTY BANK',       lotSize: 25 },
    'SENSEX':    { step: 100, instrument: 'BSE:SENSEX',           lotSize: 15 },
    'FINNIFTY':  { step: 50,  instrument: 'NSE:NIFTY FIN SERVICE',lotSize: 40 },
};

function cfg(symbol: string) {
    return SYMBOL_CONFIG[symbol.toUpperCase()] ?? { step: 50, instrument: `NSE:${symbol}`, lotSize: 50 };
}

function fmtOI(n: number) {
    return n >= 100000 ? `${(n/100000).toFixed(1)}L` : n >= 1000 ? `${(n/1000).toFixed(0)}K` : String(n);
}

function OptionChainInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const symbol = searchParams.get('symbol') || 'NIFTY 50';
    const config = cfg(symbol);

    const [expiries]          = useState(getExpiries(3));
    const [activeTab, setActiveTab] = useState(expiries[0]);
    const [indexPrice, setIndexPrice] = useState(0);
    const [indexChange, setIndexChange] = useState(0);
    const [indexChangePct, setIndexChangePct] = useState(0);
    const [chain, setChain]   = useState<OptionRow[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem('marginApexTheme');
        if (saved === 'dark') document.body.classList.add('dark');
        else document.body.classList.remove('dark');
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const s = await getSession();
            let spot = symbol.includes('BANK') ? 52000 : symbol.includes('SENSEX') ? 80000 : 24500;
            let chg = 0, chgPct = 0;

            if (s) {
                const res = await fetch(
                    `/api/kite/quotes?instruments=${encodeURIComponent(config.instrument)}`,
                    { headers: { Authorization: `Bearer ${s.access_token}` } }
                );
                if (res.ok) {
                    const json = await res.json();
                    const q = json.data?.[config.instrument];
                    if (q?.last_price) {
                        spot = q.last_price;
                        chg = q.net_change ?? 0;
                        chgPct = q.ohlc?.close ? ((spot - q.ohlc.close) / q.ohlc.close * 100) : 0;
                    }
                }
            }

            setIndexPrice(spot);
            setIndexChange(chg);
            setIndexChangePct(chgPct);
            setChain(generateChain(spot, config.step, 9));
        } catch {
            const spot = symbol.includes('BANK') ? 52000 : symbol.includes('SENSEX') ? 80000 : 24500;
            setIndexPrice(spot);
            setIndexChange(120);
            setIndexChangePct(0.49);
            setChain(generateChain(spot, config.step, 9));
        } finally {
            setLoading(false);
        }
    }, [config.instrument, config.step, symbol]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const isPositive = indexChange >= 0;
    const fmtPrice = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div className="option-chain-container">

            {/* ── Header ── */}
            <div className="oc-header">
                <div className="oc-header-left">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                        <button
                            onClick={() => router.back()}
                            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '1.1rem', cursor: 'pointer', padding: 0 }}
                        >
                            <i className="fas fa-arrow-left"></i>
                        </button>
                        <h3 style={{ margin: 0 }}>OPTION CHAIN</h3>
                    </div>
                    <h1>{symbol}</h1>
                </div>
                <div className="oc-header-right">
                    <div className="index-price">
                        {indexPrice > 0 ? fmtPrice(indexPrice) : '—'}
                    </div>
                    <div className={`index-change ${isPositive ? 'positive' : 'negative'}`}>
                        <i className={`fas fa-caret-${isPositive ? 'up' : 'down'}`} style={{ marginRight: 4 }}></i>
                        {Math.abs(indexChange).toFixed(2)} ({Math.abs(indexChangePct).toFixed(2)}%)
                    </div>                </div>
            </div>

            {/* ── Expiry tabs ── */}
            <div className="oc-tabs-wrapper">
                <div className="oc-tabs">
                    {expiries.map(tab => (
                        <button
                            key={tab}
                            className={`oc-tab${activeTab === tab ? ' active' : ''}`}
                            onClick={() => { setActiveTab(tab); fetchData(); }}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Column headers ── */}
            <div className="oc-columns">
                <div className="oc-col-calls">CALLS (CE)</div>
                <div className="oc-col-strike">STRIKE</div>
                <div className="oc-col-puts">PUTS (PE)</div>
            </div>

            {/* ── Chain list ── */}
            <div className="oc-list">
                {loading ? (
                    Array.from({ length: 7 }).map((_, i) => (
                        <div key={i} className="oc-row-skeleton" />
                    ))
                ) : (
                    chain.map(opt => (
                        <React.Fragment key={opt.strike}>
                            {opt.isAtm && (
                                <div className="oc-atm-divider">
                                    <div className="oc-atm-line"></div>
                                    <div className="oc-atm-badge">AT THE MONEY</div>
                                    <div className="oc-atm-line"></div>
                                </div>
                            )}
                            <div className="oc-row">
                                {/* Calls */}
                                <div className="oc-cell oc-cell-calls">
                                    <div className="oc-price">{fmtPrice(opt.callPrice)}</div>
                                    <div className={`oc-change ${opt.callChange >= 0 ? 'positive' : 'negative'}`}>
                                        {opt.callChange >= 0 ? '+' : ''}{opt.callChange.toFixed(2)}
                                    </div>
                                    <div className="oc-oi">{fmtOI(opt.callOI)}</div>
                                </div>

                                {/* Strike */}
                                <div className="oc-cell-strike">
                                    <div className={`oc-strike-pill${opt.isAtm ? ' atm' : ''}`}>
                                        {opt.strike.toLocaleString('en-IN')}
                                    </div>
                                </div>

                                {/* Puts */}
                                <div className="oc-cell oc-cell-puts">
                                    <div className="oc-price">{fmtPrice(opt.putPrice)}</div>
                                    <div className={`oc-change ${opt.putChange >= 0 ? 'positive' : 'negative'}`}>
                                        {opt.putChange >= 0 ? '+' : ''}{opt.putChange.toFixed(2)}
                                    </div>
                                    <div className="oc-oi">{fmtOI(opt.putOI)}</div>
                                </div>
                            </div>
                        </React.Fragment>
                    ))
                )}
            </div>

            {/* ── Info card ── */}
            <div className="oc-info-card">
                <div className="oc-info-title">
                    <i className="far fa-lightbulb"></i> New to Options?
                </div>
                <div className="oc-info-text">
                    Tap any row to see <strong>Call</strong> (Buy if you think price goes up) or <strong>Put</strong> (Buy if you think price goes down) quick actions.
                </div>
            </div>

        </div>
    );
}

export default function OptionChainPage() {
    return (
        <Suspense fallback={
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100dvh', background:'var(--bg-body)' }}>
                <div style={{ width:32, height:32, border:'3px solid var(--border-card)', borderTopColor:'#2C8E5A', borderRadius:'50%', animation:'spin 0.8s linear infinite' }} />
            </div>
        }>
            <OptionChainInner />
        </Suspense>
    );
}
