import sys

content = open('app/watchlist/page.tsx', 'r', encoding='utf-8').read()

target1 = '''  onBasketBuy?: (item: WatchlistItem) => void;
  onBasketSell?: (item: WatchlistItem) => void;
}

function InstrumentRow({ item, quote, binanceQuote, comexQuote, onTrade, onDetail, basketMode, onBasketBuy, onBasketSell }: InstrumentRowProps) {'''

repl1 = '''  onBasketBuy?: (item: WatchlistItem) => void;
  onBasketSell?: (item: WatchlistItem) => void;
  onChart?: (item: WatchlistItem) => void;
}

function InstrumentRow({ item, quote, binanceQuote, comexQuote, onTrade, onDetail, basketMode, onBasketBuy, onBasketSell, onChart }: InstrumentRowProps) {'''

target2 = '''            <span className="exchange-badge" style={
              isCrypto ? { background: '#F0A500', color: '#fff' } :
                showComex ? { background: '#4A148C', color: '#fff' } : {}
            }>
              {isCrypto ? 'CRYPTO' : showComex ? 'COMEX' : getExchangeBadge(item.segment)}
            </span>
          </div>'''

repl2 = '''            <span className="exchange-badge" style={
              isCrypto ? { background: '#F0A500', color: '#fff' } :
                showComex ? { background: '#4A148C', color: '#fff' } : {}
            }>
              {isCrypto ? 'CRYPTO' : showComex ? 'COMEX' : getExchangeBadge(item.segment)}
            </span>
            {!basketMode && onChart && (
              <button 
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onChart(item);
                }}
                style={{ background: 'none', border: 'none', color: '#2C8E5A', cursor: 'pointer', padding: '0 4px', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center' }}
                title="Open Chart"
              >
                <i className="fas fa-chart-simple"></i>
              </button>
            )}
          </div>'''

target3 = '''                onBasketBuy={(it) => setBasketLegs(prev => {
                  // If BUY leg already exists for this symbol, remove it (toggle off)
                  const exists = prev.find(l => l.item.symbol === it.symbol && l.side === 'BUY');
                  if (exists) {
                    showToast(`${it.name} BUY removed`, false);
                    return prev.filter(l => !(l.item.symbol === it.symbol && l.side === 'BUY'));
                  }
                  showToast(`${it.name} BUY added to basket ✓`, false);
                  return [...prev, { item: it, side: 'BUY', qty: 1, unit: 'qty' }];
                })}
                onBasketSell={(it) => setBasketLegs(prev => {
                  // If SELL leg already exists for this symbol, remove it (toggle off)
                  const exists = prev.find(l => l.item.symbol === it.symbol && l.side === 'SELL');
                  if (exists) {
                    showToast(`${it.name} SELL removed`, false);
                    return prev.filter(l => !(l.item.symbol === it.symbol && l.side === 'SELL'));
                  }
                  showToast(`${it.name} SELL added to basket ✓`, false);
                  return [...prev, { item: it, side: 'SELL', qty: 1, unit: 'qty' }];
                })}
              />
            ))}'''

repl3 = '''                onBasketBuy={(it) => setBasketLegs(prev => {
                  // If BUY leg already exists for this symbol, remove it (toggle off)
                  const exists = prev.find(l => l.item.symbol === it.symbol && l.side === 'BUY');
                  if (exists) {
                    showToast(`${it.name} BUY removed`, false);
                    return prev.filter(l => !(l.item.symbol === it.symbol && l.side === 'BUY'));
                  }
                  showToast(`${it.name} BUY added to basket ✓`, false);
                  return [...prev, { item: it, side: 'BUY', qty: 1, unit: 'qty' }];
                })}
                onBasketSell={(it) => setBasketLegs(prev => {
                  // If SELL leg already exists for this symbol, remove it (toggle off)
                  const exists = prev.find(l => l.item.symbol === it.symbol && l.side === 'SELL');
                  if (exists) {
                    showToast(`${it.name} SELL removed`, false);
                    return prev.filter(l => !(l.item.symbol === it.symbol && l.side === 'SELL'));
                  }
                  showToast(`${it.name} SELL added to basket ✓`, false);
                  return [...prev, { item: it, side: 'SELL', qty: 1, unit: 'qty' }];
                })}
                onChart={(item) => {
                  setChartItem(item);
                  setIsBenchmarkChart(false);
                  const detailSheet = document.getElementById('detailSheet');
                  const detailOverlay = document.getElementById('detailSheetOverlay');
                  if (detailSheet) detailSheet.classList.remove('open');
                  if (detailOverlay) detailOverlay.classList.remove('active');
                  const chartSheet = document.getElementById('chartSheet');
                  const chartOverlay = document.getElementById('chartSheetOverlay');
                  if (chartSheet) chartSheet.classList.add('open');
                  if (chartOverlay) chartOverlay.classList.add('active');
                }}
              />
            ))}'''

c2 = content.replace(target1, repl1)
c3 = c2.replace(target2, repl2)
c4 = c3.replace(target3, repl3)

if content == c4:
    print('Failed to replace anything!')
else:
    open('app/watchlist/page.tsx', 'w', encoding='utf-8').write(c4)
    print('Success!')
