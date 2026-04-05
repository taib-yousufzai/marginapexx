
'use client';
import { useEffect, useRef } from 'react';
import Footer from '@/components/Footer';
import './page.css';

export default function Page() {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const script = document.createElement('script');
        script.innerHTML = `
        var positions = [
            { symbol: "NIFTY28MARFUT", name: "NIFTY FUT", type: "BUY", qty: 50, avg: 22450.00, ltp: 22458.80, product: "MIS", status: "OPEN" },
            { symbol: "BANKNIFTY28MARFUT", name: "BANKNIFTY FUT", type: "SELL", qty: 15, avg: 48210.00, ltp: 48190.50, product: "NRML", status: "OPEN" },
            { symbol: "RELIANCE28MARFUT", name: "RELIANCE FUT", type: "BUY", qty: 100, avg: 2845.00, ltp: 2856.40, product: "CNC", status: "OPEN" },
            { symbol: "TCS", name: "TCS EQ", type: "BUY", qty: 25, avg: 3980.00, ltp: 3982.50, product: "MIS", status: "CLOSED", pnl: 62.50 }
        ];

        var activeTab = 'OPEN';

        function formatPrice(p) {
            return "₹" + (typeof p === 'number' ? p.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : p);
        }

        function calculatePnL(pos) {
            if (pos.status === 'CLOSED') return pos.pnl || 0;
            var diff = pos.type === 'BUY' ? (pos.ltp - pos.avg) : (pos.avg - pos.ltp);
            return diff * pos.qty;
        }

        function renderPositions() {
            var container = document.getElementById('positionsList');
            if(!container) return;
            var filtered = positions.filter(p => p.status === activeTab);
            var totalPnL = 0, realized = 0, unrealized = 0;

            positions.forEach(p => {
                var pnl = calculatePnL(p);
                totalPnL += pnl;
                if (p.status === 'CLOSED') realized += pnl;
                else unrealized += pnl;
            });

            var totalEl = document.getElementById('totalPnL');
            if(totalEl) {
                totalEl.innerText = formatPrice(totalPnL);
                totalEl.className = totalPnL >= 0 ? 'total-pnl pnl-pos' : 'total-pnl pnl-neg';
            }
            if(document.getElementById('realizedPnL')) document.getElementById('realizedPnL').innerText = formatPrice(realized);
            if(document.getElementById('unrealizedPnL')) document.getElementById('unrealizedPnL').innerText = formatPrice(unrealized);

            document.querySelectorAll('.tab').forEach(t => {
                t.classList.toggle('active', t.dataset.tab === activeTab);
            });

            if (filtered.length === 0) {
                container.innerHTML = '<div style="text-align:center; padding:40px; color:#94A3B8;">No positions found</div>';
                return;
            }

            var html = '';
            filtered.forEach((p, idx) => {
                var pnl = calculatePnL(p);
                var pnlClass = pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
                
                html += \`<div class="pos-card">
                    <div class="pos-card-header">
                        <div>
                            <span class="pos-symbol">\${p.name}</span>
                            <span style="font-size:0.7rem; margin-left:8px; color:#94A3B8;">\${p.symbol}</span>
                        </div>
                        <span class="pos-product">\${p.product}</span>
                    </div>
                    <div class="pos-grid">
                        <div class="pos-item">
                            <div class="pos-item-label">QTY / TYPE</div>
                            <div class="pos-item-val" style="color:\${p.type==='BUY'?'#2C8E5A':'#DC2626'}">\${p.qty} | \${p.type}</div>
                        </div>
                        <div class="pos-item" style="text-align:right;">
                            <div class="pos-item-label">AVG PRICE</div>
                            <div class="pos-item-val">\${formatPrice(p.avg)}</div>
                        </div>
                        <div class="pos-item">
                            <div class="pos-item-label">LTP</div>
                            <div class="pos-item-val">\${formatPrice(p.ltp)}</div>
                        </div>
                        <div class="pos-item" style="text-align:right;">
                            <div class="pos-item-label">NET VAL</div>
                            <div class="pos-item-val">\${formatPrice(p.ltp * p.qty)}</div>
                        </div>
                    </div>
                    <div class="pos-card-footer">
                        <div class="pos-pnl-label">P&L</div>
                        <div class="pos-pnl-val \${pnlClass}">\${pnl >= 0 ? '+' : ''}\${formatPrice(pnl)}</div>
                    </div>
                </div>\`;
            });
            container.innerHTML = html;
        }

        window.switchTab = function(t) { activeTab = t; renderPositions(); };

        setTimeout(renderPositions, 100);
    `;
        document.body.appendChild(script);
        return () => { if (document.body.contains(script)) document.body.removeChild(script); };
    }, []);

    return (
        <div className="app-container">
            <div
                ref={containerRef}
                style={{ flex: 1, overflowY: 'auto' }}
                dangerouslySetInnerHTML={{
                    __html: `
    <div class="app-header">
        <div class="header-title">Positions</div>
        <div style="font-size:0.7rem; font-weight:700; color:#8C94A8;">MTM P&L</div>
    </div>

    <div class="main-content">
        <div class="pnl-summary">
            <div class="summary-label">TOTAL P&L (MTM)</div>
            <div id="totalPnL" class="total-pnl">₹---</div>
            
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="summary-label">REALIZED</div>
                    <div id="realizedPnL" class="val">₹---</div>
                </div>
                <div class="summary-item" style="text-align:right;">
                    <div class="summary-label">UNREALIZED</div>
                    <div id="unrealizedPnL" class="val">₹---</div>
                </div>
            </div>
        </div>

        <div class="tabs-container">
            <div class="tab" data-tab="OPEN" onclick="switchTab('OPEN')">OPEN (3)</div>
            <div class="tab" data-tab="CLOSED" onclick="switchTab('CLOSED')">CLOSED (1)</div>
        </div>

        <div id="positionsList" class="positions-list"></div>
    </div>
` }}
            />
            {/* MODULAR FOOTER COMPONENT */}
            <Footer activeTab="position" />
        </div>
    );
}
