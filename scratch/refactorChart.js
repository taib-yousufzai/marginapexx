const fs = require('fs');
const file = 'components/TradingChart.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add TradeSheet import
if (!code.includes('import TradeSheet')) {
  code = code.replace("import './trading-chart.css';", "import TradeSheet from '@/components/TradeSheet';\nimport './trading-chart.css';");
}

// 2. Add TradeSheet states right before isOrderBlockVisible
if (!code.includes('const [isTradeSheetOpen')) {
  code = code.replace(
    /const \[isOrderBlockVisible, setIsOrderBlockVisible\] = useState<boolean>\(false\);/,
    `const [isTradeSheetOpen, setIsTradeSheetOpen] = useState<boolean>(false);
  const [tradeSheetSide, setTradeSheetSide] = useState<'BUY' | 'SELL' | 'BOTH'>('BUY');
  const [tradeSheetItem, setTradeSheetItem] = useState<any>(null);
  const [tradeSheetMode, setTradeSheetMode] = useState<'normal' | 'exit'>('normal');
  const [tradeSheetProduct, setTradeSheetProduct] = useState<any>(null);

  const openTradeSheet = (side) => {
    let orderSymbol = symbol;
    let orderSegment = segment;
    let price = currentPrice;

    if (isAddMoreFlow && addMoreSymbol) {
      orderSymbol = addMoreSymbol;
      orderSegment = addMoreSegment || segment;
      price = addMoreLtp || currentPrice;
    } else if (isExitFlow && exitPositionId) {
      const p = positions.find(x => x.id === exitPositionId);
      if (p) {
        orderSymbol = p.symbol;
        orderSegment = p.settlement || segment;
        price = p.current_price;
      }
    }

    let orderKiteInstrument = orderSymbol;

    if (chainContract) {
      orderSymbol = chainContract.name;
      const underlying = symbol.toUpperCase().replace('_INDEX', '').replace('NSE:', '').replace('INDEX', '').trim();
      let prefix = 'NFO';
      if (underlying.includes('SENSEX') || underlying.includes('BANKEX')) prefix = 'BFO';
      else if (['GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS'].some(x => underlying.includes(x))) prefix = 'MCX';

      orderKiteInstrument = chainContract.kiteId || \`\${prefix}:\${orderSymbol}\`;
      orderSegment = 'INDEX-OPT'; // or MCX-OPT based on symbol, TradeSheet handles mapSegmentToDbSegment
      price = chainContract.ltp;
    }

    let productType = undefined;
    if (exitPositionId) {
      const p = positions.find(x => x.id === exitPositionId);
      if (p) productType = p.product_type;
    }

    setTradeSheetSide(side);
    setTradeSheetMode(isExitFlow ? 'exit' : 'normal');
    setTradeSheetProduct(productType);
    setTradeSheetItem({
      name: orderSymbol,
      symbol: orderSymbol,
      kiteSymbol: orderKiteInstrument,
      segment: orderSegment,
      price: price,
      change: '0%'
    });
    setIsTradeSheetOpen(true);
  };
  const [isOrderBlockVisible, setIsOrderBlockVisible] = useState<boolean>(false);`
  );
}

// 3. Replace the BUY and SELL buttons in the main view
code = code.replace(
  /onClick=\{\(\) => \{\s*if \(isPanelExpanded && activeSegment === 'chain'\) \{\s*handleQuickMarketOrder\('BUY'\);\s*\} else \{\s*setIsPanelExpanded\(false\);\s*setIsExitFlow\(false\);\s*setIsAddMoreFlow\(false\);\s*setExitPositionId\(null\);\s*setOrderBlockTitle\(symbol\);\s*setPostOrderSegment\('main'\);\s*setIsOrderBlockVisible\(true\);\s*setOrderSide\('BUY'\);\s*\}\s*\}\}/g,
  `onClick={() => { if (isPanelExpanded && activeSegment === 'chain') { handleQuickMarketOrder('BUY'); } else { openTradeSheet('BUY'); } }}`
);

code = code.replace(
  /onClick=\{\(\) => \{\s*if \(isPanelExpanded && activeSegment === 'chain'\) \{\s*handleQuickMarketOrder\('SELL'\);\s*\} else \{\s*setIsPanelExpanded\(false\);\s*setIsExitFlow\(false\);\s*setIsAddMoreFlow\(false\);\s*setExitPositionId\(null\);\s*setOrderBlockTitle\(symbol\);\s*setPostOrderSegment\('main'\);\s*setIsOrderBlockVisible\(true\);\s*setOrderSide\('SELL'\);\s*\}\s*\}\}/g,
  `onClick={() => { if (isPanelExpanded && activeSegment === 'chain') { handleQuickMarketOrder('SELL'); } else { openTradeSheet('SELL'); } }}`
);

// 4. Rip out the whole {isOrderBlockVisible && ( <div className="order-block visible" id="orderBlock"> ... )} block
const orderBlockStartIdx = code.indexOf('{isOrderBlockVisible && (');
if (orderBlockStartIdx !== -1) {
  let openBraces = 0;
  let inBlock = false;
  let orderBlockEndIdx = -1;
  for (let i = orderBlockStartIdx; i < code.length; i++) {
    if (code[i] === '{') openBraces++;
    if (code[i] === '}') {
      openBraces--;
      if (openBraces === 0) {
        orderBlockEndIdx = i + 1;
        break;
      }
    }
  }
  
  if (orderBlockEndIdx !== -1) {
    const tradeSheetJsx = `
        {isTradeSheetOpen && tradeSheetItem && (
          <TradeSheet
            item={tradeSheetItem}
            side={tradeSheetSide}
            onClose={() => setIsTradeSheetOpen(false)}
            exitMode={tradeSheetMode === 'exit'}
            productType={tradeSheetProduct}
            onSuccess={() => {
              setIsTradeSheetOpen(false);
              setIsExitFlow(false);
              setIsAddMoreFlow(false);
              setExitPositionId(null);
              setChainContract(null);
            }}
          />
        )}`;
    
    code = code.substring(0, orderBlockStartIdx) + tradeSheetJsx + code.substring(orderBlockEndIdx);
  }
}

fs.writeFileSync(file, code);
