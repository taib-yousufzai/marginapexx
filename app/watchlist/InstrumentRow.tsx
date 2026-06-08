'use client';

import React, { useState } from 'react';
import { QuoteData } from '@/hooks/useMarketQuotes';
import { ComexQuoteData } from '@/hooks/useComexQuotes';
import TickFlash from '@/components/TickFlash';

export interface WatchlistItem {
  name: string;
  symbol: string;
  kiteSymbol: string;
  binanceSymbol?: string;
  comexSymbol?: string;
  price: number;
  change: string;
  segment: string;
  contractDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface InstrumentRowProps {
  item: WatchlistItem;
  quote?: QuoteData;
  binanceQuote?: QuoteData;
  comexQuote?: ComexQuoteData;
  onTrade: (item: WatchlistItem) => void;
  onDetail?: (item: WatchlistItem) => void;
  basketMode?: boolean;
  onBasketBuy?: (item: WatchlistItem) => void;
  onBasketSell?: (item: WatchlistItem) => void;
}

function getExchangeBadge(segment: string) {
  if (segment.includes('NSE')) return 'NFO';
  if (segment.includes('BSE')) return 'BFO';
  if (segment.includes('MCX')) return 'MCX';
  return 'MISC';
}

function getPctClass(pct: number) {
  return pct >= 0 ? 'pos' : 'neg';
}

export default function InstrumentRow({ item, quote, binanceQuote, comexQuote, onTrade }: InstrumentRowProps) {
  const [priceView, setPriceView] = useState<'kite' | 'comex'>('kite');

  const isCrypto = !!item.binanceSymbol;
  const hasDualView = !!item.kiteSymbol && !!item.comexSymbol;
  const showComex = hasDualView && priceView === 'comex';

  let ltp = 0;
  let prevClose = 0;
  if (isCrypto) {
    ltp = binanceQuote?.lastPrice ?? 0;
    prevClose = binanceQuote?.close ?? 0;
  } else if (showComex) {
    ltp = comexQuote?.lastPrice ?? 0;
    prevClose = comexQuote?.close ?? 0;
  } else {
    ltp = quote?.lastPrice ?? item.price;
    prevClose = item.close;
  }

  const absoluteChange = ltp - prevClose;
  const percentChange = prevClose !== 0 ? ((ltp - prevClose) / prevClose) * 100 : 0;
  const isLoading = isCrypto ? !binanceQuote : (showComex && !comexQuote);

  const handleCardClick = (e: React.MouseEvent) => {
    // If clicking a sub-button like delete or view toggle, don't trigger trade
    if ((e.target as HTMLElement).closest('.wc-action-btn') || (e.target as HTMLElement).closest('.dual-view-toggle')) {
      return;
    }
    onTrade(item);
  };

  return (
    <div className="instr-row watchlist-card" data-symbol={item.symbol} onClick={handleCardClick} style={{ cursor: 'pointer' }}>
      <div className="wc-swipe-actions">
        <button className="wc-action-btn delete-btn" onClick={(e) => { e.stopPropagation(); (window as any).removeFromWatchlist?.(item.symbol); }}>
          <i className="fas fa-trash-alt"></i>
        </button>
      </div>
      <div className="wc-content instr-row__content">
        <div className="instr-row__left">
          <div className="instr-row__name-line">
            <span className="instr-row__name">{item.name}</span>
            <span className="exchange-badge" style={
              isCrypto ? { background: '#F0A500', color: '#fff' } :
                showComex ? { background: '#4A148C', color: '#fff' } : {}
            }>
              {isCrypto ? 'BINANCE' : showComex ? 'COMEX' : getExchangeBadge(item.segment)}
            </span>
          </div>
          {item.contractDate && (
            <div className="instr-row__date">{item.contractDate}</div>
          )}
          {isCrypto && (
            <div className="instr-row__date" style={{ color: '#6B7280', fontSize: '0.7rem' }}>{item.binanceSymbol}</div>
          )}
          {hasDualView && (
            <div
              className="dual-view-toggle"
              onClick={(e) => { e.stopPropagation(); setPriceView(v => v === 'kite' ? 'comex' : 'kite'); }}
              style={{ fontSize: '0.62rem', fontWeight: '700', color: showComex ? '#4A148C' : '#2C8E5A', background: showComex ? '#EDE7F6' : '#E9F6EF', padding: '2px 8px', borderRadius: '20px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px', marginTop: '3px', userSelect: 'none' }}
            >
              {showComex ? '₹ COMEX ⇄ ₹ MCX' : '₹ MCX ⇄ ₹ COMEX'}
            </div>
          )}
        </div>
        <div className="instr-row__right">
          {isLoading ? (
            <div className="instr-row__ltp" style={{ color: '#9CA3AF' }}>Loading…</div>
          ) : (
                      <>
              <div className="instr-row__ltp">
                <TickFlash value={ltp}>
                  {isCrypto
                    ? `₹${ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : showComex
                      ? `₹${ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : `LTP: ${ltp.toFixed(2)}`}
                </TickFlash>
              </div>
              <div className="instr-row__abs-change">
                <TickFlash value={absoluteChange}>
                  {absoluteChange >= 0 ? '+' : ''}{absoluteChange.toFixed(2)}
                </TickFlash>
              </div>
              <div className={`instr-row__pct-change ${getPctClass(percentChange)}`}>
                {percentChange >= 0 ? '+' : ''}{percentChange.toFixed(2)}%
              </div>
            </>
          )}
        </div>
        <div className="wc-checkbox-wrapper" style={{ display: 'none' }}>
          <input type="checkbox" className="wc-checkbox" onClick={(e) => e.stopPropagation()} />
        </div>
      </div>
    </div>
  );
}
