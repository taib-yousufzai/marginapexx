const fs = require('fs');
const path = require('path');

const pages = ['watchlist', 'basket', 'buysegment', 'history', 'order', 'position'];

pages.forEach(page => {
  const filePath = path.join(__dirname, 'app', page, 'page.tsx');
  if (!fs.existsSync(filePath)) return;
  
  let content = fs.readFileSync(filePath, 'utf8');

  // Currently, the footer is injected like this:
  // </div>
  //
  // <!-- GLOBAL FOOTER SECTION -->
  // ...
  //   </div>
  //   </div>
  //
  // <!-- COMPACT PROFESSIONAL BOTTOM SHEET -->
  //
  // Which means it falls outside the main wrapper.

  // Let's remove the footer entirely from the current position.
  const footerRegex = /<!-- GLOBAL FOOTER SECTION -->[\s\S]*?<div class="footer-nav">[\s\S]*?<\/div>\s*<\/div>\n\s*<\/div>/;
  const match = content.match(footerRegex);
  
  if (match) {
    const footerHtml = match[0];
    content = content.replace(footerHtml, '');
    
    // Now we must inject it back INSIDE the main wrapper.
    // The main wrapper is the top-level div in the __html string (e.g. <div class="mobile-app">).
    // The easiest way to do this is to locate the exact class name of the main wrapper,
    // find where its main content ends, and insert before the </div> that closes it.
    
    // Instead of regex gymnastics, let's look for specific patterns:
    
    if (page === 'watchlist') {
       // Watchlist ends with:
       // <div class="watchlist-cards-container"><div id="watchlistMobileContainer"></div></div>
       //         </div>
       //     </div>
       // </div>
       const target = '<div class="watchlist-cards-container"><div id="watchlistMobileContainer"></div></div>\n        </div>\n    </div>';
       content = content.replace(target, target + '\n\n  ' + footerHtml);
    }
    else if (page === 'basket') {
       // Basket ends with:
       //           <span class="total-value" id="summaryTotalValue">$0.00</span>
       //       </div>
       //       <button class="place-order-btn" id="placeSelectedOrderBtn" disabled>Place Order (0)</button>
       //   </div>
       // </div>
       const target = '<button class="place-order-btn" id="placeSelectedOrderBtn" disabled>Place Order (0)</button>\n    </div>';
       content = content.replace(target, target + '\n\n  ' + footerHtml);
    }
    else if (page === 'buysegment') {
       // Buysegment ends with:
       //         </div>
       //     </div>
       // </div>
       // And before that is <div class="segment-grid" id="segmentGrid"></div>
       const target = '<div class="segment-grid" id="segmentGrid"></div>\n        </div>\n    </div>';
       content = content.replace(target, target + '\n\n  ' + footerHtml);
    }
    else if (page === 'history') {
       // History ends with:
       //   <div class="history-list" id="historyList"></div>
       // </div>
       const target = '<div class="history-list" id="historyList"></div>';
       content = content.replace(target, target + '\n\n  ' + footerHtml);
    }
    else if (page === 'order') {
       // Order ends with:
       //   <div class="orders-container" id="orders-container"></div>
       // </div>
       const target = '<div class="orders-container" id="orders-container"></div>';
       content = content.replace(target, target + '\n\n  ' + footerHtml);
    }
    else if (page === 'position') {
       // Position ends with:
       //     <div class="positions-list" id="positionsList"></div>
       // </div>
       const target = '<div class="positions-list" id="positionsList"></div>\n  </div>';
       content = content.replace(target, target + '\n\n  ' + footerHtml);
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`Fixed footer for ${page}`);
  } else {
    console.log(`Could not find footer in ${page}`);
  }
});
