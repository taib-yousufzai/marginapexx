import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pages = ['watchlist', 'basket', 'buysegment', 'history', 'order', 'position'];

pages.forEach(page => {
   const filePath = path.join(__dirname, 'app', page, 'page.tsx');
   if (!fs.existsSync(filePath)) return;

   let content = fs.readFileSync(filePath, 'utf8');


   // Let's remove the footer entirely from the current position.
   const footerRegex = /<!-- GLOBAL FOOTER SECTION -->[\s\S]*?<div class="footer-nav">[\s\S]*?<\/div>\s*<\/div>\n\s*<\/div>/;
   const match = content.match(footerRegex);

   if (match) {
      const footerHtml = match[0];
      content = content.replace(footerHtml, '');

      // Now we must inject it back INSIDE the main wrapper.
      // The main wrapper is the top-level div in the __html string (e.g. <div class="mobile-app">).

      if (page === 'watchlist') {
         const target = '<div class="watchlist-cards-container"><div id="watchlistMobileContainer"></div></div>\n        </div>\n    </div>';
         content = content.replace(target, target + '\n\n  ' + footerHtml);
      }
      else if (page === 'basket') {
         const target = '<button class="place-order-btn" id="placeSelectedOrderBtn" disabled>Place Order (0)</button>\n    </div>';
         content = content.replace(target, target + '\n\n  ' + footerHtml);
      }
      else if (page === 'buysegment') {
         const target = '<div class="segment-grid" id="segmentGrid"></div>\n        </div>\n    </div>';
         content = content.replace(target, target + '\n\n  ' + footerHtml);
      }
      else if (page === 'history') {
         const target = '<div class="history-list" id="historyList"></div>';
         content = content.replace(target, target + '\n\n  ' + footerHtml);
      }
      else if (page === 'order') {
         const target = '<div class="orders-container" id="orders-container"></div>';
         content = content.replace(target, target + '\n\n  ' + footerHtml);
      }
      else if (page === 'position') {
         const target = '<div class="positions-list" id="positionsList"></div>\n  </div>';
         content = content.replace(target, target + '\n\n  ' + footerHtml);
      }

      fs.writeFileSync(filePath, content);
      console.log(`Fixed footer for ${page}`);
   } else {
      console.log(`Could not find footer in ${page}`);
   }
});
