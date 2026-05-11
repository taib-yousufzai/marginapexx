const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../app/admin-layout.css');

const mwCSS = `
/* ===== MARKETWATCH MOBILE FIXES ===== */
@media (max-width: 768px) {
  .adm-mw-tabs {
    overflow-x: auto !important;
    white-space: nowrap !important;
    flex-wrap: nowrap !important;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 5px;
  }
  
  .adm-mw-tabs::-webkit-scrollbar {
    height: 3px;
  }
  .adm-mw-tabs::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 10px;
  }

  .adm-mw-table-wrap {
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch;
    width: 100%;
    display: block;
    border-radius: 8px;
  }

  .adm-mw-table {
    width: 100%;
    min-width: 700px !important; /* Force scroll for all columns */
  }

  .adm-mw-search-row {
    flex-direction: column;
    align-items:stretch !important;
    gap: 10px;
  }
  
  .adm-mw-search-wrap {
    width: 100% !important;
  }

  .adm-mw-trash {
    width: 100%;
    justify-content: center;
  }
}
`;

fs.appendFileSync(filePath, mwCSS, 'utf8');
console.log('MarketWatch mobile responsiveness added!');
