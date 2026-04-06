'use client';
import { useState } from 'react';
import Footer from '@/components/Footer';
import './page.css';

export default function HistoryPage() {
    const [currentTab, setCurrentTab] = useState('position');
    const [fromDate, setFromDate] = useState('2026-03-23');
    const [toDate, setToDate] = useState('2026-03-30');

    const samplePositions = [
        { id: 1, scriptName: "NIFTY FUT", scriptSymbol: "NIFTY_FUT", type: "BUY", qty: 75, entryPrice: 22456.80, exitPrice: 22650.25, pnl: 14508.75, entryDate: "2026-03-28", exitDate: "2026-03-28", orderType: "Market", brokerage: 20 },
        { id: 2, scriptName: "RELIANCE FUT", scriptSymbol: "RELIANCE_FUT", type: "SELL", qty: 250, entryPrice: 2856.40, exitPrice: 2830.15, pnl: 6562.50, entryDate: "2026-03-28", exitDate: "2026-03-28", orderType: "Limit", brokerage: 20 },
        { id: 3, scriptName: "BTC/USDT", scriptSymbol: "BTCUSDT", type: "BUY", qty: 0.05, entryPrice: 68450.20, exitPrice: 69120.50, pnl: 33.52, entryDate: "2026-03-27", exitDate: "2026-03-27", orderType: "Market", brokerage: 20 },
        { id: 4, scriptName: "BANKNIFTY FUT", scriptSymbol: "BANKNIFTY_FUT", type: "BUY", qty: 25, entryPrice: 48210.50, exitPrice: 47890.25, pnl: -8006.25, entryDate: "2026-03-27", exitDate: "2026-03-27", orderType: "Market", brokerage: 20 },
        { id: 5, scriptName: "INFY EQ", scriptSymbol: "INFY", type: "SELL", qty: 50, entryPrice: 1598.40, exitPrice: 1612.80, pnl: -720.00, entryDate: "2026-03-26", exitDate: "2026-03-26", orderType: "Limit", brokerage: 20 },
        { id: 6, scriptName: "GOLD FUT", scriptSymbol: "GOLD_FUT", type: "BUY", qty: 10, entryPrice: 62340.00, exitPrice: 62850.75, pnl: 5107.50, entryDate: "2026-03-26", exitDate: "2026-03-26", orderType: "Market", brokerage: 20 },
        { id: 7, scriptName: "HDFCBANK FUT", scriptSymbol: "HDFCBANK_FUT", type: "SELL", qty: 550, entryPrice: 1680.90, exitPrice: 1672.30, pnl: 4730.00, entryDate: "2026-03-25", exitDate: "2026-03-25", orderType: "SL-M", brokerage: 20 },
        { id: 8, scriptName: "ETH/USDT", scriptSymbol: "ETHUSDT", type: "BUY", qty: 0.5, entryPrice: 3420.80, exitPrice: 3380.25, pnl: -20.28, entryDate: "2026-03-25", exitDate: "2026-03-25", orderType: "Market", brokerage: 20 },
        { id: 9, scriptName: "TCS EQ", scriptSymbol: "TCS", type: "BUY", qty: 20, entryPrice: 3982.50, exitPrice: 4012.30, pnl: 596.00, entryDate: "2026-03-24", exitDate: "2026-03-24", orderType: "Limit", brokerage: 20 }
    ];

    const sampleOrders = [
        { id: 101, scriptName: "NIFTY FUT", scriptSymbol: "NIFTY_FUT", type: "BUY", qty: 75, price: 22456.80, date: "2026-03-28 10:15 AM", orderType: "Market", status: "executed", brokerage: 20 },
        { id: 102, scriptName: "NIFTY FUT", scriptSymbol: "NIFTY_FUT", type: "SELL", qty: 75, price: 22650.25, date: "2026-03-28 11:30 AM", orderType: "Market", status: "executed", brokerage: 20 },
        { id: 103, scriptName: "RELIANCE FUT", scriptSymbol: "RELIANCE_FUT", type: "SELL", qty: 250, price: 2856.40, date: "2026-03-28 09:45 AM", orderType: "Limit", status: "executed", brokerage: 20 },
        { id: 104, scriptName: "RELIANCE FUT", scriptSymbol: "RELIANCE_FUT", type: "BUY", qty: 250, price: 2830.15, date: "2026-03-28 02:15 PM", orderType: "Limit", status: "executed", brokerage: 20 },
        { id: 105, scriptName: "BTC/USDT", scriptSymbol: "BTCUSDT", type: "BUY", qty: 0.05, price: 68450.20, date: "2026-03-27 10:30 AM", orderType: "Market", status: "executed", brokerage: 20 },
        { id: 106, scriptName: "BTC/USDT", scriptSymbol: "BTCUSDT", type: "SELL", qty: 0.05, price: 69120.50, date: "2026-03-27 03:45 PM", orderType: "Market", status: "executed", brokerage: 20 },
        { id: 107, scriptName: "BANKNIFTY FUT", scriptSymbol: "BANKNIFTY_FUT", type: "BUY", qty: 25, price: 48210.50, date: "2026-03-27 09:15 AM", orderType: "Market", status: "executed", brokerage: 20 },
        { id: 108, scriptName: "BANKNIFTY FUT", scriptSymbol: "BANKNIFTY_FUT", type: "SELL", qty: 25, price: 47890.25, date: "2026-03-27 01:30 PM", orderType: "Market", status: "executed", brokerage: 20 },
        { id: 109, scriptName: "INFY EQ", scriptSymbol: "INFY", type: "SELL", qty: 50, price: 1598.40, date: "2026-03-26 11:20 AM", orderType: "Limit", status: "executed", brokerage: 20 },
        { id: 110, scriptName: "INFY EQ", scriptSymbol: "INFY", type: "BUY", qty: 50, price: 1612.80, date: "2026-03-26 02:45 PM", orderType: "Limit", status: "executed", brokerage: 20 },
        { id: 111, scriptName: "GOLD FUT", scriptSymbol: "GOLD_FUT", type: "BUY", qty: 10, price: 62340.00, date: "2026-03-26 10:00 AM", orderType: "Market", status: "pending", brokerage: 20 }
    ];

    const formatPrice = (p: number | string) => {
        const n = typeof p === 'number' ? p : parseFloat(p as string);
        return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2 });
    };

    const filterData = (items: any[], field: string) => {
        return items.filter(i => {
            let itemDate = i[field];
            if (field === 'date') itemDate = itemDate.split(' ')[0];
            if (fromDate && itemDate < fromDate) return false;
            if (toDate && itemDate > toDate) return false;
            return true;
        });
    };

    const filteredData = currentTab === 'position'
        ? filterData(samplePositions, 'exitDate')
        : filterData(sampleOrders, 'date');

    const calculateSummary = () => {
        let gp = 0, gl = 0, b = 0, n = 0;
        if (currentTab === 'position') {
            gp = filteredData.filter(p => p.pnl > 0).reduce((s, p) => s + p.pnl, 0);
            gl = Math.abs(filteredData.filter(p => p.pnl < 0).reduce((s, p) => s + p.pnl, 0));
            b = filteredData.reduce((s, p) => s + p.brokerage, 0);
            n = filteredData.reduce((s, p) => s + p.pnl, 0) - b;
        } else {
            const ex = filteredData.filter(o => o.status === 'executed');
            const bv = ex.filter(o => o.type === 'BUY').reduce((s, o) => s + (o.price * o.qty), 0);
            const sv = ex.filter(o => o.type === 'SELL').reduce((s, o) => s + (o.price * o.qty), 0);
            const eP = sv - bv;
            gp = eP > 0 ? eP : 0;
            gl = eP < 0 ? Math.abs(eP) : 0;
            b = ex.reduce((s, o) => s + o.brokerage, 0);
            n = eP - b;
        }
        return { gp, gl, b, n };
    };

    const summary = calculateSummary();

    return (
        <div className="mobile-app history-root">
            <div className="app-header">
                <div className="header-top">
                    <div className="logo-area">
                        <div className="logo-text">Trade History</div>
                    </div>
                    <div className="header-buttons">
                        <button
                            className={`header-btn ${currentTab === 'position' ? 'active' : ''}`}
                            onClick={() => setCurrentTab('position')}
                        >
                            Position History
                        </button>
                        <button
                            className={`header-btn ${currentTab === 'order' ? 'active' : ''}`}
                            onClick={() => setCurrentTab('order')}
                        >
                            Order History
                        </button>
                    </div>
                </div>
                <div className="date-filter-row">
                    <div className="filter-group">
                        <i className="fas fa-calendar-alt"></i>
                        <input
                            type="date"
                            className="date-input-compact"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                        />
                    </div>
                    <span style={{ color: '#C62E2E', fontSize: '0.7rem' }}>→</span>
                    <div className="filter-group">
                        <i className="fas fa-calendar-alt"></i>
                        <input
                            type="date"
                            className="date-input-compact"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                        />
                    </div>
                    <div className="filter-buttons">
                        <button className="filter-btn apply">Apply</button>
                        <button className="filter-btn clear" onClick={() => { setFromDate(''); setToDate(''); }}>Clear</button>
                    </div>
                </div>
            </div>

            <div className="main-content">
                <div className="history-list">
                    {filteredData.length === 0 ? (
                        <div className="empty-history">
                            <i className={currentTab === 'position' ? "fas fa-folder-open" : "fas fa-list-ul"}></i>
                            <p>No history found</p>
                        </div>
                    ) : (
                        filteredData.map((item) => {
                            const isPositive = item.pnl >= 0;
                            const pnlPercent = item.entryPrice ? ((item.pnl / (item.entryPrice * item.qty)) * 100).toFixed(2) : "0.00";

                            return (
                                <div key={item.id} className="history-card">
                                    <div className="history-card-header">
                                        <div className="script-info">
                                            <span className="script-name">{item.scriptName}</span>
                                            <span className={`order-type-badge ${item.type.toLowerCase()}`}>{item.type}</span>
                                            <span style={{ fontSize: '0.55rem', color: '#9AA4BF' }}>{item.orderType}</span>
                                            {currentTab === 'order' && (
                                                <span className={`order-type-badge ${item.status === 'executed' ? 'completed' : 'pending'}`}>
                                                    {item.status}
                                                </span>
                                            )}
                                        </div>
                                        <div className={currentTab === 'position' ? `pnl ${isPositive ? 'positive' : 'negative'}` : 'price-value'}>
                                            {currentTab === 'position'
                                                ? `${isPositive ? '+' : ''}${formatPrice(Math.abs(item.pnl))} (${isPositive ? '+' : ''}${pnlPercent}%)`
                                                : formatPrice(item.price)}
                                        </div>
                                    </div>
                                    <div className="history-card-details">
                                        <span className="detail-item"><i className="fas fa-layer-group"></i> {item.qty}</span>
                                        {currentTab === 'position' ? (
                                            <>
                                                <span className="detail-item"><i className="fas fa-arrow-right"></i> {formatPrice(item.entryPrice)}</span>
                                                <span className="detail-item"><i className="fas fa-arrow-left"></i> {formatPrice(item.exitPrice)}</span>
                                                <span className="detail-item"><i className="far fa-calendar"></i> {item.exitDate}</span>
                                            </>
                                        ) : (
                                            <>
                                                <span className="detail-item"><i className="fas fa-clock"></i> {item.orderType}</span>
                                                <span className="detail-item"><i className="far fa-calendar"></i> {item.date.split(' ')[0]}</span>
                                            </>
                                        )}
                                    </div>
                                    <div className="history-card-details" style={{ marginTop: '4px' }}>
                                        <span className="detail-item"><i className="fas fa-receipt"></i> ₹{item.brokerage}</span>
                                        {currentTab === 'order' && <span className="detail-item"><i className="fas fa-hourglass-half"></i> {item.date.split(' ')[1] || ''}</span>}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <div className="history-footer">
                    <div className="footer-row">
                        <span className="footer-label"><i className="fas fa-arrow-up"></i> Gross Profit</span>
                        <span className="footer-value">{formatPrice(summary.gp)}</span>
                    </div>
                    <div className="footer-row">
                        <span className="footer-label"><i className="fas fa-arrow-down"></i> Gross Loss</span>
                        <span className="footer-value">{formatPrice(summary.gl)}</span>
                    </div>
                    <div className="footer-row">
                        <span className="footer-label"><i className="fas fa-receipt"></i> Brokerage</span>
                        <span className="footer-value">{formatPrice(summary.b)}</span>
                    </div>
                    <div className="footer-row">
                        <span className="footer-label"><i className="fas fa-chart-line"></i> Net P&L</span>
                        <span className={`footer-value ${summary.n >= 0 ? 'net-profit' : 'net-loss'}`}>
                            {formatPrice(summary.n)}
                        </span>
                    </div>
                </div>
            </div>

            <Footer activeTab="history" />
        </div>
    );
}
